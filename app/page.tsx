import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingA } from "@/components/landing/landing-a";
import { LandingB } from "@/components/landing/landing-b";

export const dynamic = "force-dynamic";

/** Front door. Signed in: straight to the dashboard. Signed out: the landing page. */
export default async function RootPage({ searchParams }: { searchParams: { v?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  // Two options while Matt picks one. ?v=b shows option B.
  return searchParams.v === "b" ? <LandingB /> : <LandingA />;
}
