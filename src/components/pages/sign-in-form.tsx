"use client";

import { ArrowRight, Mail, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";
type Method = "password" | "link";

export function SignInForm({ initialMode, emailLive, linkError }: { initialMode: Mode; emailLive: boolean; linkError: string | null }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<Method>("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "That sign-in link has expired or was already used. Ask for a new one." : null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      if (method === "link") {
        const res = await authClient.signIn.magicLink({ email, callbackURL: "/today", newUserCallbackURL: "/onboarding", errorCallbackURL: "/sign-in?error=link" });
        if (res.error) throw new Error(res.error.message);
        setSentTo(email);
        return;
      }
      if (mode === "sign-up") {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await authClient.signUp.email({ email, password, name, timezone } as Parameters<typeof authClient.signUp.email>[0]);
        if (res.error) throw new Error(res.error.message);
        router.replace("/onboarding");
        router.refresh();
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.status === 401 ? "That email and password don’t match." : res.error.message);
        router.replace("/today");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div>
        <div className="band flex items-start gap-3 rounded-[2px] px-4 pt-5 pb-4">
          <MailCheck className="mt-1.5 size-6 shrink-0" />
          <h1 className="text-title leading-tight font-extrabold tracking-[-0.02em]">Check your inbox</h1>
        </div>
        <div className="grid gap-4 px-3.5 pt-5 pb-4">
          <p className="text-body text-ink-2">
            We sent a sign-in link to <span className="font-bold text-ink">{sentTo}</span>. It works once, for 15 minutes.
          </p>
          {!emailLive && (
            <p className="rounded-[2px] border-[1.5px] border-dashed border-pencil bg-paper-2 px-3 py-2 text-small text-ink-2">
              Email isn’t connected on this server, so nothing was actually sent. On a development server the link is printed in the terminal running Vele.
            </p>
          )}
          <Button variant="ghost" className="justify-self-start" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="band rounded-[2px] px-4 pt-5 pb-4">
        <h1 className="text-title leading-tight font-extrabold tracking-[-0.02em]">{mode === "sign-in" ? "Sign in to Vele" : "Create your calendar"}</h1>
        <p className="mt-1 text-body text-band-ink-2">{mode === "sign-in" ? "Welcome back." : "A calendar with an assistant that understands it."}</p>
      </div>
      <div className="grid gap-5 px-3.5 pt-5 pb-4">
        <Segmented
          label="Sign-in method"
          value={method}
          onChange={(v) => {
            setMethod(v);
            setError(null);
          }}
          options={[
            { value: "password", label: "Password" },
            { value: "link", label: "Email me a link" },
          ]}
          className="flex w-full [&>*]:flex-1"
        />

        <form className="grid gap-4" onSubmit={submit}>
          {mode === "sign-up" && method === "password" && <Field label="Your name">{(a) => <Input {...a} name="name" required maxLength={100} autoComplete="name" />}</Field>}
          <Field label="Email">{(a) => <Input {...a} name="email" type="email" required autoComplete="email" inputMode="email" />}</Field>
          {method === "password" && (
            <Field label="Password" hint={mode === "sign-up" ? "At least 10 characters." : undefined}>
              {(a) => (
                <Input
                  {...a}
                  name="password"
                  type="password"
                  required
                  minLength={mode === "sign-up" ? 10 : 1}
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                />
              )}
            </Field>
          )}
          {error && (
            <p role="alert" className="rounded-[2px] border border-red-ink bg-red-wash px-3 py-2 text-small font-semibold text-red-ink-text">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            {method === "link" ? (
              <>
                <Mail /> Send me a sign-in link
              </>
            ) : mode === "sign-in" ? (
              <>
                Sign in <ArrowRight />
              </>
            ) : (
              <>
                Create account <ArrowRight />
              </>
            )}
          </Button>
        </form>

        {method === "password" && (
          <p className="text-body text-graphite">
            {mode === "sign-in" ? "New here? " : "Already have an account? "}
            <button
              className="font-bold text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
              }}
            >
              {mode === "sign-in" ? "Create an account" : "Sign in"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
