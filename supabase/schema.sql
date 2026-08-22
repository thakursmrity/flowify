-- Flowify — database schema
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run)
--
-- This is a full rebuild (drops and recreates everything). That's intentional
-- for this stage: Flowify grew from a 1:1-only chat model to conversations
-- (Current = 1:1, Sync = group) plus Tasks, Habits, and Goals, and the
-- underlying tables changed shape too much for a simple patch. Running this
-- will reset any test accounts/messages you made while testing the earlier
-- version. If you already have real users you want to keep, stop and ask
-- before running this.

drop table if exists habit_logs cascade;
drop table if exists habits cascade;
drop table if exists tasks cascade;
drop table if exists goals cascade;
drop table if exists messages cascade;
drop table if exists conversation_members cascade;
drop table if exists conversations cascade;
drop table if exists contacts cascade;
drop table if exists profiles cascade;

drop function if exists public.add_contact(text);
drop function if exists public.is_conversation_member(uuid);
drop function if exists public.start_direct_conversation(text);
drop function if exists public.create_group_conversation(text, uuid[]);


-- ============================================================
-- 1. PROFILES
-- One row per user, created right after they sign up. Holds their friendly
-- "Flow ID" (e.g. AB-1234) that other people use to add them to their circle.
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  flow_id text unique not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by any logged-in user"
  on profiles for select
  using (auth.uid() is not null);

create policy "users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);


-- ============================================================
-- 2. CONTACTS ("your circle")
-- A row means "owner_id has contact_id in their circle." Added in both
-- directions at once by add_contact() below, so it shows up for both people.
-- ============================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id)
);

alter table contacts enable row level security;

create policy "users can see their own circle"
  on contacts for select
  using (auth.uid() = owner_id);


-- ============================================================
-- 3. CONVERSATIONS
-- A conversation is either a direct 1:1 ("Current") or a group ("Sync").
-- Membership lives in conversation_members. Who's allowed to see which
-- conversation/message is decided by is_conversation_member() below, so we
-- don't end up with a policy that has to query itself.
-- ============================================================
create table conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  name text, -- only used for group ("Sync") conversations
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table conversations enable row level security;
alter table conversation_members enable row level security;

create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

create policy "members can see their conversations"
  on conversations for select
  using (public.is_conversation_member(id));

create policy "members can see who's in their conversations"
  on conversation_members for select
  using (public.is_conversation_member(conversation_id));

-- No direct insert policies on conversations/conversation_members on purpose:
-- rows are only ever created through the two functions below, which run
-- with elevated privileges and do their own validation.


-- ============================================================
-- 4. MESSAGES
-- Belongs to a conversation (direct or group) instead of a fixed
-- sender/receiver pair, so the same table serves both Current and Sync.
-- ============================================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table messages enable row level security;

create policy "members can read messages in their conversations"
  on messages for select
  using (public.is_conversation_member(conversation_id));

create policy "members can send messages as themselves"
  on messages for insert
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id));

alter publication supabase_realtime add table messages;


-- ============================================================
-- 5. add_contact() / start_direct_conversation() / create_group_conversation()
-- Security-definer functions: the only sanctioned way to add to someone's
-- circle or create conversations, so we can enforce the rules (must know
-- the other person's Flow ID, can't add yourself, etc.) in one place.
-- ============================================================
create or replace function public.add_contact(target_flow_id text)
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

  select id into target_id from profiles where flow_id = upper(trim(target_flow_id));

  if target_id is null then
    raise exception 'No one has that Flow ID';
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


-- Opens (or reuses) a direct "Current" between the caller and another user.
-- other_flow_id must already be in the caller's circle.
create or replace function public.start_direct_conversation(other_flow_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  other_id uuid;
  existing_id uuid;
  new_id uuid;
begin
  if caller_id is null then
    raise exception 'Not signed in';
  end if;

  select id into other_id from profiles where flow_id = upper(trim(other_flow_id));
  if other_id is null then
    raise exception 'No one has that Flow ID';
  end if;

  if other_id = caller_id then
    raise exception 'You cannot start a Current with yourself';
  end if;

  if not exists (select 1 from contacts where owner_id = caller_id and contact_id = other_id) then
    raise exception 'Add them to your circle first';
  end if;

  -- Reuse an existing direct conversation between exactly these two people.
  select cm1.conversation_id into existing_id
  from conversation_members cm1
  join conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join conversations c on c.id = cm1.conversation_id
  where c.type = 'direct'
    and cm1.user_id = caller_id
    and cm2.user_id = other_id;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into conversations (type, created_by) values ('direct', caller_id)
    returning id into new_id;

  insert into conversation_members (conversation_id, user_id) values
    (new_id, caller_id),
    (new_id, other_id);

  return new_id;
end;
$$;

grant execute on function public.start_direct_conversation(text) to authenticated;


-- Creates a group "Sync" conversation. member_flow_ids must all already be
-- in the caller's circle; the caller is added automatically.
create or replace function public.create_group_conversation(group_name text, member_flow_ids text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  new_id uuid;
  a_flow_id text;
  member_id uuid;
begin
  if caller_id is null then
    raise exception 'Not signed in';
  end if;

  if trim(coalesce(group_name, '')) = '' then
    raise exception 'Give your Sync a name';
  end if;

  if array_length(member_flow_ids, 1) is null or array_length(member_flow_ids, 1) < 1 then
    raise exception 'Pick at least one person to add';
  end if;

  insert into conversations (type, name, created_by) values ('group', trim(group_name), caller_id)
    returning id into new_id;

  insert into conversation_members (conversation_id, user_id) values (new_id, caller_id);

  foreach a_flow_id in array member_flow_ids loop
    select id into member_id from profiles where flow_id = upper(trim(a_flow_id));

    if member_id is null then
      raise exception 'No one has the Flow ID %', a_flow_id;
    end if;

    if member_id != caller_id and not exists (
      select 1 from contacts where owner_id = caller_id and contact_id = member_id
    ) then
      raise exception 'Add % to your circle first', a_flow_id;
    end if;

    insert into conversation_members (conversation_id, user_id) values (new_id, member_id)
      on conflict do nothing;
  end loop;

  return new_id;
end;
$$;

grant execute on function public.create_group_conversation(text, text[]) to authenticated;


-- ============================================================
-- 6. GOALS
-- (Created before tasks since tasks.goal_id points to it — a table has to
-- exist before anything can reference it as a foreign key.)
-- ============================================================
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  target_date date,
  status text not null default 'active' check (status in ('active', 'done')),
  created_at timestamptz not null default now()
);

alter table goals enable row level security;

create policy "users manage their own goals"
  on goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- 7. TASKS
-- ============================================================
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table tasks enable row level security;

create policy "users manage their own tasks"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- 8. HABITS + HABIT LOGS
-- A habit log row = "I did this habit on this date." Streaks are computed
-- in the app from consecutive log dates, nothing to store for that.
-- ============================================================
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table habits enable row level security;

create policy "users manage their own habits"
  on habits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

alter table habit_logs enable row level security;

create policy "users manage their own habit logs"
  on habit_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
