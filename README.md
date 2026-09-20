# NexSpoofer

**Author:** NexApp × NexEris. LTD
**Dev:** MR. ARX × Arabi Islam

Authenticated web app for generating opaque, referer-spoofed media player
links for authorized content. Next.js (App Router) + Supabase (Auth + DB)
+ a custom Liquid Glass HLS/video/image player.

**Two separate deployments**, on purpose:
- **Next.js app** (this repo's root) — auth, `/LinkGen`, `/sa`, the player
  *UI* shell. Deployed to Vercel. Low bandwidth (HTML/JSON only).
- **Cloudflare Worker** (`worker/`) — the actual video/image byte proxy:
  referer spoofing, HLS manifest rewriting, Range-request streaming.
  Deployed separately to Cloudflare. This is where 100% of the heavy
  media bandwidth flows, kept off Vercel on purpose — Vercel's free
  Hobby plan caps at 100GB/month of data transfer and pauses the whole
  project once you cross it, while Cloudflare Workers don't charge for
  bandwidth on any plan (their free tier caps request *count* — 100k/day
  — and per-request CPU time, not bytes transferred).

---

## ⚡ Do this FIRST, in parallel with reading the rest of this file

These four things can only be done by you, in your own accounts — no
amount of code can skip them. Budget ~25–30 minutes total.

### 1. Supabase project (~5 min)
1. Create a project at supabase.com.
2. Project Settings → API → copy **Project URL**, **anon public key**,
   and **service_role key** (keep the service key secret).
3. SQL Editor → paste the entire contents of `supabase/schema.sql` → Run.

### 2. Google OAuth, wired through Supabase (~10 min)
1. Supabase Dashboard → Authentication → Providers → **Google** → enable
   it. Supabase will show you a callback URL like
   `https://<project-ref>.supabase.co/auth/v1/callback` — copy it.
2. Go to Google Cloud Console → APIs & Services → Credentials → **Create
   Credentials → OAuth client ID** → Application type: **Web application**.
3. Under "Authorized redirect URIs", paste the Supabase callback URL from
   step 1.
4. Copy the generated **Client ID** and **Client Secret** back into the
   Supabase Google provider settings page and save.
5. (First time only) Google will also ask you to configure an OAuth
   consent screen — "External" + your app name is enough for testing.

### 3. Deploy the Cloudflare Worker (~10 min)
See `worker/README.md` for the full walkthrough (login, set 3 secrets,
edit one config value, deploy). You'll get a URL like
`https://nexspoofer-media.yoursubdomain.workers.dev` — you need this for
step 4 below.

### 4. Deploy the Next.js app to Vercel (~5 min)
1. Push this project to a GitHub repo, then import it in Vercel.
2. In Vercel → Project → Settings → Environment Variables, add every
   variable from `.env.example` (see below for what each one means),
   including `NEXT_PUBLIC_MEDIA_PROXY_URL` from step 3.
   Set `APP_BASE_URL` to your real Vercel URL once you have it (redeploy
   after setting it if you set it late) — and go back and set the
   Worker's `ALLOWED_ORIGIN` to this same Vercel URL too (`wrangler.toml`
   → redeploy the Worker) so CORS allows the two to talk to each other.
3. Deploy.

Once all four are done, sign in once with the Google account you want as
the first Super Admin, having already set `BOOTSTRAP_SUPER_ADMIN_EMAIL`
to that same address before that first login.

---

## Environment variables

See `.env.example` for the full list with inline explanations. Never
commit a real `.env` file.

---

## Architecture summary

- **Next.js app (Vercel)**: auth pages, `/LinkGen`, `/sa`, and the player
  page/UI shell. Talks to Supabase directly for everything except actual
  media bytes.
- **Cloudflare Worker (`worker/`)**: the entire media-proxy layer — fetches
  the origin media server-side (spoofing `Referer`), and for HLS, rewrites
  every URI inside the manifest (variants, segments, `#EXT-X-KEY`/
  `#EXT-X-MAP`) to point back at itself — the browser never sees the real
  origin URL, and it's on a separate origin from the Next.js app for
  exactly one reason: keeping the actual bandwidth off Vercel's metered
  free tier. It reads/writes the *same* Supabase tables as the Next.js
  app (via the REST API, no shared code) — `media_links` for link
  resolution and hit counts, `allowed_media_domains` for the live
  allowlist.
- **Opaque link resolution**: `/p/[publicId]` (Next.js) → DB lookup →
  player UI, which then points at the Worker's URLs for actual playback.
  Sub-resource URLs inside a rewritten manifest are not looked up in any
  DB at all — they're authenticated-encrypted (AES-256-GCM, via Web
  Crypto since Workers have no Node `crypto` module) directly into the
  path, which is stateless and safe across Cloudflare's distributed
  instances the same way it was designed for Vercel's serverless
  instances originally (a shared in-memory lookup table wouldn't survive
  between two separate invocations either way).

## Route map

**Next.js app (Vercel):**

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Google sign-in |
| `/auth/callback` | public | OAuth code exchange |
| `/` | any signed-in user | redirects to `/LinkGen` (admin+) or `/login` |
| `/LinkGen` | admin, super_admin | create a link |
| `/p/[id]` | any signed-in, active user | watch/view (points at the Worker for media) |
| `/sa` | super_admin only | hidden dashboard — 404s for everyone else |
| `/api/linkgen/create` | admin, super_admin | POST, creates a link |

**Cloudflare Worker (`worker/`, separate origin):**

| Route | Access | Purpose |
|---|---|---|
| `/media/[id]` | resolved per-link | direct (mp4/image) proxy, Range-aware |
| `/media/[id]/manifest` | resolved per-link | HLS manifest fetch+rewrite |
| `/media/[id]/seg/[token]` | resolved per-link | HLS segment/key/sub-playlist proxy |

## Database schema

See `supabase/schema.sql` for the authoritative version (tables:
`profiles`, `media_links`, `allowed_media_domains`, `audit_logs`, plus a
trigger that auto-creates a `profiles` row on first Google sign-in).

**Simplified from the original spec's fully granular
`permissions`/`role_permissions`/`user_roles` tables** to a single
`profiles.role` enum (`user` / `admin` / `super_admin`) for MVP speed —
still 100% DB-backed and server-checked (`lib/auth.ts`), never a hardcoded
email gating a feature. Extending to per-permission granularity (e.g. an
admin who can create links but not view others') is a schema addition
(`permissions` + `user_permissions` tables) plus swapping `requireRole()`
checks for a `requirePermission()` check — not a rewrite, but genuinely
not done yet. Flagging this clearly rather than claiming full section-16
granularity is in place.

## Permission matrix (as actually implemented)

| Action | user | admin | super_admin |
|---|---|---|---|
| Sign in, watch a link | ✅ | ✅ | ✅ |
| Create a link (`/LinkGen`) | ❌ | ✅ | ✅ |
| Access `/sa` | ❌ | ❌ | ✅ |
| Change any user's role/status | ❌ | ❌ | ✅ |
| Revoke any link | ❌ | ❌ | ✅ |
| Manage approved domains | ❌ | ❌ | ✅ |

**Not implemented as spec'd**: an admin cannot currently have a *subset*
of admin capabilities (spec's granular `linkgen.create` vs `users.manage`
etc.) — every admin currently gets the same single `admin` capability
(create links). Section 17's "admins cannot manage other admins" rule
holds trivially today since admins have no user-management access at all.

## Security model

- **SSRF — two layers, two runtimes**:
  - **Next.js/Vercel side** (`lib/security.ts`, used by `/api/linkgen/create`
    at link-creation time): resolves DNS via Node's `dns.lookup` and
    rejects private/loopback/link-local IPs. **Known limitation**: this is
    a resolve-then-fetch check, not a pinned-IP fetch — there's a small
    theoretical DNS-rebinding window between the check and the actual
    `fetch()` call. Hardening that fully means fetching through a custom
    dispatcher with a pinned resolved IP; flagged here rather than
    silently left out.
  - **Cloudflare Worker side** (`worker/src/security.ts`, used for every
    actual media fetch): Cloudflare Workers' own `fetch()` refuses to
    open a connection to RFC1918/loopback/link-local addresses at the
    **platform/runtime level** — this is the Worker's real hard boundary,
    not something our code has to implement (Workers don't have Node's
    `dns` module to do it ourselves anyway). The Worker's own
    `looksPrivate()` check is a cheap string-based fail-fast on top of
    that, not the primary defense.
- **Domain allowlist — deny by default, shared by both deployments**:
  nothing is approved to fetch from until a Super Admin adds it. Primary
  control is `/sa` → "Approved Media Domains" (live, no redeploy needed) —
  both the Next.js app (at link-creation time) and the Worker (at every
  actual fetch) read the same `allowed_media_domains` Supabase table, so
  a change in `/sa` takes effect for both immediately.
  `ALLOWED_MEDIA_HOSTS` exists as an optional extra baseline in *each*
  deployment's own env/secrets, not required — leave both empty to manage
  domains entirely from `/sa`. **A fresh deploy with nothing approved yet
  will reject every link-creation and media-fetch attempt** until at
  least one domain is added.
- **Opaque IDs**: 10 chars from a 58-character unambiguous alphabet
  (≈58 bits of entropy) — not sequential, not guessable in practice, but
  per spec §3 this is stated plainly as **obfuscation, not a security
  boundary** — the real access gate is the Google-auth requirement on
  `/p/[id]` itself.
- **Sub-resource URLs**: AES-256-GCM encrypted into the rewritten manifest
  paths, entirely inside the Worker (Web Crypto, not Node's `crypto` —
  see Architecture above) — never plain, never DB-round-tripped.
- **`/sa` is hidden, not just role-checked**: unauthorized access returns
  a genuine Next.js 404, not a 403 or a redirect to login — the route's
  existence isn't revealed.
- **RLS**: enabled on every table; policies only allow a user to read/edit
  their *own* profile row and their *own* created links directly. All
  privileged reads/writes (admin panel, link creation, media resolution)
  go through the service-role client from server code, gated by
  `requireRole()` in `lib/auth.ts` — RLS is defense-in-depth, not the
  primary gate.
- **One intentional hardcoded identity**: `BOOTSTRAP_SUPER_ADMIN_EMAIL` in
  `lib/auth.ts`, solely to promote the very first super admin on first
  login. Every other authorization check reads `profiles.role` from the
  DB.
- **CORS**: the Worker is a different origin from the Next.js app by
  design, so it sets `Access-Control-Allow-Origin` to exactly
  `ALLOWED_ORIGIN` (the Next.js app's URL) rather than `*` — only that
  origin's browser JS can read the Worker's responses.

## Features actually implemented

- Google sign-in via Supabase Auth, session refresh middleware, and a
  working post-login redirect back to the original `?next=` target
  (e.g. a shared `/p/[id]` link, not just always `/LinkGen`)
- `/LinkGen` (admin+): paste media URL + optional referer → opaque link
- Auto HLS vs direct detection from the URL; for "direct" links the
  client sniffs the actual Content-Type (via a HEAD request to the
  Worker) to decide video-player vs image-viewer at runtime, since the
  real file extension is never exposed to the browser
- **Cloudflare Worker media proxy** (`worker/`), fully separate from
  Vercel bandwidth: HLS manifest fetch + full URI rewrite (master + media
  playlists, `#EXT-X-KEY`/`#EXT-X-MAP`), referer spoof, Range-aware direct
  proxy, CORS scoped to the Next.js app's origin, segment responses
  cache-headers set for CDN/browser reuse on retry
- Custom Liquid Glass player: seek bar (buffered+played+drag), ±10s,
  volume w/ hover slider, settings popover (speed+quality backed by real
  `hls.js` levels), fullscreen, keyboard shortcuts (Space/K, arrows, M, F),
  auto-hiding controls
- **Animated loading/buffering state**: logo + a 5-bar "signal" indicator
  (deliberately kept tall/bright throughout its animation rather than
  dipping low, so a stall reads as "still working" rather than "weak
  connection") shown both on initial load and on any mid-playback
  rebuffer, plus a tuned hls.js buffer config (deeper buffer ahead of
  playback) to reduce how often a rebuffer happens in the first place
- **Proper error state + retry**: network/media/unsupported-format errors
  show a calm glass card with a working "Try Again" button (tears down
  and re-initializes playback) instead of a raw technical message;
  native `<video>` element errors (for direct mp4 links) are now caught
  too, not just hls.js errors
- Image viewer: blurred backdrop, click-to-zoom, loading/error states
- `/sa` hidden dashboard: user list w/ role+suspend controls, link list
  w/ revoke, approved-domains manager, audit log viewer — all via Next.js
  Server Actions, all re-checking `super_admin` server-side independent
  of the page gate
- SSRF protection on both deployments (Node DNS-resolve check on Vercel,
  Cloudflare's platform-level private-IP block + a fail-fast string check
  on the Worker)
- Audit logging for role changes, suspensions, link creation/revocation,
  domain add/remove
- `noindex` on player/admin pages
- App icon/favicon and in-app logo (`public/logo.png`, `app/icon.png`)

## Features NOT implemented (be honest about this)

- Granular per-permission admin capabilities (spec §16) — collapsed to a
  single `admin` role for MVP speed (see Permission Matrix above)
- Rate limiting — not added on **either** deployment; needed before any
  public exposure beyond a trusted small team, especially on link
  creation (Next.js) and media proxying request volume (Worker)
- Mobile gesture controls — double-tap-to-seek, swipe-to-seek (spec §10)
- Picture-in-Picture button (spec §9)
- Subtitle/audio track UI (hls.js exposes these; no UI built for them yet)
- Pinned-IP fetch for full DNS-rebinding-proof SSRF on the Vercel/Node
  side specifically (see Security Model above; not applicable to the
  Worker side, which relies on Cloudflare's platform-level protection)
- Worker-side response caching beyond the `Cache-Control` headers already
  set (no Cache API / KV-backed manifest caching)
- Automated tests — none written on either deployment; manual
  verification + `tsc`/build/dry-run only (see below)

## What was actually verified vs. just written

Actually run and passing in this environment:
- **Next.js app**: `npx tsc --noEmit` (no type errors), `npm run lint`
  (0 errors, 3 harmless warnings — an intentional type-only import, and a
  `useEffect` dependency lint that's correct behavior here, the effect is
  meant to run once per resolved media source, not on every render),
  `npm run build` (succeeds, correct route table)
- **Cloudflare Worker**: `npx tsc --noEmit` (no type errors),
  `npx wrangler deploy --dry-run` (bundles successfully, ~13.6 KiB)

**NOT verified** (can't be, from this environment — no live credentials):
- An actual Google OAuth round-trip, including the fixed `?next=`
  redirect behavior
- An actual Supabase project (schema.sql has not been run against a real
  Postgres instance from here — it's syntactically standard Postgres/
  Supabase DDL, but "not yet executed against a real DB" is a real gap,
  not a formality)
- An actual deployed Vercel instance or Cloudflare Worker
- Real HLS playback against a real CDN through the deployed Worker,
  including the CORS handshake between the two separate origins
- Real-world buffering behavior/improvement from the hls.js buffer
  tuning — the config values are standard hls.js recommendations for
  reducing rebuffer frequency, not something benchmarked against your
  specific CDN and connection from here

Please run through the checklist in spec §38 yourself once everything is
wired up — this is exactly the kind of thing that looks right in code and
needs a real click-through to confirm.

## Deployment instructions

1. Complete the four setup steps at the top of this file (Supabase,
   Google OAuth, Cloudflare Worker, Vercel — in that order, since each
   later step needs a value from the one before it).
2. Make sure `NEXT_PUBLIC_MEDIA_PROXY_URL` (Vercel) and `ALLOWED_ORIGIN`
   (Worker's `wrangler.toml`) point at each other correctly — this pair
   is what makes CORS work between the two origins.
3. Sign in once with the `BOOTSTRAP_SUPER_ADMIN_EMAIL` account to become
   the first super admin, then use `/sa` to promote/manage everyone else
   from there.
4. **Before testing `/LinkGen`**: go to `/sa` → "Approved Media Domains" →
   add the domain(s) you'll actually be pasting media URLs from (e.g.
   `b-cdn.net`). Nothing is approved by default on either deployment —
   link creation will return "not on the approved list" until you do
   this, and the Worker will independently reject the fetch too even if
   that check were somehow skipped.
