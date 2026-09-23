import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertSafeToFetch, isMediaHostApproved, isSameOrigin } from "@/lib/security";
import { decryptUrl } from "@/lib/crypto";
import { rewriteManifest } from "@/lib/hls";
import { isTrustedReferer } from "@/lib/referer-check";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  if (!isTrustedReferer(req)) {
    return errorResponse("FORBIDDEN_ORIGIN", "Unable to load this media.", 403);
  }

  const { id, token } = await params;
  const supabase = createServiceClient();
  const { data: link } = await supabase.from("media_links").select("*").eq("public_id", id).maybeSingle();

  if (!link || link.status !== "active") {
    return errorResponse("LINK_NOT_FOUND", "This media link is unavailable.", 404);
  }

  let absoluteUrl: string;
  try {
    absoluteUrl = decryptUrl(token);
  } catch {
    return errorResponse("BAD_TOKEN", "Invalid media reference.", 400);
  }

  let target: URL;
  try {
    target = await assertSafeToFetch(absoluteUrl);
  } catch {
    return errorResponse("BLOCKED_ORIGIN", "Unable to load this media.", 502);
  }

  let originHostname = target.hostname;
  try {
    originHostname = new URL(link.media_url).hostname;
  } catch {
    /* fall back to target's own hostname */
  }

  const approved = await isMediaHostApproved(target.hostname);
  const sameSite = isSameOrigin(target.hostname, originHostname);
  if (!approved && !sameSite) {
    return errorResponse("DOMAIN_NOT_ALLOWED", "Unable to load this media.", 502);
  }

  const range = req.headers.get("range") || undefined;
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
    console.error("[NexSpoofer] segment fetch failed:", e);
    return errorResponse("NETWORK_ERROR", "Unable to load this media.", 502);
  }

  const contentType = upstream.headers.get("content-type") || "";
  const looksLikePlaylist =
    target.pathname.toLowerCase().endsWith(".m3u8") || contentType.includes("mpegurl");

  if (looksLikePlaylist) {
    const text = await upstream.text();
    const rewritten = rewriteManifest(text, target, link.public_id);
    return new NextResponse(rewritten, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType || "application/octet-stream");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
