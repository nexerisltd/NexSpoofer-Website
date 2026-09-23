import { NextRequest } from "next/server";

/**
 * CORS headers (Access-Control-Allow-Origin etc.) are advisory — they only
 * stop a BROWSER from letting cross-origin JS read a response. They do
 * nothing to stop a direct curl/wget/download-manager request, which never
 * sends a preflight and ignores CORS entirely. Since every media URL these
 * routes serve is otherwise unauthenticated (that's the whole point — the
 * browser needs to load video bytes without a cookie round-trip per
 * segment), the only thing standing between "shared with someone who's
 * signed in" and "leaked to the entire internet" is checking that the
 * request actually came from a page on this app.
 *
 * This is NOT bulletproof — a determined script can fake a Referer header.
 * It stops the common case: someone opens DevTools → Network tab, copies a
 * segment/manifest URL, and pastes it into another site's <video> tag, a
 * hotlink, or a bulk-downloader. All of those omit or send the wrong
 * Referer/Origin and get rejected here.
 */
export function isTrustedReferer(req: NextRequest): boolean {
  const appOrigin = process.env.APP_BASE_URL;
  if (!appOrigin) return true; // not configured — don't break existing deployments

  const referer = req.headers.get("referer") || req.headers.get("origin");
  if (!referer) return false; // no Referer/Origin at all = not a real page load

  try {
    return new URL(referer).host === new URL(appOrigin).host;
  } catch {
    return false;
  }
}
