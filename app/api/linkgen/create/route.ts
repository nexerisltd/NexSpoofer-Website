import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePublicId } from "@/lib/ids";
import { assertSafeToFetch, isMediaHostApproved } from "@/lib/security";
import { requireRole } from "@/lib/auth";

function detectKind(url: string): "hls" | "direct" {
  return /\.m3u8(\?|$)/i.test(url) ? "hls" : "direct";
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin", "super_admin"]);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: auth.message } },
      { status: auth.status }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.mediaUrl !== "string" || !body.mediaUrl.trim()) {
    return NextResponse.json(
      { success: false, error: { code: "MEDIA_URL_REQUIRED", message: "Media URL is required." } },
      { status: 400 }
    );
  }

  let target: URL;
  try {
    target = await assertSafeToFetch(body.mediaUrl);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_URL", message: "This media URL cannot be used." } },
      { status: 400 }
    );
  }

  if (!(await isMediaHostApproved(target.hostname))) {
    return NextResponse.json(
      { success: false, error: { code: "DOMAIN_NOT_ALLOWED", message: "This media host is not on the approved list. Add it from /sa first." } },
      { status: 403 }
    );
  }

  const kind = detectKind(target.toString());
  const supabase = createServiceClient();
  const publicId = generatePublicId(10);

  const ttlHours = Number(body.ttlHours) > 0 ? Number(body.ttlHours) : 24;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const { error } = await supabase.from("media_links").insert({
    public_id: publicId,
    media_type: kind,
    media_url: target.toString(),
    referer_url: body.refererUrl?.trim() || null,
    created_by: auth.user.id,
    status: "active",
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[NexSpoofer] link insert failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "DB_ERROR", message: "Could not create link." } },
      { status: 500 }
    );
  }

  await supabase.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    action: "LINK_CREATED",
    target_type: "media_link",
    target_id: publicId,
    metadata: { kind },
  });

  const base = process.env.APP_BASE_URL || req.nextUrl.origin;
  return NextResponse.json({ success: true, id: publicId, url: `${base}/p/${publicId}`, expiresAt });
}
