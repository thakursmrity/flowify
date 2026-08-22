# Tend Chat MVP

A minimal, working, web-based 1:1 chat app. Sign up, get a shareable "Tend ID"
(like `AB-1234`), add someone else by their ID, and message them live.

This is a real MVP, not a mockup — it runs on an actual database with real
accounts and real-time messages. It's intentionally small: one-to-one chat
only, no groups/channels, no file attachments, no read receipts. Those are
natural next features once this is live and working (see "Where to go next"
below).

## How it's built

- **Frontend:** React + Vite, plain CSS (no UI framework), in `src/`.
- **Backend:** [Supabase](https://supabase.com) — a hosted Postgres database
  plus built-in user accounts (Auth) and live updates (Realtime). There is no
  separate backend server to write or run; the React app talks to Supabase
  directly using a public "anon" key that's safe to ship in frontend code,
  because every table has row-level security rules controlling exactly what
  each signed-in user is allowed to read or write (see `supabase/schema.sql`
  for those rules, with comments).

This split (frontend in this repo, backend as a hosted service) is deliberate:
it means a developer picking this up later only needs to look in one place for
UI code, and the database rules are all in one plain SQL file rather than
scattered across custom API endpoints.

## Project layout

```
src/
  supabaseClient.js       - connects to Supabase using your project's URL/key
  App.jsx                 - top-level routing: auth -> profile setup -> chat
  components/
    Auth.jsx               - email/password sign up & log in
    ProfileSetup.jsx        - runs once after signup: pick a display name, get a Tend ID
    ContactList.jsx          - left sidebar: your ID, add-by-ID form, contact list
    ChatWindow.jsx            - right pane: message history + live updates + send box
supabase/
  schema.sql               - the entire database schema; run once in Supabase
.env.example                - template for your Supabase project keys
```

## Setup (about 10 minutes)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new
   project (pick any name/region, free tier is fine).
2. Wait ~2 minutes for it to finish provisioning.

### 2. Set up the database

1. In your Supabase project, open **SQL Editor** in the left sidebar.
2. Click **New query**, paste in the entire contents of
   `supabase/schema.sql`, and click **Run**.
3. That's it — this creates the `profiles`, `contacts`, and `messages`
   tables, sets up their access rules, and turns on realtime for messages.

### 3. Connect the app to your project

1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. In this project, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
4. Open `.env` and paste in your values:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

### 4. Turn off email confirmation (recommended for an MVP)

By default Supabase requires clicking a confirmation email before you can log
in. For a fast MVP that's usually unwanted friction:

1. In Supabase: **Authentication → Providers → Email**.
2. Turn off **Confirm email**.
3. Save.

(You can turn this back on later once you're ready for production use — it's
a good idea to have it on for a real launch.)

### 5. Run it locally

```
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Sign up with any
email/password, pick a display name, and you'll land in the chat screen with
your Tend ID shown in the sidebar. Open a second browser (or an incognito
window), sign up as a second user, and add the first user's Tend ID to chat
between them.

## Deploying it so it's live on the internet

Any static host that supports Vite works. The easiest is
[Vercel](https://vercel.com) or [Netlify](https://netlify.com):

1. Push this project to a GitHub repo.
2. In Vercel/Netlify, "Import" that repo as a new project. Both auto-detect
   Vite (build command `npm run build`, output directory `dist`).
3. Add the two environment variables from your `.env` file
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the host's project
   settings — same names, same values.
4. Deploy. You'll get a live `https://...` URL anyone can sign up and chat on.

There's no separate backend to deploy — Supabase is already hosted.

## Handing this off to a developer

Everything a developer needs is in this repo:

- `supabase/schema.sql` is the entire database — readable top to bottom, with
  comments explaining every table and rule.
- The frontend is plain React with no state-management library, no routing
  library, and no custom backend — just Supabase's client SDK
  (`@supabase/supabase-js`). Anyone comfortable with React can read the four
  files in `src/components/` in a few minutes.
- Give them access to the Supabase project (Project Settings → Team) rather
  than sharing the anon key over chat — Supabase supports inviting
  collaborators directly.

## Where to go next

Natural next features, roughly in order of effort:

- **Group chats / channels** — add a `conversations` table that both
  `messages` and multiple members reference, instead of the current direct
  `sender_id`/`receiver_id` columns.
- **Online/typing indicators** — Supabase Presence (part of Realtime) is
  built for exactly this.
- **Message read receipts.**
- **Push/email notifications for new messages** — a Supabase Edge Function
  triggered on `messages` insert.
- **Avatars/profile photos** — Supabase Storage for file uploads.
- **Merge into the full Tend app** — this chat feature was built as a
  standalone slice of the larger Tend product (planner, habits, goals,
  analytics); the contact/message model here (`profiles`, `contacts`,
  `messages`, Tend IDs) was designed to match the "circle" messaging concept
  from the full app's prototype, so it can be folded back in later.
