# NexSpoofer

**Author:** NexApp × NexEris. LTD
**Dev:** MR. ARX × Arabi Islam

Authenticated web app for generating opaque, referer-spoofed media player
links for authorized content. Next.js (App Router) + Supabase (Auth + DB)
+ a custom Liquid Glass HLS/video/image player.

---

## ⚡ Do this FIRST, in parallel with reading the rest of this file

These three things can only be done by you, in your own accounts — no
amount of code can skip them. Budget ~15–20 minutes.

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

### 3. Deploy to Vercel (~5 min)
1. Push this project to a GitHub repo, then import it in Vercel.
2. In Vercel → Project → Settings → Environment Variables, add every
   variable from `.env.example` (see below for what each one means).
   Set `APP_BASE_URL` to your real Vercel URL once you have it (redeploy
   after setting it if you set it late).
3. Deploy.

Once these three are done and the env vars are set, sign in once with
the Google account you want as the first Super Admin, having already set
`BOOTSTRAP_SUPER_ADMIN_EMAIL` to that same address before that first
login.

---

## Environment variables

See `.env.example` for the full list with inline explanations. Never
commit a real `.env` file.

---

## Architecture summary

- **Frontend + API**: Next.js 16 App Router, one deployable.
- **Auth + DB**: Supabase (Google OAuth via Supabase Auth; Postgres for
  everything else).
- **Media delivery**: the app's own API routes fetch the origin media
  server-side (spoofing `Referer`), and for HLS, rewrite every URI inside
  the manifest (variants, segments, `#EXT-X-KEY`/`#EXT-X-MAP`) to point
  back at the app itself — the browser never sees the real origin URL.
- **Opaque link resolution**: `/p/[publicId]` → DB lookup → player.
  Sub-resource URLs inside a rewritten manifest are not looked up in the
  DB at all — they're authenticated-encrypted (AES-256-GCM) directly into
  the path, which is stateless and safe across Vercel's serverless
  instances (an in-memory lookup table would NOT survive between two
  separate function invocations, which a manifest request and its
  following segment requests usually are).

## Route map

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Google sign-in |
| `/auth/callback` | public | OAuth code exchange |
| `/` | any signed-in user | redirects to `/LinkGen` (admin+) or `/login` |
| `/LinkGen` | admin, super_admin | create a link |
| `/p/[id]` | any signed-in, active user | watch/view |
| `/sa` | super_admin only | hidden dashboard — 404s for everyone else |
| `/api/linkgen/create` | admin, super_admin | POST, creates a link |
| `/api/media/[id]` | resolved per-link | direct (mp4/image) proxy, Range-aware |
| `/api/media/[id]/manifest` | resolved per-link | HLS manifest fetch+rewrite |
| `/api/media/[id]/seg/[token]` | resolved per-link | HLS segment/key/sub-playlist proxy |

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

- **SSRF**: every server-side fetch (link creation, manifest, segment,
  direct) goes through `assertSafeToFetch()` — blocks non-http(s)
  protocols and resolves DNS to reject private/loopback/link-local IPs
  (`lib/security.ts`). **Known limitation**: this is a resolve-then-fetch
  check, not a pinned-IP fetch — there's a small theoretical DNS-rebinding
  window between the check and the actual `fetch()` call. Hardening that
  fully means fetching through a custom dispatcher with a pinned resolved
  IP; flagged here rather than silently left out.
- **Domain allowlist**: `ALLOWED_MEDIA_HOSTS` env var (static baseline) +
  `allowed_media_domains` DB table (managed live from `/sa`) are merged at
  request time.
- **Opaque IDs**: 10 chars from a 58-character unambiguous alphabet
  (≈58 bits of entropy) — not sequential, not guessable in practice, but
  per spec §3 this is stated plainly as **obfuscation, not a security
  boundary** — the real access gate is the Google-auth requirement on
  `/p/[id]` itself.
- **Sub-resource URLs**: AES-256-GCM encrypted into the rewritten manifest
  paths (see Architecture above) — never plain, never DB-round-tripped.
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

## Features actually implemented

- Google sign-in via Supabase Auth, session refresh middleware
- `/LinkGen` (admin+): paste media URL + optional referer → opaque link
- Auto HLS vs direct detection from the URL
- HLS: manifest fetch, full URI rewrite (master + media playlists,
  `#EXT-X-KEY`/`#EXT-X-MAP`), referer spoof, quality-level UI backed by
  real `hls.js` levels, speed control, retry-on-network-error
- Direct video/image: Range-aware proxy passthrough; client sniffs
  Content-Type to decide video-player vs image-viewer at runtime
- Custom Liquid Glass player: seek bar (buffered+played+drag), ±10s,
  volume w/ hover slider, settings popover (speed+quality), fullscreen,
  keyboard shortcuts (Space/K, arrows, M, F), auto-hiding controls
- Image viewer: blurred backdrop, click-to-zoom, loading/error states
- `/sa` hidden dashboard: user list w/ role+suspend controls, link list
  w/ revoke, approved-domains manager, audit log viewer — all via Next.js
  Server Actions, all re-checking `super_admin` server-side independent
  of the page gate
- SSRF protection (private-IP blocking) on every server-side fetch
- Audit logging for role changes, suspensions, link creation/revocation,
  domain add/remove
- `noindex` on player/admin pages

## Features NOT implemented (be honest about this)

- Granular per-permission admin capabilities (spec §16) — collapsed to a
  single `admin` role for MVP speed (see Permission Matrix above)
- Rate limiting (spec §33) — not added; needed before any public exposure
  beyond a trusted small team, especially on link creation and media
  proxying bandwidth
- Mobile gesture controls — double-tap-to-seek, swipe-to-seek (spec §10)
- Picture-in-Picture button (spec §9)
- Subtitle/audio track UI (hls.js exposes these; no UI built for them yet)
- Pinned-IP fetch for full DNS-rebinding-proof SSRF protection (see
  Security Model above)
- Automated tests — none written; manual verification only (see below)

## What was actually verified vs. just written

Actually run and passing in this environment:
- `npx tsc --noEmit` — no type errors
- `npm run lint` — 0 errors, 3 harmless warnings (an intentional
  type-only import, and a `useEffect` dependency lint that's correct
  behavior here — the effect is meant to run once per resolved media
  source, not on every render)
- `npm run build` — succeeds, correct route table (dynamic vs static
  matches expectations)

**NOT verified** (can't be, from this environment — no live credentials):
- An actual Google OAuth round-trip
- An actual Supabase project (schema.sql has not been run against a real
  Postgres instance from here — it's syntactically standard Postgres/
  Supabase DDL, but "not yet executed against a real DB" is a real gap,
  not a formality)
- An actual deployed Vercel instance
- Real HLS playback against a real CDN (the rewrite logic is a direct,
  careful port of the same approach already proven working in the sibling
  browser-extension project, but that's evidence, not a substitute for
  testing this exact code path)

Please run through the checklist in spec §38 yourself once the three
external services are wired up — this is exactly the kind of thing that
looks right in code and needs a real click-through to confirm.

## Deployment instructions

1. Complete the three setup steps at the top of this file.
2. `vercel --prod` or connect the GitHub repo in the Vercel dashboard.
3. Set every `.env.example` variable in Vercel's project settings.
4. Sign in once with the `BOOTSTRAP_SUPER_ADMIN_EMAIL` account to become
   the first super admin, then use `/sa` to promote/manage everyone else
   from there.
"# NexSpoofer-Website" 
