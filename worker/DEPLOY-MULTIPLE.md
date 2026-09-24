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
3. **You accept the invite**, switch to their account in the Cloudflare
   dashboard/CLI, and deploy the same `worker/` code from this repo:
   ```bash
   cd worker
   npx wrangler login        # if not already logged in as yourself
   npx wrangler deploy       # deploys under THEIR account, using THEIR quota
   ```
4. **Set the three secrets** the same way as the main setup — you type
   these yourself; the provider never sees the values, and giving them
   Workers-only Member access means they can't read `SUPABASE_SERVICE_ROLE_KEY`
   from anywhere in the dashboard either:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put ENCRYPTION_KEY
   ```
   Use a **different `ENCRYPTION_KEY` per server** — there's no need for
   them to share one, and it keeps each provider's segment tokens
   independent (compromising one server's key doesn't affect the others).
5. **Edit `wrangler.toml`** for `ALLOWED_ORIGIN` (same value for every
   server — your Next.js app's URL) before deploying, same as the main
   README.
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

## Doing all of this faster: deploy-server.sh / deploy-all.sh

Repeating the deploy + 3 secrets by hand for every provider gets tedious
fast, so two small scripts are included here:

```bash
cd worker
chmod +x deploy-server.sh deploy-all.sh   # first time only

# One server at a time:
./deploy-server.sh nexspoofer-media-providera <PROVIDER_A_ACCOUNT_ID>

# Or all of them in one go — copy servers.example.txt to servers.txt,
# fill in real account IDs (from `npx wrangler whoami` once you've
# accepted every invite), then:
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
./deploy-all.sh
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are identical for every
server (same Supabase project), so exporting them once means you're not
retyping them 4 times — only `ENCRYPTION_KEY` is generated fresh per
server automatically, on purpose (see the security note above).

`servers.txt` holds real Cloudflare account IDs — it's already in
`.gitignore` so it won't get committed if this repo is public.

