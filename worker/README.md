# NexSpoofer media proxy — Cloudflare Worker

This is the bandwidth-heavy half of NexSpoofer: it's what actually fetches
video/image bytes from the origin CDN (spoofing `Referer`), rewrites HLS
manifests so every segment/key/sub-playlist routes back through itself,
and streams the result to whoever opened a `/p/[id]` link.

It's a **separate deployment** from the main Next.js app, on purpose:
Cloudflare Workers don't charge for bandwidth on any plan (including
Free), while Vercel's Hobby plan caps at 100GB/month — and 100% of the
actual video bytes flow through this piece. Keeping it on Cloudflare
means the heavy part costs nothing regardless of how much video gets
watched; only request *count* (100,000/day free) and CPU-time-per-request
(10ms free) are capped, and this proxy's CPU work per request (header
setup, AES-GCM token decrypt, playlist text rewriting) is tiny.

## Setup (~10 minutes)

1. **Install dependencies**:
   ```bash
   cd worker
   npm install
   ```

2. **Log in to Cloudflare** (opens a browser to authorize):
   ```bash
   npx wrangler login
   ```

3. **Set the secrets** — these are NOT stored in `wrangler.toml` or
   committed anywhere; Cloudflare stores them encrypted:
   ```bash
   npx wrangler secret put SUPABASE_URL
   # paste your Supabase Project URL, e.g. https://abcxyz.supabase.co

   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   # paste the service_role key (or "Secret key" on the new Supabase key format)
   # — SAME project as the main Next.js app; this Worker reads/writes the
   # exact same media_links / allowed_media_domains tables.

   npx wrangler secret put ENCRYPTION_KEY
   # any long random string — generate with:
   #   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # This is now ONLY used here (not by the Next.js app at all) since all
   # manifest-URL encryption/decryption happens inside this Worker.
   ```

4. **Edit `wrangler.toml`**: set `ALLOWED_ORIGIN` to your deployed Next.js
   app's URL (e.g. `https://nexspoofer.vercel.app`) — this controls CORS,
   i.e. which origin's browser JS is allowed to fetch this Worker's
   responses. Leave `ALLOWED_MEDIA_HOSTS` empty to manage approved domains
   entirely from `/sa` (recommended) — see the main README's security
   model section.

5. **Deploy**:
   ```bash
   npm run deploy
   ```
   Wrangler prints the Worker's URL, e.g.
   `https://nexspoofer-media.yoursubdomain.workers.dev`.

6. **Wire it into the Next.js app**: set that URL as
   `NEXT_PUBLIC_MEDIA_PROXY_URL` in the Next.js app's environment
   (Vercel project settings, or `.env.local` for local dev) and redeploy
   the Next.js app.

7. Same as the main README: add at least one approved domain from `/sa`
   before testing — this Worker independently re-checks the allowlist on
   every fetch (deny-by-default), it doesn't trust that the Next.js side
   already validated it at link-creation time.

## Local dev

```bash
npm run dev
```
Wrangler will prompt for local versions of the secrets, or you can create
a `.dev.vars` file (gitignored) with `KEY=value` lines for local-only
testing.

## Multiple servers / multiple Cloudflare accounts

See `DEPLOY-MULTIPLE.md` in this folder — covers deploying this same
Worker code under a provider's own Cloudflare account (so each provider's
free-tier quota is separate), and the `deploy-server.mjs` / `deploy-all.mjs`
scripts that automate it.

## What this does NOT include (yet)

- No caching/edge-side optimization beyond the `Cache-Control` headers
  already set on segment responses (Cloudflare's own CDN will honor
  those automatically for repeat requests to the same URL — no extra
  config needed for that baseline behavior, but nothing more aggressive
  like Cache API / KV-backed manifest caching has been added).
- No rate limiting — same caveat as the main README: fine for a small
  trusted group, needs adding before wider exposure.
- No automated tests — verified via `tsc --noEmit` and
  `wrangler deploy --dry-run` only (both passing), not against a live
  Supabase project or real CDN from this environment.
