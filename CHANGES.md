# CHANGES — multi-server, leak-blocking, speed, UI

Drop this zip's contents into your repo root (overwrites the files it
touches, adds the new ones). Then:

## 1. Run the DB migration
In Supabase SQL Editor, run `supabase/migrations/002_multi_server.sql`
(safe on an existing project — only adds new tables/columns).

## 2. Add at least one server in `/sa`
`/sa` → **Media Servers** → Add → paste your existing Worker URL (the one
already in `NEXT_PUBLIC_MEDIA_PROXY_URL`), name it "Server 1". New links
created after this will use whichever server the admin picks in LinkGen;
links created before this migration keep working via the old env-var
fallback automatically (`server_id` is null on old rows).

## 3. Grant admins access to servers
`/sa` → **Server Access** → tick which admin can use which server.
Super admins always have access to every enabled server, no ticking needed.

## 4. Redeploy the Worker(s)
`worker/src/index.ts` changed (added the Referer/Origin guard) — every
Worker deployment needs `npx wrangler deploy` run again to pick it up,
including any you deploy under a provider's own account later
(see `worker/DEPLOY-MULTIPLE.md`).

## What changed and why

- **Multi-server / multi-provider support** — `media_servers` +
  `admin_server_access` tables, a Servers panel and a Server Access grid in
  `/sa`, a server picker in LinkGen, and `/p/[id]` now routes playback
  through whichever Worker the link was created against instead of one
  hardcoded env var.
- **Leak-blocking** — `worker/src/index.ts` and all three
  `app/api/media/[id]/...` routes now reject any request whose
  Referer/Origin doesn't match your app's own domain, before doing
  anything else. Previously the CORS headers were the only protection,
  and CORS doesn't stop a direct curl/download-manager hit — only a
  browser honors it. Copy-pasting a Network-tab URL into another site or a
  bulk downloader now gets a 403 instead of the media.
- **Speed** — `/api/linkgen/create` used to await the DNS-safety check,
  then the domain-approval check, then a blocking audit-log insert, one
  after another. The first two now run in parallel (`Promise.allSettled`),
  and the audit log write is fire-and-forget, since the link is already
  safely created by the time it fires.
- **UI** — an **Open** button next to **Copy** on the generated-link box,
  opens the link in a new tab. Also fixed the earlier approved-domains
  bug for good (full-URL paste now normalizes to just the hostname).
- **Server health check** — a **Check** button per server in `/sa` pings
  it and reports up/down + latency, without needing a real media link, so
  you find out a provider's Worker is unreachable before they do.

## Known limitations, said plainly

- The Referer/Origin check can be spoofed by a non-browser client that
  deliberately sets a matching header — it stops casual leeching and
  hotlinking, not a determined attacker who reads this code.
- The health check only tells you a Worker is *executing code and
  reachable* right now — it can't tell you Cloudflare is about to suspend
  it, and it isn't run automatically on a schedule (click it manually, or
  wire it into a cron/monitoring tool if you want that).
- Actual playback smoothness beyond what changed here is mostly bounded by
  the origin CDN and the extra Worker hop, not something further code
  changes here can fix without real traffic to profile against.
