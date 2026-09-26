# CHANGES — full project state

This is the complete project with every change from the chat applied —
multi-server support, leak-blocking, speed fixes, UI additions, the
server health check, and the deploy automation scripts (including the
`CLOUDFLARE_ACCOUNT_ID` fix). Unzip this over your repo root (overwrites
what it touches, adds what's new) and follow the steps below in order.

## Setup steps (do these in order)

1. **Run both SQL files** in Supabase SQL Editor, in order:
   - `supabase/schema.sql` — only if this is a fresh project that's never
     had it run. **Skip this on your existing project** — you already
     have this schema; re-running it will error on "already exists".
   - `supabase/migrations/002_multi_server.sql` — **run this one**, safe
     on your existing project, only adds new tables/columns
     (`media_servers`, `admin_server_access`, `media_links.server_id`).

2. **Check `worker/wrangler.toml`** — `ALLOWED_ORIGIN` is pre-filled as
   `https://nexspoofer.vercel.app` based on the screenshots shared in
   chat. If your actual deployed URL is different, update this line
   before deploying.

3. **Redeploy every Worker you have** — `worker/src/index.ts` changed
   (added the Referer/Origin leak guard), so any existing deployment is
   still running the old code until you redeploy it:
   ```bash
   cd worker
   npx wrangler deploy --name <your-existing-worker-name>
   ```
   (If you only have one Worker and it deploys under the default name
   from `wrangler.toml`, plain `npx wrangler deploy` is enough.)

4. **Add that Worker as a server** in `/sa` → **Media Servers** → Add.
   Name it anything (e.g. "Server 1"), paste its URL. Old links (created
   before this update) keep working automatically via the
   `NEXT_PUBLIC_MEDIA_PROXY_URL` env-var fallback — you don't need to do
   anything for those.

5. **Click Check** next to the new server entry to confirm it responds.

6. **Grant server access** in `/sa` → **Server Access** — tick which
   admin can generate links against which server. Super admins always
   have access to every enabled server automatically.

7. **For additional providers/servers**, see `worker/DEPLOY-MULTIPLE.md`
   — covers getting invited to a provider's own Cloudflare account and
   using `worker/deploy-server.mjs` / `worker/deploy-all.mjs` to deploy
   there.

## What changed and why

### Multi-server / multi-provider support
`media_servers` + `admin_server_access` tables, a Servers panel and a
Server Access grid in `/sa`, a server picker in LinkGen, and `/p/[id]`
now routes playback through whichever Worker the link was created
against instead of one hardcoded env var. Each provider can run their
own Worker under their own Cloudflare account (own free-tier quota, no
shared-account ToS gray area) — see `worker/DEPLOY-MULTIPLE.md`.

### Leak-blocking
`worker/src/index.ts` and all three `app/api/media/[id]/...` routes now
reject any request whose Referer/Origin doesn't match your app's own
domain, before doing anything else. CORS headers alone never stopped a
direct curl/download-manager hit — only a browser honors them. Copying a
Network-tab URL into another site or a bulk downloader now gets a 403.

### Speed
`/api/linkgen/create` used to await the DNS-safety check, then the
domain-approval check, then a blocking audit-log insert, one after
another. The first two now run in parallel (`Promise.allSettled`), and
the audit log write is fire-and-forget.

### UI
An **Open** button next to **Copy** on the generated-link box. Also
fixed the approved-domains bug for good — pasting a full URL now
normalizes to just the hostname instead of being stored verbatim and
never matching.

### Server health check
A **Check** button per server in `/sa` pings it with a bogus link ID and
checks whether the app's own JSON error shape comes back, distinguishing
"Worker alive and running our code" from "suspended/deleted/unreachable"
— without needing a real media link.

### Deploy automation, and the account-id fix
`worker/deploy-server.mjs` / `worker/deploy-all.mjs` script the
deploy + 3-secrets flow (plain Node.js — works on Windows `cmd.exe`,
PowerShell, macOS, Linux, no `chmod`/bash needed). An earlier version
tried to pass `--account-id` to `wrangler deploy` — **current Wrangler
has no such flag** (confirmed against `wrangler deploy --help`'s own
OPTIONS list). Multi-account selection is done via the
`CLOUDFLARE_ACCOUNT_ID` environment variable instead, which is what
`worker/deploy-lib.mjs` now sets per-command. `deploy-all.mjs` also
calls this logic in-process now instead of spawning a nested
`node deploy-server.mjs` per server, reducing process-nesting depth
(relevant to a Windows-specific Node.js/libuv crash that surfaced when
the old flag caused `wrangler` to exit abnormally).

## Known limitations, said plainly

- The Referer/Origin check can be spoofed by a non-browser client that
  deliberately sets a matching header — it stops casual leeching and
  hotlinking, not a determined attacker who reads this code.
- The health check only tells you a Worker is *executing code and
  reachable* right now, and isn't run on a schedule automatically —
  click it manually, or wire it into your own cron/monitoring if wanted.
- None of this has been run against a live Supabase project, a real
  Cloudflare account, or real traffic from this environment — same
  honesty as the original README's "what was actually verified" section.
  Test the full flow (generate a link, play it, check a server) after
  applying this before trusting it in front of real users.
- Actual playback smoothness beyond what changed here is mostly bounded
  by the origin CDN and the extra Worker hop, not something further code
  changes can fix without real traffic to profile against.
