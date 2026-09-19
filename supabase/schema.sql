-- NexSpoofer database schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)
-- on a fresh project, in order, top to bottom.

create extension if not exists "pgcrypto";

create type user_role as enum ('user', 'admin', 'super_admin');
create type user_status as enum ('active', 'suspended');
create type media_kind as enum ('hls', 'direct');
create type link_status as enum ('active', 'revoked');

-- One row per authenticated user, auto-created on first sign-in (trigger below).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  role user_role not null default 'user',
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media_links (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  media_type media_kind not null,
  media_url text not null,
  referer_url text,
  created_by uuid references profiles(id) on delete set null,
  status link_status not null default 'active',
  expires_at timestamptz,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_links_public_id_idx on media_links (public_id);
create index media_links_created_by_idx on media_links (created_by);

create table allowed_media_domains (
  id uuid primary key default gen_random_uuid(),
  hostname text not null unique,
  enabled boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_at_idx on audit_logs (created_at desc);

-- Auto-create a profile row whenever a new Supabase Auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security -----------------------------------------------------
-- Server routes use the service_role key (which bypasses RLS) for every
-- privileged operation and do their own authorization checks in code
-- (lib/auth.ts). RLS here is defense-in-depth for any direct client-side
-- Supabase queries, which should stay limited to "select/update my own
-- profile" — nothing else is queried directly from the browser.

alter table profiles enable row level security;
alter table media_links enable row level security;
alter table allowed_media_domains enable row level security;
alter table audit_logs enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own_limited" on profiles
  for update using (auth.uid() = id);

create policy "media_links_select_own" on media_links
  for select using (auth.uid() = created_by);

-- No client-side policies for allowed_media_domains / audit_logs at all —
-- those are only ever read/written through the service-role client from
-- server code (lib/supabase/service.ts) after a requireRole() check.
