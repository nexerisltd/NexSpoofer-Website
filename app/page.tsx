import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";

export default async function RootPage() {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login");
  if (profile.role === "admin" || profile.role === "super_admin") redirect("/LinkGen");
  redirect("/login");
}
