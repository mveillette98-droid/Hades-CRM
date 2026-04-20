"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "./actions";

interface LoginFormProps {
  redirectTo?: string;
  initialError?: string;
  initialMessage?: string;
}

export function LoginForm({
  redirectTo,
  initialError,
  initialMessage,
}: LoginFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | undefined>(initialError);
  const [message, setMessage] = useState<string | undefined>(initialMessage);
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setError(undefined);
    setMessage(undefined);
    startTransition(async () => {
      const action = mode === "signin" ? signIn : signUp;
      const result = await action(formData);
      if (result?.error) setError(result.error);
      if (result?.message) setMessage(result.message);
    });
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/70 p-6 backdrop-blur shadow-card">
      <form
        action={onSubmit}
        className="space-y-5"
        aria-label={mode === "signin" ? "Sign in form" : "Create account form"}
      >
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="Matt Vicente"
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@hadesblueprint.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            placeholder="••••••••"
            minLength={8}
            required
          />
        </div>

        {redirectTo && (
          <input type="hidden" name="redirect" value={redirectTo} />
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-crimson-800/60 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-300"
          >
            {error}
          </p>
        )}
        {message && !error && (
          <p
            role="status"
            className="rounded-md border border-gold-700/50 bg-gold-900/10 px-3 py-2 text-sm text-gold-300"
          >
            {message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending}
        >
          {pending
            ? "Working…"
            : mode === "signin"
            ? "Enter the console"
            : "Create account"}
        </Button>
      </form>

      <div className="mt-5 text-center text-sm text-muted-foreground">
        {mode === "signin" ? (
          <>
            First time here?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(undefined);
                setMessage(undefined);
              }}
              className="font-medium text-crimson-500 hover:text-crimson-400"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(undefined);
                setMessage(undefined);
              }}
              className="font-medium text-crimson-500 hover:text-crimson-400"
            >
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
