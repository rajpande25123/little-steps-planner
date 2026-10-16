-- Little Steps Planner: one private JSON state document per authenticated user.
-- Run the complete script in Supabase Dashboard > SQL Editor.
create table if not exists public.planner_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.planner_data enable row level security;

-- Remove broad policies if this script is run more than once.
drop policy if exists "Users can read their own planner" on public.planner_data;
drop policy if exists "Users can insert their own planner" on public.planner_data;
drop policy if exists "Users can update their own planner" on public.planner_data;
drop policy if exists "Users can delete their own planner" on public.planner_data;

create policy "Users can read their own planner"
  on public.planner_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own planner"
  on public.planner_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own planner"
  on public.planner_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own planner"
  on public.planner_data for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.planner_data to authenticated;
revoke all on public.planner_data from anon;

-- Optional but recommended for live updates between devices.
do $$ begin
  alter publication supabase_realtime add table public.planner_data;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; enable Realtime for planner_data in Database > Replication.';
end $$;
