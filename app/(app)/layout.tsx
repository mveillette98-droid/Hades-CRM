import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/layout/sidebar-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle<{ id: string; email: string; full_name: string | null; role: "admin" | "member" }>();

  const role = profile?.role ?? "member";
  const name = profile?.full_name || user.email?.split("@")[0] || "User";
  const email = profile?.email || user.email || "";

  return (
    <div className="flex min-h-screen">
      <SidebarNav role={role} userName={name} userEmail={email} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
