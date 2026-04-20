import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata = { title: "Team — Hades Blueprint CRM" };

export default async function TeamPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: "admin" | "member" }>();

  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <>
      <TopBar title="Team" />
      <main className="flex-1 px-8 py-8">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Team management — admin only</CardTitle>
            <CardDescription>
              Invite collaborators, assign roles, and transfer ownership of
              leads. Ships with the full lead CRUD in Step 2.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </>
  );
}
