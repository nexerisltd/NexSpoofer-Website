import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertSafeToFetch, isHostnameAllowed, getAllowedHosts } from "@/lib/security";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: link } = await supabase.from("media_links").select("*").eq("public_id", id).maybeSingle();

  if (!link || link.status !== "active") {
    return errorResponse("LINK_NOT_FOUND", "This media link is unavailable.", 404);
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return errorResponse("LINK_EXPIRED", "This media link has expired.", 410);
  }
  if (link.media_type !== "direct") {
    return errorResponse("WRONG_KIND", "This link is not a direct media file.", 400);
  }

  let target: URL;
  try {
    target = await assertSafeToFetch(link.media_url);
  } catch {
    return errorResponse("BLOCKED_ORIGIN", "Unable to load this media.", 502);
  }

  const allowlist = await getAllowedHosts();
  if (allowlist.length && !isHostnameAllowed(target.hostname, allowlist)) {
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
    console.error("[NexSpoofer] direct media fetch failed:", e);
    return errorResponse("NETWORK_ERROR", "Unable to load this media.", 502);
  }

  supabase
    .from("media_links")
    .update({ hit_count: (link.hit_count ?? 0) + 1 })
    .eq("id", link.id)
    .then(() => {});

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
