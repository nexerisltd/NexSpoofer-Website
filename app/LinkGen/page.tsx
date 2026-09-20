import { redirect } from "next/navigation";
import Image from "next/image";
import { getSessionProfile } from "@/lib/auth";
import LinkGenForm from "@/components/linkgen/LinkGenForm";

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
    <main className="page-shell">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.png" alt="" width={28} height={28} />
          <div className="brand-mark">NexSpoofer</div>
        </div>
      </div>
      <LinkGenForm />
    </main>
  );
}
