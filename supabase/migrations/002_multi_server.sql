-- NexSpoofer — multi-server support
-- Run this in the Supabase SQL editor AFTER supabase/schema.sql has already
-- been applied once. Safe to run on an existing project with data in it.

create table if not exists media_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  worker_url text not null,
  enabled boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Which admins (or super_admins) are allowed to generate links against
-- which server. A row here = "this admin may use this server."
-- super_admin implicitly has access to every enabled server (checked in
-- code, not via a row here) so it doesn't need to be granted explicitly.
create table if not exists admin_server_access (
  admin_id uuid not null references profiles(id) on delete cascade,
  server_id uuid not null references media_servers(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (admin_id, server_id)
);

-- Every link now remembers which server (Worker deployment) should serve
-- its bytes. Nullable + on delete set null so existing rows created before
-- this migration keep working — the app falls back to
-- NEXT_PUBLIC_MEDIA_PROXY_URL for any link with server_id = null.
alter table media_links add column if not exists server_id uuid references media_servers(id) on delete set null;
create index if not exists media_links_server_id_idx on media_links (server_id);

alter table media_servers enable row level security;
alter table admin_server_access enable row level security;
-- No client-side policies — same pattern as allowed_media_domains /
-- audit_logs: only ever read/written through the service-role client from
-- server code (lib/servers.ts, app/sa/actions.ts), gated by requireRole().

-- OPTIONAL: if you already have a working NEXT_PUBLIC_MEDIA_PROXY_URL and
-- want it to show up as "Server 1" in /sa instead of relying on the env
-- fallback, run this once with your real Worker URL:
--
-- insert into media_servers (name, worker_url, enabled)
-- values ('Server 1', 'https://nexspoofer-media.yoursubdomain.workers.dev', true);
