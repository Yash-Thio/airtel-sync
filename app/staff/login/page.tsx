"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field } from "@/components/ui";

function StaffLoginForm() {
  const next = useSearchParams().get("next") || "/backoffice";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (!r?.ok) return setError(d?.error ?? "Could not sign in.");
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/backoffice";
    window.location.assign(dest);
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-medium tracking-tight">Staff sign in</h1>
      <p className="mt-2 text-base text-muted">Sales, partner and admin accounts. This page is not part of the customer journey.</p>
      <form onSubmit={submit} className="card mt-6 space-y-4">
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          spellCheck={false}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-base text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <StaffLoginForm />
    </Suspense>
  );
}
