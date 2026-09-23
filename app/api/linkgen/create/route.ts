import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePublicId } from "@/lib/ids";
import { assertSafeToFetch, isMediaHostApproved } from "@/lib/security";
import { requireRole } from "@/lib/auth";
import { userHasServerAccess } from "@/lib/servers";

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
  if (typeof body.serverId !== "string" || !body.serverId.trim()) {
    return NextResponse.json(
      { success: false, error: { code: "SERVER_REQUIRED", message: "Select a server first." } },
      { status: 400 }
    );
  }

  // These two checks don't depend on each other — running them together
  // roughly halves the wall-clock time this route takes before it can even
  // start the insert, since assertSafeToFetch does a real DNS round-trip.
  const [safeUrlResult, hasServerAccess] = await Promise.allSettled([
    assertSafeToFetch(body.mediaUrl),
    userHasServerAccess(auth.user.id, auth.profile.role, body.serverId),
  ]);

  if (safeUrlResult.status === "rejected") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_URL", message: "This media URL cannot be used." } },
      { status: 400 }
    );
  }
  if (hasServerAccess.status === "rejected" || !hasServerAccess.value) {
    return NextResponse.json(
      { success: false, error: { code: "SERVER_NOT_ALLOWED", message: "You don't have access to that server." } },
      { status: 403 }
    );
  }
  const target = safeUrlResult.value;

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
    server_id: body.serverId,
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

  // Fire-and-forget — the link is already created and safe to hand back;
  // the audit trail doesn't need to hold up the response.
  supabase
    .from("audit_logs")
    .insert({
      actor_user_id: auth.user.id,
      action: "LINK_CREATED",
      target_type: "media_link",
      target_id: publicId,
      metadata: { kind, server_id: body.serverId },
    })
    .then(() => {});

  const base = process.env.APP_BASE_URL || req.nextUrl.origin;
  return NextResponse.json({ success: true, id: publicId, url: `${base}/p/${publicId}`, expiresAt });
}
