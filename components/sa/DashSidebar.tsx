import Image from "next/image";
import { LayoutDashboard, Users, Link2, FileText, Settings, LogOut } from "lucide-react";
import { signOutAction } from "@/app/sa/actions";

export default function DashSidebar({ email }: { email: string | null }) {
  const initial = (email || "?").charAt(0).toUpperCase();

  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-brand">
        <Image src="/logo.png" alt="" width={32} height={32} />
        <div>
          <div className="brand-mark" style={{ fontSize: 15, marginBottom: 0 }}>
            <span className="nex">Nex</span>
            <span className="rest">Spoofer</span>
          </div>
          <div className="sub">Super Admin</div>
        </div>
      </div>

      <nav className="dash-nav">
        <a href="#top" className="dash-nav-item active">
          <LayoutDashboard size={16} /> Dashboard
        </a>
        <a href="#users" className="dash-nav-item">
          <Users size={16} /> Users
        </a>
        <a href="#media-links" className="dash-nav-item">
          <Link2 size={16} /> Media Links
        </a>
        <a href="#audit-logs" className="dash-nav-item">
          <FileText size={16} /> Audit Logs
        </a>
        <a href="#domains" className="dash-nav-item">
          <Settings size={16} /> Settings
        </a>
      </nav>

      <div className="dash-sidebar-profile">
        <div className="avatar">{initial}</div>
        <div className="who">
          <div className="name">Super Admin</div>
          <div className="email">{email}</div>
        </div>
        <form action={signOutAction}>
          <button type="submit" title="Sign out">
            <LogOut size={15} />
          </button>
        </form>
      </div>
    </aside>
  );
}
