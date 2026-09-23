import type { Env, MediaLink } from "./types";
import { getLinkByPublicId, getApprovedHostsFromDb, bumpHitCount } from "./supabase";
import { assertSafeUrl, getEnvAllowedHosts, isHostnameAllowed, isSameOrigin } from "./security";
import { decryptUrl } from "./crypto";
import { rewriteManifest } from "./hls";

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
    Vary: "Origin",
  };
}

function errorResponse(env: Env, code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

/**
 * CORS headers only stop a BROWSER from letting cross-origin JS read the
 * response — they do nothing against a direct curl/wget/download-manager
 * hit, which never sends a preflight and ignores CORS entirely. Since every
 * URL this Worker serves is otherwise unauthenticated (the browser needs to
 * load segments without a cookie round-trip each time), this Referer/Origin
 * check is the actual guard against someone copying a Network-tab URL out
 * of DevTools and reusing/hotlinking/leaking it elsewhere. Not bulletproof
 * (a Referer header can be forged outside a browser), but it stops the
 * common leak path.
 */
function isTrustedReferer(request: Request, env: Env): boolean {
  if (!env.ALLOWED_ORIGIN) return true; // not configured — don't break existing deployments
  let allowedHost: string;
  try {
    allowedHost = new URL(env.ALLOWED_ORIGIN).hostname.toLowerCase();
  } catch {
    return true;
  }
  const referer = request.headers.get("referer") || request.headers.get("origin");
  if (!referer) return false;
  try {
    return new URL(referer).hostname.toLowerCase() === allowedHost;
  } catch {
    return false;
  }
}

async function isApproved(env: Env, hostname: string): Promise<boolean> {
  const envHosts = getEnvAllowedHosts(env);
  const dbHosts = await getApprovedHostsFromDb(env);
  const hosts = Array.from(new Set([...envHosts, ...dbHosts]));
  if (!hosts.length) return false; // deny-by-default, same as the Next.js side
  return isHostnameAllowed(hostname, hosts);
}

async function handleDirect(env: Env, request: Request, link: MediaLink): Promise<Response> {
  if (link.media_type !== "direct") {
    return errorResponse(env, "WRONG_KIND", "This link is not a direct media file.", 400);
  }

  let target: URL;
  try {
    target = assertSafeUrl(link.media_url);
  } catch {
    return errorResponse(env, "BLOCKED_ORIGIN", "Unable to load this media.", 502);
  }
  if (!(await isApproved(env, target.hostname))) {
    return errorResponse(env, "DOMAIN_NOT_ALLOWED", "Unable to load this media.", 502);
  }

  const range = request.headers.get("range") || undefined;
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: {
        ...(link.referer_url ? { Referer: link.referer_url } : {}),
        ...(range ? { Range: range } : {}),
      },
      redirect: "follow",
    });
  } catch (e) {
    console.error("[NexSpoofer worker] direct fetch failed:", e);
    return errorResponse(env, "NETWORK_ERROR", "Unable to load this media.", 502);
  }

  bumpHitCount(env, link.id, link.hit_count);

  const headers = new Headers(corsHeaders(env));
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Robots-Tag", "noindex");

  return new Response(upstream.body, { status: upstream.status, headers });
}

async function handleManifest(env: Env, link: MediaLink, workerOrigin: string): Promise<Response> {
  if (link.media_type !== "hls") {
    return errorResponse(env, "WRONG_KIND", "This link is not an HLS stream.", 400);
  }

  let originUrl: URL;
  try {
    originUrl = assertSafeUrl(link.media_url);
  } catch {
    return errorResponse(env, "BLOCKED_ORIGIN", "Unable to load this media.", 502);
  }
  if (!(await isApproved(env, originUrl.hostname))) {
    return errorResponse(env, "DOMAIN_NOT_ALLOWED", "Unable to load this media.", 502);
  }

  let upstream: Response;
  try {
    upstream = await fetch(originUrl.toString(), {
      headers: link.referer_url ? { Referer: link.referer_url } : {},
      redirect: "follow",
    });
  } catch (e) {
    console.error("[NexSpoofer worker] manifest fetch failed:", e);
    return errorResponse(env, "NETWORK_ERROR", "Unable to load this media.", 502);
  }
  if (!upstream.ok) {
    return errorResponse(env, "NETWORK_ERROR", "Unable to load this media.", 502);
  }

  const text = await upstream.text();
  const rewritten = await rewriteManifest(env, text, originUrl, link.public_id, workerOrigin);

  bumpHitCount(env, link.id, link.hit_count);

  return new Response(rewritten, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...corsHeaders(env),
    },
  });
}

async function handleSegment(env: Env, request: Request, link: MediaLink, token: string, workerOrigin: string): Promise<Response> {
  let absoluteUrl: string;
  try {
    absoluteUrl = await decryptUrl(env, token);
  } catch {
    return errorResponse(env, "BAD_TOKEN", "Invalid media reference.", 400);
  }

  let target: URL;
  try {
    target = assertSafeUrl(absoluteUrl);
  } catch {
    return errorResponse(env, "BLOCKED_ORIGIN", "Unable to load this media.", 502);
  }

  let originHostname = target.hostname;
  try {
    originHostname = new URL(link.media_url).hostname;
  } catch {
    /* fall back to target's own hostname */
  }

  const approved = await isApproved(env, target.hostname);
  const sameSite = isSameOrigin(target.hostname, originHostname);
  if (!approved && !sameSite) {
    return errorResponse(env, "DOMAIN_NOT_ALLOWED", "Unable to load this media.", 502);
  }

  const range = request.headers.get("range") || undefined;
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        ...(link.referer_url ? { Referer: link.referer_url } : {}),
        ...(range ? { Range: range } : {}),
      },
      redirect: "follow",
    });
  } catch (e) {
    console.error("[NexSpoofer worker] segment fetch failed:", e);
    return errorResponse(env, "NETWORK_ERROR", "Unable to load this media.", 502);
  }

  const contentType = upstream.headers.get("content-type") || "";
  const looksLikePlaylist = target.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

  if (looksLikePlaylist) {
    const text = await upstream.text();
    const rewritten = await rewriteManifest(env, text, target, link.public_id, workerOrigin);
    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
        ...corsHeaders(env),
      },
    });
  }

  const headers = new Headers(corsHeaders(env));
  headers.set("Content-Type", contentType || "application/octet-stream");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Accept-Ranges", "bytes");
  // Segments are content-addressed by an encrypted, immutable token — the
  // same token always decrypts to the same origin URL, so caching the
  // bytes is safe and meaningfully cuts repeat-fetch/retry latency.
  headers.set("Cache-Control", "public, max-age=3600, immutable");
  headers.set("X-Robots-Tag", "noindex");

  return new Response(upstream.body, { status: upstream.status, headers });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(env, "METHOD_NOT_ALLOWED", "Method not allowed.", 405);
    }

    // Anti-leak guard — reject before even touching Supabase. A viewer's
    // browser always sends Referer/Origin for a normal <video>/hls.js
    // request made from a page on the app; a copy-pasted URL hit directly,
    // from another site's embed, or from a bulk downloader typically won't.
    if (!isTrustedReferer(request, env)) {
      return errorResponse(env, "FORBIDDEN_ORIGIN", "Unable to load this media.", 403);
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["media", id, ...rest]

    if (parts[0] !== "media" || !parts[1]) {
      return errorResponse(env, "NOT_FOUND", "Not found.", 404);
    }
    const id = parts[1];
    const rest = parts.slice(2);

    const link = await getLinkByPublicId(env, id);
    if (!link || link.status !== "active") {
      return errorResponse(env, "LINK_NOT_FOUND", "This media link is unavailable.", 404);
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return errorResponse(env, "LINK_EXPIRED", "This media link has expired.", 410);
    }

    try {
      if (rest.length === 0) return await handleDirect(env, request, link);
      if (rest[0] === "manifest") return await handleManifest(env, link, url.origin);
      if (rest[0] === "seg" && rest[1]) return await handleSegment(env, request, link, rest[1], url.origin);
    } catch (e) {
      console.error("[NexSpoofer worker] unhandled error:", e);
      return errorResponse(env, "NETWORK_ERROR", "Unable to load this media.", 502);
    }

    return errorResponse(env, "NOT_FOUND", "Not found.", 404);
  },
};

export default worker;
