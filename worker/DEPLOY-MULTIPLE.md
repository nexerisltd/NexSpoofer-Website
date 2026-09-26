# Deploying one Worker per provider (separate Cloudflare accounts)

Each of your 3+ video providers keeps their own Cloudflare account and their
own free 100,000 req/day quota — nobody is sharing/splitting one account's
limit, which is the setup that's actually fine under Cloudflare's terms (see
the chat discussion this file accompanies).

## Recommended flow per provider

1. **Provider creates their own Cloudflare account** (or uses an existing
   one) — just needs an email, no payment info required for the Free plan.
2. **Provider invites you as a Member** on that account with the
   *Workers Admin* (or full Admin) role:
   Cloudflare dashboard → **Manage Account** → **Members** → **Invite**.
3. **You accept the invite.** Your login now has access to multiple
   Cloudflare accounts, so every `wrangler` command needs to be told which
   one to use — current Wrangler versions do this via the
   `CLOUDFLARE_ACCOUNT_ID` **environment variable** (there is no
   `--account-id` CLI flag; `wrangler deploy --help` doesn't list one).
   Find each account's ID with:
   ```bash
   npx wrangler whoami
   ```
   Then, from inside `worker/`:
   ```bash
   # macOS/Linux/Git Bash:
   CLOUDFLARE_ACCOUNT_ID=<their-account-id> npx wrangler deploy --name nexspoofer-media-providera

   # Windows cmd.exe:
   set CLOUDFLARE_ACCOUNT_ID=<their-account-id>
   npx wrangler deploy --name nexspoofer-media-providera

   # Windows PowerShell:
   $env:CLOUDFLARE_ACCOUNT_ID = "<their-account-id>"
   npx wrangler deploy --name nexspoofer-media-providera
   ```
   (The `deploy-server.mjs` / `deploy-all.mjs` scripts below set this
   environment variable for you automatically — you don't need to type any
   of the above if you use them.)
4. **Set the three secrets** the same way — same `CLOUDFLARE_ACCOUNT_ID`
   needs to be set for these commands too:
   ```bash
   npx wrangler secret put SUPABASE_URL --name nexspoofer-media-providera
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name nexspoofer-media-providera
   npx wrangler secret put ENCRYPTION_KEY --name nexspoofer-media-providera
   ```
   Use a **different `ENCRYPTION_KEY` per server** — there's no need for
   them to share one, and it keeps each provider's segment tokens
   independent (compromising one server's key doesn't affect the others).
5. **Edit `wrangler.toml`** for `ALLOWED_ORIGIN` (same value for every
   server — your Next.js app's URL) before deploying, same as the main
   README. Leave `account_id` out of `wrangler.toml` entirely — that's what
   lets the same file deploy to any account via the environment variable
   instead of being locked to one.
6. Copy the resulting URL (`https://<worker-name>.<their-subdomain>.workers.dev`)
   and add it in `/sa` → **Media Servers** → Add, giving it a name like
   "Provider A".
7. In `/sa` → **Server Access**, tick the box for whichever admin(s) should
   be allowed to generate links against that provider's server.

## If a provider's Worker ever goes down or gets suspended

Because every link is tied to one `server_id`, only links pointing at that
one server break — everything else on the site keeps working. Use the
**Check** button next to each server in `/sa` → Media Servers to see at a
glance whether it's still responding, rather than waiting for a viewer (or
the provider) to report it.

## Keep the repo private

If this repository is public, its README and code openly describe
referrer-spoofing and bypassing hotlink protection. That framing is what
would actually draw manual attention from a platform's Trust & Safety team
if someone reported it — not the cross-domain video embedding itself, which
is completely ordinary. Making the repo private removes that exposure with
zero code changes.

## Doing all of this faster: deploy-server.mjs / deploy-all.mjs

Repeating the deploy + 3 secrets by hand for every provider gets tedious
fast, so three small files handle it:

- `deploy-lib.mjs` — the actual logic (sets `CLOUDFLARE_ACCOUNT_ID` for
  each command, runs deploy + all 3 `secret put`s). Not run directly.
- `deploy-server.mjs` — CLI wrapper for one server.
- `deploy-all.mjs` — loops every line in `servers.txt` through the same
  logic in-process (no extra child processes spawned per server).

All plain Node.js (`.mjs`), so they run the same way on Windows (`cmd.exe`
or PowerShell), macOS, and Linux — no `chmod`, no bash required.

**Windows (`cmd.exe`):**
```bat
cd worker
set SUPABASE_URL=https://xxxxx.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=eyJ...

node deploy-server.mjs nexspoofer-media-providera <PROVIDER_A_ACCOUNT_ID>

REM Or all of them in one go — copy servers.example.txt to servers.txt,
REM fill in real account IDs (from `npx wrangler whoami` once you've
REM accepted every invite), then:
node deploy-all.mjs
```

**Windows (PowerShell):**
```powershell
cd worker
$env:SUPABASE_URL = "https://xxxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
node deploy-all.mjs
```

**macOS / Linux / Git Bash:**
```bash
cd worker
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
node deploy-all.mjs
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are identical for every
server (same Supabase project), so setting them once means you're not
retyping them 4 times. If you skip setting them, `wrangler` will just
prompt you directly in the terminal instead — nothing breaks either way.
`ENCRYPTION_KEY` is generated fresh per server automatically, on purpose
(see the security note above).

`servers.txt` holds real Cloudflare account IDs — it's already in
`.gitignore` so it won't get committed if this repo is public.

If `deploy-all.mjs` hits a placeholder line still reading
`REPLACE_WITH_...` in `servers.txt`, it skips that one and keeps going
rather than failing the whole batch — check the "Summary" it prints at the
end to see what actually happened for each server.
