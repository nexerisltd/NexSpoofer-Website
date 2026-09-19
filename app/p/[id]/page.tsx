import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import Player from "@/components/player/Player";
import ImageViewer from "@/components/player/ImageViewer";

export const metadata = {
  robots: { index: false, follow: false },
};

function ErrorState({ message }: { message: string }) {
  return (
    <main className="stage">
      <div className="glass-card" style={{ maxWidth: 420, textAlign: "center" }}>
        <p style={{ margin: 0 }}>{message}</p>
      </div>
    </main>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Per spec §12 step 1: viewing a generated link still requires sign-in —
  // this is not an anonymous-public player.
  const { user, profile } = await getSessionProfile();
  if (!user) {
    redirect(`/login?next=/p/${id}`);
  }
  if (profile.status !== "active") {
    return <ErrorState message="You are not authorized to access this media." />;
  }

  const supabase = createServiceClient();
  const { data: link } = await supabase
    .from("media_links")
    .select("public_id, media_type, status, expires_at")
    .eq("public_id", id)
    .maybeSingle();

  if (!link || link.status !== "active") {
    return <ErrorState message="This media link has expired." />;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <ErrorState message="This media link has expired." />;
  }

  if (link.media_type === "hls") {
    return <Player kind="hls" manifestUrl={`/api/media/${id}/manifest`} />;
  }

  // "direct" kind covers both video files (mp4/webm) and images — decide
  // at render time based on the actual response Content-Type rather than
  // guessing from the (never-exposed) original URL's extension.
  return <Player kind="direct" mediaUrl={`/api/media/${id}`} fallback={<ImageViewer src={`/api/media/${id}`} />} />;
}
