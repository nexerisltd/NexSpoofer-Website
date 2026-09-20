import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertSafeToFetch, isMediaHostApproved } from "@/lib/security";
import { rewriteManifest } from "@/lib/hls";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: link } = await supabase.from("media_links").select("*").eq("public_id", id).maybeSingle();

  if (!link || link.status !== "active") {
    return errorResponse("LINK_NOT_FOUND", "This media link is unavailable.", 404);
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return errorResponse("LINK_EXPIRED", "This media link has expired.", 410);
  }
  if (link.media_type !== "hls") {
    return errorResponse("WRONG_KIND", "This link is not an HLS stream.", 400);
  }

  let originUrl: URL;
  try {
    originUrl = await assertSafeToFetch(link.media_url);
  } catch {
    return errorResponse("BLOCKED_ORIGIN", "Unable to load this media.", 502);
  }

  if (!(await isMediaHostApproved(originUrl.hostname))) {
    return errorResponse("DOMAIN_NOT_ALLOWED", "Unable to load this media.", 502);
  }

  let upstream: Response;
  try {
    upstream = await fetch(originUrl.toString(), {
      headers: link.referer_url ? { Referer: link.referer_url } : {},
      redirect: "follow",
    });
  } catch (e) {
    console.error("[NexSpoofer] manifest fetch failed:", e);
    return errorResponse("NETWORK_ERROR", "Unable to load this media.", 502);
  }
  if (!upstream.ok) {
    return errorResponse("NETWORK_ERROR", "Unable to load this media.", 502);
  }

  const text = await upstream.text();
  const rewritten = rewriteManifest(text, originUrl, link.public_id);

  // Fire-and-forget hit counter — not worth blocking the response on.
  supabase
    .from("media_links")
    .update({ hit_count: (link.hit_count ?? 0) + 1 })
    .eq("id", link.id)
    .then(() => {});

  return new NextResponse(rewritten, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
