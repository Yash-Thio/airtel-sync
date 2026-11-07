"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { Button, Field } from "@/components/ui";

function LoginForm() {
  const next = useSearchParams().get("next") || "/orders";
  const { t } = useLang();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [needsProfile, setNeedsProfile] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sessionId = () => {
    try {
      return localStorage.getItem("udyam.sessionId") || undefined;
    } catch {
      return undefined;
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (!r?.ok) return setError(d?.error ?? t("login.sendErr"));
    setDevCode(typeof d?.devCode === "string" ? d.devCode : "");
    setStep("otp");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const lang = (() => {
      try {
        return localStorage.getItem("udyam.lang") || "en";
      } catch {
        return "en";
      }
    })();
    const r = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, name, businessName, language: lang, sessionId: sessionId() }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (r?.status === 422 || d?.needsProfile) {
      setNeedsProfile(true);
      setError(d?.error ?? t("login.profileErr"));
      return;
    }
    if (!r?.ok) return setError(d?.error ?? t("login.verifyErr"));
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/orders";
    window.location.assign(dest);
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-medium tracking-tight">{t("login.title")}</h1>
      <p className="mt-2 text-base text-muted">{t("login.lead")}</p>
      {step === "phone" ? (
        <form onSubmit={send} className="card mt-6 space-y-4">
          <Field
            label={t("login.phone")}
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("login.phonePh")}
            spellCheck={false}
            required
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t("login.sending") : t("login.send")}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="card mt-6 space-y-4">
          <p className="text-base">
            {t("login.sent")} <span className="font-medium">{phone}</span>.{" "}
            <button type="button" className="text-link" onClick={() => setStep("phone")}>
              {t("login.change")}
            </button>
          </p>
          {devCode && (
            <p className="rounded-md bg-surface px-3 py-2 text-base">
              {t("login.dev")}: <span translate="no">{devCode}</span>
            </p>
          )}
          <Field
            label={t("login.code")}
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            required
          />
          <Field
            label={needsProfile ? t("login.name") : t("login.nameOpt")}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <Field
            label={needsProfile ? t("login.business") : t("login.businessOpt")}
            name="organization"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            autoComplete="organization"
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t("login.checking") : t("login.continue")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-base text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
