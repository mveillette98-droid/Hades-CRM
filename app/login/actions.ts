"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionResult = {
  error?: string;
  message?: string;
};

function safeRedirect(target: string | undefined | null): string {
  if (!target || !target.startsWith("/")) return "/dashboard";
  if (target.startsWith("//")) return "/dashboard";
  return target;
}

export async function signIn(formData: FormData): Promise<AuthActionResult | void> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const redirectTo = safeRedirect(String(formData.get("redirect") || ""));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(redirectTo);
}

export async function signUp(formData: FormData): Promise<AuthActionResult | void> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const redirectTo = safeRedirect(String(formData.get("redirect") || ""));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) return { error: error.message };

  // If email confirmation is disabled, the user is logged in immediately.
  if (data.session) {
    redirect(redirectTo);
  }

  return {
    message:
      "Account created. Check your email to confirm, then sign in above.",
  };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
