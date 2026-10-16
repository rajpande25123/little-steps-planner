# Little Steps Planner

A pastel-lavender responsive personal planner built with HTML, CSS and JavaScript. Includes the monthly calendar, daily tasks and unfinished-task carryover, routine checklist, English practice, Japanese N5, coding/revision timetable, ₹50-per-tiffin monthly tracker, and gym Monday–Saturday with Sunday as the only full rest day.

## 1. Configure Supabase cloud sync

The planner uses Supabase Auth plus a private JSON row per user. Each device must sign in to the same account to share the same planner data.

1. Open your Supabase project: `https://qppurydccxwtmuzckgvh.supabase.co`.
2. Go to **SQL Editor → New query**.
3. Open `supabase/schema.sql`, paste the entire file into the SQL editor and run it. The table has Row Level Security policies so authenticated users can only access their own row.
4. In `supabase-config.js`, replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE` with your Supabase **publishable** key. The Project URL is already filled in. Never use a `secret` or `service_role` key in the browser or APK.
5. In Supabase **Authentication → URL Configuration**, set the Site URL to `https://timemanger.vercel.app`. Add `https://timemanger.vercel.app/**` to Redirect URLs if your project settings require it.
6. Deploy the updated files to Vercel. For a static deployment, make sure `index.html`, `style.css`, `app.js`, and `supabase-config.js` are in the deployed project root (not nested one extra folder deep).
7. Open the site, create an account using the Cloud sync panel, and confirm your email if Supabase requests it. Sign in on your other devices using the same account.

The publishable key is designed to be visible in client apps; the security boundary is the database's RLS policies. Do not disable RLS. Do not share your database password or secret/service-role key.

### Data behavior

- Local browser storage remains enabled, so changes are saved locally as well.
- After signing in, the app loads the account's cloud state and uploads local state only when that account has no saved planner yet.
- Subsequent saves sync to Supabase; realtime updates can refresh the other signed-in devices.
- If the SQL table is not found, the status panel will tell you to run `supabase/schema.sql`.
- This version syncs the planner's tasks, tiffins, English practice, routine checkmarks and notes as one per-user JSON state document. Use one account across your devices.

## 2. Run locally

Use Node.js 20+ and a local server. For example:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. For cloud sync, configure `supabase-config.js` first.

## 3. Prepare the Android APK with Capacitor

Requirements: Node.js 20+, Android Studio, Android SDK, and a compatible JDK (Android Studio's bundled JDK is usually easiest).

From this folder:

```bash
npm install
npm run build
npm run android:add
npm run android:sync
npm run android:open
```

In Android Studio, wait for Gradle sync, then choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The debug APK is normally at `android/app/build/outputs/apk/debug/app-debug.apk`. This project scaffold does not itself contain a prebuilt APK; Android Studio compiles it on your computer. Build again after changing the web files.

The APK packages local web assets, while planner data syncs through Supabase over the internet. The browser and APK use the same account/database, but a future code update must be rebuilt into the APK.

## 4. Deploying updates to Vercel

Commit the configured static files and deploy the project root in Vercel. If your GitHub repository currently has these files inside `cute_productivity_calendar/`, either set that as the Vercel Root Directory or move the app files to the repository root. Do not commit database passwords or Supabase secret/service-role keys.

## Privacy and security

RLS limits each signed-in user to their own `planner_data` row. The publishable key alone is not a login and must never be treated as authorization. Review the SQL policies before production use.
