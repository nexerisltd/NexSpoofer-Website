import { redirect } from "next/navigation";
import Image from "next/image";
import { getSessionProfile } from "@/lib/auth";
import LinkGenForm from "@/components/linkgen/LinkGenForm";
import LiveStatusWidget from "@/components/ui/LiveStatusWidget";

export default async function LinkGenPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) {
    redirect("/login?next=/LinkGen");
  }
  if (profile.status !== "active") {
    return <p className="unauthorized-note">Your account is suspended.</p>;
  }
  if (profile.role !== "admin" && profile.role !== "super_admin") {
    return <p className="unauthorized-note">You are not authorized to access this page.</p>;
  }

  return (
    <main style={{ minHeight: "100dvh", padding: "28px 32px" }}>
      <div className="page-header" style={{ maxWidth: 1080, margin: "0 auto 48px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/logo.png" alt="" width={40} height={40} />
          <div>
            <div className="brand-mark" style={{ marginBottom: 0 }}>
              <span className="nex">Nex</span>
              <span className="rest">Spoofer</span>
            </div>
            <div className="muted" style={{ margin: 0, fontSize: 11.5 }}>
              Link Generator · Share · Spoof
            </div>
          </div>
        </div>
        <LiveStatusWidget />
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <LinkGenForm />
      </div>
    </main>
  );
}
