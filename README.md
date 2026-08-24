# Flowify

A working productivity app: a daily planner (tasks, habits, goals) plus messaging,
one-to-one "Current" conversations and group "Sync" conversations, all live on a
real database with real accounts.


This isn't a mockup, everything described below actually reads and writes to a
real Supabase project. It's intentionally still an MVP: no file attachments, no
read receipts, no notifications yet, no way to add someone to an existing Sync
after it's created. Those are natural next steps once this is live (see "Where
to go next" below).

## How it's built

- **Frontend:** React + Vite, plain CSS (no UI framework), in `src/`.
- **Backend:** [Supabase](https://supabase.com), a hosted Postgres database
  plus built-in user accounts (Auth) and live updates (Realtime). There's no
  separate backend server to write or run; the React app talks to Supabase
  directly using a public "anon" (now called "publishable") key that's safe
  to ship in frontend code, because every table has row-level security rules
  controlling exactly what each signed-in user is allowed to read or write
  (see `supabase/schema.sql` for those rules, with comments).


## Project layout

```
src/
  supabaseClient.js       - connects to Supabase using your project's URL/key
  App.jsx                 - top-level routing: auth -> profile setup -> main app
  components/
    Auth.jsx               - email/password sign up & log in
    ProfileSetup.jsx        - runs once after signup: pick a display name, get a Flow ID
    Sidebar.jsx              - left nav: Today / Tasks & Habits / Goals / Current & Sync
    Today.jsx                 - today's tasks + a quick habit check-in
    TasksHabits.jsx             - full task list and habit tracker with streaks
    Goals.jsx                    - longer-term goals
    MessagesPanel.jsx             - your circle, your Current/Sync list, starting new ones
    ConversationWindow.jsx         - message history + live updates + send box
supabase/
  schema.sql               - the entire database schema; run once in Supabase
.env.example                - template for your Supabase project keys
```

## The messaging model, in plain terms

- **Your circle**: add someone by their Flow ID (like `AB-1234`), it's added
  both ways so you show up in their circle too.
- **Current**: click anyone in your circle to open (or reopen) a 1:1
  conversation with them.
- **Sync**: click "+ New Sync," name it, and check off who from your circle
  to include, that creates a group conversation everyone selected can see.

Under the hood, both are the same `conversations` / `conversation_members` /
`messages` tables, a conversation is just marked `type = 'direct'` or
`type = 'group'`. See `supabase/schema.sql` for the full data model and the
functions (`start_direct_conversation`, `create_group_conversation`) that
create them safely.

## Setup (about 10 minutes)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new
   project (pick any name/region, free tier is fine).
2. Wait ~2 minutes for it to finish provisioning.

### 2. Set up the database

1. In your Supabase project, open **SQL Editor** in the left sidebar.
2. Click **New query**, paste in the entire contents of
   `supabase/schema.sql`, and click **Run**.
3. That creates every table this app uses (profiles, contacts, conversations,
   messages, tasks, habits, habit logs, goals), their access rules, and turns
   on realtime for messages.

Note: this script starts with `drop table if exists ...`, so re-running it
later will wipe existing data. That's fine for early testing; just don't run
it again once you have real users and data you want to keep.

### 3. Connect the app to your project

1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** and the **Publishable** (formerly "anon public")
   key.
3. In this project, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
4. Open `.env` and paste in your values:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

### 4. Turn off email confirmation (recommended for an MVP)

By default Supabase requires clicking a confirmation email before you can log
in, and that email links to `localhost:3000` unless you configure it, which
breaks for anyone not running the app locally. For a fast MVP, turn it off:

1. In Supabase: **Authentication → Providers → Email**.
2. Turn off **Confirm email**.
3. Save.

(Turn this back on, and set your real **Site URL** under **Authentication →
URL Configuration**, once you're ready for a real launch.)

### 5. Run it locally

```
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Sign up, pick a
display name, and you'll land on Today with your Flow ID in the sidebar.

## Deploying it so it's live on the internet

1. Push this project to a GitHub repo (root of the repo should have `src/`,
   `index.html`, `package.json`, etc. directly inside it, not nested one
   folder deeper, that trips up the build).
2. In [Vercel](https://vercel.com) or [Netlify](https://netlify.com),
   "Import" that repo as a new project. Both auto-detect Vite (build command
   `npm run build`, output directory `dist`).
3. Add the two environment variables from your `.env` file
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the host's project
   settings, same names, same values.
4. Deploy. You'll get a live `https://...` URL, or point your own domain at
   it from the host's Domains settings.

There's no separate backend to deploy, Supabase is already hosted.

## Handing this off to a developer

- `supabase/schema.sql` is the entire database, readable top to bottom, with
  comments explaining every table, function, and rule.
- The frontend is plain React with no state-management library, no routing
  library, and no custom backend, just Supabase's client SDK
  (`@supabase/supabase-js`).
- Give them access to the Supabase project (Project Settings → Team) rather
  than sharing the key over chat, Supabase supports inviting collaborators
  directly.

## Where to go next

Roughly in order of effort:

- **Adding members to an existing Sync** (right now a Sync's membership is
  fixed at creation).
- **Online/typing indicators** — Supabase Presence (part of Realtime).
- **Message read receipts.**
- **Push/email notifications** — a Supabase Edge Function triggered on
  `messages` insert.
- **Avatars/profile photos** — Supabase Storage for file uploads.
- **A Progress dashboard** — charts for tasks completed, habit consistency
  over time, and focus time, sitting on top of the same `tasks` and
  `habit_logs` tables that already exist.
- **Linking tasks to goals in the UI** — the database already supports it
  (`tasks.goal_id`), there's just no picker in the Tasks screen yet.
