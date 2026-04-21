import { redirect } from "next/navigation";
import { HBLogo } from "@/components/hb-logo";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Hades Blueprint CRM" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; error?: string; message?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(searchParams.redirect || "/dashboard");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-16 overflow-hidden">
      {/* Ambient crimson glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% -10%, rgba(220,38,38,0.18), transparent 60%), radial-gradient(ellipse 40% 30% at 50% 110%, rgba(234,179,8,0.05), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center text-center">
          <HBLogo size={44} />
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight hb-gradient-text">
            Hades Blueprint
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-crimson-500">
            Operator Console
          </p>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Pick up the phone and start fucking dialling. Let&rsquo;s get
            this money.
          </p>
        </div>

        <LoginForm
          redirectTo={searchParams.redirect}
          initialError={searchParams.error}
          initialMessage={searchParams.message}
        />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Built for Hades Blueprint —{" "}
          <span className="text-crimson-500">Bold. Sharp. Execute.</span>
        </p>
      </div>
    </main>
  );
}
