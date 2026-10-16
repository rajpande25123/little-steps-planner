(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORAGE_KEY = "littleStepsPlanner.v1";
  const TIF_FIN_PRICE = 50;
  const now = new Date();
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const parseKey = key => { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d,12); };
  const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const monthName = d => d.toLocaleDateString("en-US",{month:"long"});
  const longDate = d => d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  const shortDate = d => d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const defaultTasks = () => [
    {id:uid(),text:"Revise today's college topics",category:"College",done:false,priority:true},
    {id:uid(),text:"Practise coding for 75 minutes",category:"Coding",done:false,priority:true},
    {id:uid(),text:"Speak English for 10 minutes",category:"English",done:false,priority:true},
    {id:uid(),text:"Japanese N5 — 45 minutes",category:"Japanese",done:false,priority:false},
    {id:uid(),text:"Review notes and plan tomorrow",category:"College",done:false,priority:false}
  ];
  function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`); }
  function freshState(){ return {tasks:{},tiffins:{},englishDone:{},notes:{},routines:{}}; }
  function loadState(){ try { return Object.assign(freshState(),JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")); } catch { return freshState(); } }
  let state = loadState();
  // Migrate old per-day routine checklists into the single syncable planner state.
  try { for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith("routine:")){const day=key.slice(8);state.routines[day]=JSON.parse(localStorage.getItem(key)||"{}");}} } catch {}
  let cloudClient = null;
  let currentUser = null;
  let cloudChannel = null;
  let cloudSaveTimer = null;
  let applyingCloudState = false;
  let today = new Date(); today.setHours(12,0,0,0);
  let selectedDate = new Date(today);
  let calendarMonth = new Date(today.getFullYear(),today.getMonth(),1,12);
  let tiffinMonth = new Date(today.getFullYear(),today.getMonth(),1,12);
  let taskFilter = "all";
  let toastTimer;
  function save(){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    if(currentUser && !applyingCloudState) scheduleCloudSave();
  }
  function setCloudStatus(message){const el=$("#cloud-status");if(el)el.textContent=message;}
  function updateCloudAuthUI(){
    const signedIn=!!currentUser;
    $("#cloud-sign-in").classList.toggle("hidden",signedIn);
    $("#cloud-sign-up").classList.toggle("hidden",signedIn);
    $("#cloud-sign-out").classList.toggle("hidden",!signedIn);
    $("#cloud-email").classList.toggle("hidden",signedIn);
    $("#cloud-password").classList.toggle("hidden",signedIn);
    if(signedIn){$("#cloud-email").value=currentUser.email||"";setCloudStatus(`Signed in as ${currentUser.email||"your account"}. Cloud sync is enabled on this device.`);}
    else setCloudStatus(cloudClient?"Sign in to sync your planner securely between devices.":"Add your Supabase publishable key in supabase-config.js to enable cloud sync.");
  }
  function scheduleCloudSave(){
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer=setTimeout(async()=>{
      if(!cloudClient||!currentUser||applyingCloudState)return;
      const snapshot=JSON.parse(JSON.stringify(state));
      const {error}=await cloudClient.from("planner_data").upsert({user_id:currentUser.id,state:snapshot,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(error){setCloudStatus(`Local save is safe; cloud sync needs attention: ${error.message}`);}
      else setCloudStatus(`Synced for ${currentUser.email||"your account"} · just now`);
    },450);
  }
  function applyCloudState(remoteState){
    applyingCloudState=true;
    state=Object.assign(freshState(),remoteState||{});
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    applyingCloudState=false;
    renderAll();renderDailySchedule();
  }
  async function connectCloudUser(user){
    currentUser=user;updateCloudAuthUI();
    if(!user||!cloudClient)return;
    setCloudStatus("Loading your saved planner…");
    const {data,error}=await cloudClient.from("planner_data").select("state,updated_at").eq("user_id",user.id).maybeSingle();
    if(error){setCloudStatus(`Cloud database setup needed: ${error.message}. Run supabase/schema.sql in the Supabase SQL Editor.`);return;}
    if(data&&data.state){applyCloudState(data.state);setCloudStatus(`Planner loaded from cloud · ${user.email||"signed in"}`);}
    else {scheduleCloudSave();setCloudStatus("First sync started. Your current planner will be saved to this account.");}
    if(cloudChannel){await cloudClient.removeChannel(cloudChannel);cloudChannel=null;}
    cloudChannel=cloudClient.channel(`planner-data-${user.id}`).on("postgres_changes",{event:"*",schema:"public",table:"planner_data",filter:`user_id=eq.${user.id}`},payload=>{
      const incoming=payload.new&&payload.new.state;
      if(incoming&&JSON.stringify(incoming)!==JSON.stringify(state)){applyCloudState(incoming);setCloudStatus("Updated from another device · synced ♡");}
    }).subscribe();
  }
  function initCloudSync(){
    const cfg=window.LITTLE_STEPS_CONFIG||{};
    const key=cfg.supabasePublishableKey||"";
    if(window.supabase&&cfg.supabaseUrl&&key&&!key.includes("PASTE_YOUR")){
      cloudClient=window.supabase.createClient(cfg.supabaseUrl,key);
      cloudClient.auth.onAuthStateChange((event,session)=>{
        if(event==="INITIAL_SESSION"||event==="SIGNED_IN"){
          if(session&&session.user)connectCloudUser(session.user);
          else {currentUser=null;updateCloudAuthUI();}
        } else if(event==="SIGNED_OUT"){currentUser=null;if(cloudChannel){cloudClient.removeChannel(cloudChannel);cloudChannel=null;}updateCloudAuthUI();}
      });
      updateCloudAuthUI();
    } else updateCloudAuthUI();
    $("#cloud-auth-form").addEventListener("submit",async e=>{
      e.preventDefault();if(!cloudClient){setCloudStatus("First add your Supabase publishable key to supabase-config.js, then reload.");return;}
      const email=$("#cloud-email").value.trim(),password=$("#cloud-password").value;
      $("#cloud-sign-in").disabled=true;
      const {error}=await cloudClient.auth.signInWithPassword({email,password});
      $("#cloud-sign-in").disabled=false;
      if(error)setCloudStatus(error.message);else setCloudStatus("Signed in. Loading your planner…");
    });
    $("#cloud-sign-up").addEventListener("click",async()=>{
      if(!cloudClient){setCloudStatus("First add your Supabase publishable key to supabase-config.js, then reload.");return;}
      const email=$("#cloud-email").value.trim(),password=$("#cloud-password").value;
      if(!email||password.length<8){setCloudStatus("Enter your email and a password of at least 8 characters.");return;}
      const {data,error}=await cloudClient.auth.signUp({email,password});
      if(error)setCloudStatus(error.message);else if(data.session)setCloudStatus("Account created. Signing you in…");else setCloudStatus("Account created. Check your email to confirm it, then sign in.");
    });
    $("#cloud-sign-out").addEventListener("click",async()=>{if(cloudClient){const {error}=await cloudClient.auth.signOut();if(error)setCloudStatus(error.message);}});
  }
  function getTasks(key){ if(!state.tasks[key]) state.tasks[key]=[]; return state.tasks[key]; }
  function rolloverTasks(){
    const todayKey=dateKey(today);
    const keys=Object.keys(state.tasks).filter(k=>k<todayKey).sort();
    keys.forEach(key=>{
      const unfinished=(state.tasks[key]||[]).filter(t=>!t.done);
      if(!unfinished.length)return;
      const current=getTasks(todayKey);
      unfinished.forEach(task=>{
        if(!current.some(t=>t.id===task.id)){
          current.push({...task,done:false,rolledFrom:key});
        }
      });
      state.tasks[key]=state.tasks[key].filter(t=>t.done);
    });
    save();
  }
  function toast(message){ const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2300); }
  function setView(view){
    $$(".view").forEach(el=>el.classList.toggle("active",el.id===`${view}-view`));
    $$(".nav-btn").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    if(view==="calendar") renderCalendar();
    if(view==="tasks") renderTaskManager();
    if(view==="tiffin") renderTiffin();
    if(view==="timetable") renderDailySchedule();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function renderDate(){
    $("#hero-weekday").textContent=today.toLocaleDateString("en-US",{weekday:"long"}).toUpperCase();
    $("#hero-date").textContent=today.getDate();
    $("#hero-month").textContent=today.toLocaleDateString("en-US",{month:"long",year:"numeric"});
    $("#calendar-number").textContent=today.getDate();
    $("#today-short").textContent=shortDate(today);
    $("#footer-date").textContent=longDate(today);
    $("#greeting").innerHTML=`Today, one step at a time <span>♡</span>`;
    $("#english-done").checked=!!state.englishDone[dateKey(today)];
    const count=Number(state.tiffins[dateKey(today)]||0);
    $("#tiffin-one").checked=count>=1;$("#tiffin-two").checked=count>=2;
    $("#today-tiffin-total").textContent=`₹${count*TIF_FIN_PRICE}`;
  }
  function taskRow(task,key,compact=false){
    const row=document.createElement("div");row.className=`check-row${task.done?" completed":""}`;
    const cb=document.createElement("input");cb.type="checkbox";cb.checked=task.done;cb.setAttribute("aria-label",`Complete ${task.text}`);
    cb.addEventListener("change",()=>{const t=getTasks(key).find(x=>x.id===task.id);if(t)t.done=cb.checked;save();renderAll();});
    const label=document.createElement("div");label.className="check-label";label.textContent=task.text;
    const meta=document.createElement("span");meta.className="task-meta";meta.textContent=`${task.category||"Personal"}${task.rolledFrom?" · carried forward":""}`;label.append(meta);
    row.append(cb,label);
    if(!compact){const del=document.createElement("button");del.className="task-delete";del.textContent="×";del.title="Delete task";del.addEventListener("click",()=>{state.tasks[key]=getTasks(key).filter(t=>t.id!==task.id);save();renderAll();toast("Task removed");});row.append(del);}
    return row;
  }
  function renderProgress(){
    const tasks=getTasks(dateKey(today));const total=tasks.length;const done=tasks.filter(t=>t.done).length;const pct=total?Math.round(done/total*100):0;
    $("#progress-percent").textContent=`${pct}%`;$("#progress-ring").style.setProperty("--progress",`${pct*3.6}deg`);
    $("#progress-caption").textContent=pct===100&&total?"You did it! Be proud of yourself.":pct>=50?"Look at you making progress!":"Every little effort counts.";
    $("#tiny-progress-fill").style.width=`${pct}%`;$("#progress-count").textContent=`${done} of ${total}`;
  }
  function renderHome(){
    const tasks=getTasks(dateKey(today));
    const list=$("#home-priority-list");list.innerHTML="";
    const top=[...tasks.filter(t=>t.priority),...tasks.filter(t=>!t.priority)].slice(0,3);
    if(!top.length){list.innerHTML='<p class="muted small">No tasks yet. Add a little step to start.</p>';}
    else top.forEach(t=>list.append(taskRow(t,dateKey(today),true)));
    renderProgress();renderDate();
  }
  function addTask(text,category="Personal",key=dateKey(today)){
    text=text.trim();if(!text)return false;
    const tasks=getTasks(key);tasks.push({id:uid(),text,category,done:false,priority:tasks.filter(t=>t.priority).length<3});
    save();renderAll();return true;
  }
  function renderTaskManager(){
    const key=dateKey(today);const list=$("#task-manager-list");list.innerHTML="";
    const tasks=getTasks(key).filter(t=>taskFilter==="all"||(taskFilter==="open"&&!t.done)||(taskFilter==="done"&&t.done));
    tasks.forEach(t=>list.append(taskRow(t,key,false)));
    $("#empty-tasks").classList.toggle("hidden",tasks.length>0);
    $$(".filter-btn").forEach(b=>b.classList.toggle("active",b.dataset.filter===taskFilter));
  }
  function renderSelectedDay(){
    const key=dateKey(selectedDate);$("#selected-day-title").textContent=longDate(selectedDate);
    const container=$("#selected-day-content");container.innerHTML="";
    const tasks=state.tasks[key]||[];
    if(!tasks.length){container.innerHTML='<div class="selected-empty">No tasks recorded for this day yet. You can add tasks from the to-do list. ♡</div>';return;}
    const list=document.createElement("div");list.className="check-list";
    tasks.forEach(t=>list.append(taskRow(t,key,false)));container.append(list);
  }
  function renderCalendar(){
    $("#calendar-month-title").textContent=monthName(calendarMonth).toUpperCase();$("#calendar-year-title").textContent=calendarMonth.getFullYear();
    const grid=$("#month-grid");grid.innerHTML="";
    ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].forEach(day=>{const el=document.createElement("div");el.className="weekday";el.textContent=day;grid.append(el);});
    const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1,12);const days=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0,12).getDate();
    for(let i=0;i<first.getDay();i++){const blank=document.createElement("div");blank.className="day-cell empty";grid.append(blank);}
    for(let n=1;n<=days;n++){
      const d=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),n,12),key=dateKey(d),tasks=state.tasks[key]||[];
      const cell=document.createElement("button");cell.className="day-cell";cell.type="button";
      if(key===dateKey(today))cell.classList.add("today");if(key===dateKey(selectedDate))cell.classList.add("selected");
      const num=document.createElement("span");num.className="day-number";num.textContent=n;cell.append(num);
      if(tasks.length){const marker=document.createElement("span");marker.className="day-marker";if(tasks.every(t=>t.done))marker.classList.add("done");cell.append(marker);const label=document.createElement("span");label.className="day-label";label.textContent=tasks.find(t=>!t.done)?.text||"All done ♡";cell.append(label);}
      cell.addEventListener("click",()=>{selectedDate=d;renderCalendar();renderSelectedDay();});grid.append(cell);
    }
    renderSelectedDay();
  }
  function renderTiffin(){
    $("#tiffin-month-title").textContent=`${monthName(tiffinMonth).toUpperCase()} ${tiffinMonth.getFullYear()}`;
    const grid=$("#tiffin-month-grid");grid.innerHTML="";
    ["S","M","T","W","T","F","S"].forEach(x=>{const h=document.createElement("div");h.className="weekday";h.textContent=x;grid.append(h);});
    const first=new Date(tiffinMonth.getFullYear(),tiffinMonth.getMonth(),1,12),days=new Date(tiffinMonth.getFullYear(),tiffinMonth.getMonth()+1,0,12).getDate();
    for(let i=0;i<first.getDay();i++){const b=document.createElement("div");grid.append(b);}
    let count=0,recorded=0;
    for(let n=1;n<=days;n++){
      const d=new Date(tiffinMonth.getFullYear(),tiffinMonth.getMonth(),n,12),key=dateKey(d),num=Number(state.tiffins[key]||0);count+=num;if(Object.prototype.hasOwnProperty.call(state.tiffins,key))recorded++;
      const btn=document.createElement("button");btn.className="tiffin-day";if(key===dateKey(today))btn.classList.add("today");if(key===dateKey(selectedDate))btn.classList.add("selected");
      btn.innerHTML=`<span class="day-num">${n}</span><span class="tiffin-count ${num===0?"none":""}">${num?`${num} · ₹${num*TIF_FIN_PRICE}`:"—"}</span>`;
      btn.addEventListener("click",()=>{selectedDate=d;renderTiffin();});grid.append(btn);
    }
    $("#month-tiffin-count").textContent=count;$("#month-tiffin-cost").textContent=`₹${count*TIF_FIN_PRICE}`;$("#month-tiffin-days").textContent=recorded;
    const selectedCount=Number(state.tiffins[dateKey(selectedDate)]||0);
    $("#tiffin-selected-title").textContent=longDate(selectedDate);$("#selected-tiffin-cost").textContent=`₹${selectedCount*TIF_FIN_PRICE}`;
    $$(".tiffin-option").forEach(btn=>btn.classList.toggle("selected",Number(btn.dataset.count)===selectedCount));
  }
  function renderAll(){renderHome();renderTaskManager();if($("#calendar-view").classList.contains("active"))renderCalendar();if($("#tiffin-view").classList.contains("active"))renderTiffin();}
  const routineItems = ["wake","japanese","breakfast","revision","commute","dinner","coding","english","review","sleep"];
  function routineKey(){return dateKey(today);}
  function readRoutine(){return state.routines[routineKey()]||{};}
  function renderDailySchedule(){
    const done=readRoutine();
    $$("[data-routine]").forEach(input=>{input.checked=!!done[input.dataset.routine];});
    const count=routineItems.filter(k=>done[k]).length;
    const fill=$("#routine-progress-fill");if(fill)fill.style.width=`${Math.round(count/routineItems.length*100)}%`;
    const label=$("#routine-progress-label");if(label)label.textContent=`${count} of ${routineItems.length} routine blocks complete`;
    const dateLabel=$("#routine-date-label");if(dateLabel)dateLabel.textContent=shortDate(today);
  }
  $$("[data-routine]").forEach(input=>input.addEventListener("change",()=>{
    const done=readRoutine();done[input.dataset.routine]=input.checked;state.routines[routineKey()]=done;save();renderDailySchedule();
  }));

  const prompts=[
    "Introduce yourself and describe what you learned today.",
    "Explain your favourite app and why you like it.",
    "Talk for one minute about a challenge you solved.",
    "Describe your daily routine in simple English.",
    "Explain your current coding project as if to a friend.",
    "What is one goal you want to achieve this month?",
    "Summarize something interesting you learned in class.",
    "Practise answering: 'Tell me about yourself.'"
  ];
  $("#new-prompt").addEventListener("click",()=>{let next=prompts[Math.floor(Math.random()*prompts.length)];$("#english-prompt").textContent=next;});
  $("#english-done").addEventListener("change",()=>{state.englishDone[dateKey(today)]=$("#english-done").checked;save();toast($("#english-done").checked?"Lovely! English practice logged ♡":"English practice unchecked");});
  function recordTiffin(count,key=dateKey(today)){if(count===0)delete state.tiffins[key];else state.tiffins[key]=count;save();renderAll();}
  $("#tiffin-one").addEventListener("change",()=>{const n=$("#tiffin-one").checked?Math.max(1,Number(state.tiffins[dateKey(today)]||0)):0;recordTiffin(n);});
  $("#tiffin-two").addEventListener("change",()=>{const n=$("#tiffin-two").checked?2:(Number(state.tiffins[dateKey(today)]||0)>=2?1:0);recordTiffin(n);});
  $$(".tiffin-option").forEach(btn=>btn.addEventListener("click",()=>{recordTiffin(Number(btn.dataset.count),dateKey(selectedDate));toast("Tiffin record saved ♡");}));
  $("#prev-month").addEventListener("click",()=>{calendarMonth.setMonth(calendarMonth.getMonth()-1);renderCalendar();});
  $("#next-month").addEventListener("click",()=>{calendarMonth.setMonth(calendarMonth.getMonth()+1);renderCalendar();});
  $("#tiffin-prev-month").addEventListener("click",()=>{tiffinMonth.setMonth(tiffinMonth.getMonth()-1);renderTiffin();});
  $("#tiffin-next-month").addEventListener("click",()=>{tiffinMonth.setMonth(tiffinMonth.getMonth()+1);renderTiffin();});
  $("#selected-day-today").addEventListener("click",()=>{selectedDate=new Date(today);calendarMonth=new Date(today.getFullYear(),today.getMonth(),1,12);renderCalendar();});
  $("#today-pill").addEventListener("click",()=>{today=new Date();today.setHours(12,0,0,0);selectedDate=new Date(today);calendarMonth=new Date(today.getFullYear(),today.getMonth(),1,12);tiffinMonth=new Date(today.getFullYear(),today.getMonth(),1,12);rolloverTasks();renderAll();renderDailySchedule();setView("home");});
  $("#add-task-button").addEventListener("click",()=>{const input=$("#new-task-input");if(addTask(input.value,$("#task-category").value)){input.value="";toast("Task added to your day ♡");}});
  $("#new-task-input").addEventListener("keydown",e=>{if(e.key==="Enter")$("#add-task-button").click();});
  $("#add-task-home").addEventListener("click",()=>{setView("tasks");$("#new-task-input").focus();});
  $$(".filter-btn").forEach(btn=>btn.addEventListener("click",()=>{taskFilter=btn.dataset.filter;renderTaskManager();}));
  $$(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
  $$("[data-go]").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.go)));
  // Update the current date on return to the app, then roll unfinished tasks forward.
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){const d=new Date();d.setHours(12,0,0,0);if(dateKey(d)!==dateKey(today)){today=d;selectedDate=new Date(today);calendarMonth=new Date(today.getFullYear(),today.getMonth(),1,12);tiffinMonth=new Date(today.getFullYear(),today.getMonth(),1,12);rolloverTasks();renderAll();renderDailySchedule();}}});
  // Starter tasks are created once so the app is useful on first launch.
  if(!Object.keys(state.tasks).length)state.tasks[dateKey(today)]=defaultTasks();
  rolloverTasks();
  renderAll();
  renderDailySchedule();
  initCloudSync();
})();