-- Tend Chat MVP — database schema
-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query → paste → Run)

-- 1. PROFILES
-- One row per user, created right after they sign up. Holds their friendly
-- "Tend ID" (e.g. AB-1234) that other people use to add them as a contact.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tend_id text unique not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Any logged-in user can look up any profile (needed so "add by ID" can find
-- people, and so chat screens can show the other person's name).
create policy "profiles are readable by any logged-in user"
  on profiles for select
  using (auth.uid() is not null);

-- You can only create/update your own profile row.
create policy "users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);


-- 2. CONTACTS
-- A row means "owner_id has contact_id in their contact list." When someone
-- adds a person by ID, we create the relationship in both directions so it
-- shows up for both people (see the add_contact() function below).
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id)
);

alter table contacts enable row level security;

create policy "users can see their own contact list"
  on contacts for select
  using (auth.uid() = owner_id);


-- 3. MESSAGES
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table messages enable row level security;

create policy "users can read messages they sent or received"
  on messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "users can send messages as themselves"
  on messages for insert
  with check (auth.uid() = sender_id);

-- Turn on realtime updates for the messages table so both people see new
-- messages instantly without refreshing.
alter publication supabase_realtime add table messages;


-- 4. add_contact(): the only way rows get added to `contacts`.
-- Runs with elevated privileges (security definer) so it can safely create
-- the relationship in both directions, without letting anyone insert
-- arbitrary rows into someone else's contact list directly.
create or replace function public.add_contact(target_tend_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_id uuid;
begin
  if caller_id is null then
    raise exception 'Not signed in';
  end if;

  select id into target_id from profiles where tend_id = upper(trim(target_tend_id));

  if target_id is null then
    raise exception 'No one has that Tend ID';
  end if;

  if target_id = caller_id then
    raise exception 'You cannot add yourself';
  end if;

  insert into contacts (owner_id, contact_id) values (caller_id, target_id)
    on conflict (owner_id, contact_id) do nothing;
  insert into contacts (owner_id, contact_id) values (target_id, caller_id)
    on conflict (owner_id, contact_id) do nothing;
end;
$$;

grant execute on function public.add_contact(text) to authenticated;
