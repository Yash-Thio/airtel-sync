"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/LanguageProvider";
import { CONSENT_VERSION, DEMO_ESIGN_OTP } from "@/lib/kyc/consent";
import { maskConsumerNo, maskGstin, maskIdNumber, maskUdyam } from "@/lib/kyc/mask";
import { SPECIMENS, specimenUrl } from "@/lib/kyc/specimens";
import "@/lib/kyc/strings";
import {
  DOC_FIELDS,
  DOC_SLOTS,
  SENSITIVE_FIELDS,
  type CheckResult,
  type DocSlot,
  type ExtractedDocs,
  type Fields,
  type ScanQuality,
  type ValidateResult,
} from "@/lib/kyc/types";

interface DocState {
  fileName: string;
  previewUrl?: string;
  specimenUrl?: string;
  fields: Fields;
  quality: ScanQuality;
  needsManualReview: boolean;
  notes: string[];
  source: string;
  docRef: string;
}

const STEPS = ["consent", "upload", "review", "checks", "esign"] as const;
type Step = (typeof STEPS)[number];

const MASKERS: Record<string, (v?: string | null) => string> = {
  gstin: maskGstin,
  udyam_number: maskUdyam,
  id_number: maskIdNumber,
  consumer_no: maskConsumerNo,
};

const card = "card";
const btnPrimary = "btn btn-primary";
const btnGhost = "btn btn-secondary";

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, data };
}

function KycFlow() {
  const { t, lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const quoteParam = params.get("quote") ?? undefined;

  const [step, setStep] = useState<Step>("consent");
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [kycId, setKycId] = useState<string>();
  const [quoteNote, setQuoteNote] = useState<"linked" | "missing" | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocSlot, DocState>>>({});
  const [busy, setBusy] = useState<Partial<Record<DocSlot, boolean>>>({});
  const [udyamNone, setUdyamNone] = useState(false);
  const [specimenId, setSpecimenId] = useState("K03");
  const [loadingSpecimen, setLoadingSpecimen] = useState<string>();
  const [result, setResult] = useState<ValidateResult>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [signed, setSigned] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string>();
  const [erased, setErased] = useState(false);
  const blobUrls = useRef<string[]>([]);

  useEffect(() => () => blobUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const stepIndex = STEPS.indexOf(step);

  // ---------- consent ----------
  const submitConsent = async () => {
    setError(undefined);
    const { ok, data } = await postJson<{ kycId: string; quoteFound: boolean | null }>("/api/kyc/consent", {
      acknowledged: agree,
      marketingOptIn: marketing,
      quoteId: quoteParam,
      lang,
    });
    if (!ok) return setError(data.error ?? t("common.error"));
    setKycId(data.kycId);
    setQuoteNote(quoteParam ? (data.quoteFound ? "linked" : "missing") : null);
    setStep("upload");
  };

  // ---------- upload / extract ----------
  const extract = useCallback(async (slot: DocSlot, file: File, extra?: { specimenUrl?: string }) => {
    setBusy((b) => ({ ...b, [slot]: true }));
    setError(undefined);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("docType", slot);
      const res = await fetch("/api/kyc/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "extract failed");
      let previewUrl: string | undefined = extra?.specimenUrl;
      if (!previewUrl) {
        previewUrl = URL.createObjectURL(file);
        blobUrls.current.push(previewUrl);
      }
      setDocs((d) => ({
        ...d,
        [slot]: {
          fileName: file.name,
          previewUrl,
          specimenUrl: extra?.specimenUrl,
          fields: data.fields,
          quality: data.quality,
          needsManualReview: data.needsManualReview,
          notes: data.notes ?? [],
          source: data.source,
          docRef: data.docRef,
        },
      }));
      setResult(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy((b) => ({ ...b, [slot]: false }));
    }
  }, [t]);

  const loadSpecimen = async (id: string, simulatedDelayMs = 0) => {
    const sp = SPECIMENS.find((s) => s.id === id);
    if (!sp) return;
    setLoadingSpecimen(id);
    setError(undefined);
    try {
      if (simulatedDelayMs) await new Promise((r) => setTimeout(r, simulatedDelayMs));
      setDocs({});
      setUdyamNone(false);
      setResult(undefined);
      await Promise.all(
        sp.slots.map(async (slot) => {
          const url = specimenUrl(id, slot);
          const blob = await (await fetch(url)).blob();
          await extract(slot, new File([blob], `${id}_${slot}.png`, { type: blob.type || "image/png" }), { specimenUrl: url });
        }),
      );
    } finally {
      setLoadingSpecimen(undefined);
    }
  };

  const required: DocSlot[] = ["gst_certificate", "signatory_id", "address_proof"];
  const haveRequired = required.every((s) => docs[s]);
  const anyBusy = Object.values(busy).some(Boolean) || !!loadingSpecimen;

  // ---------- review / validate ----------
  const setField = (slot: DocSlot, key: string, value: string) =>
    setDocs((d) => (d[slot] ? { ...d, [slot]: { ...d[slot]!, fields: { ...d[slot]!.fields, [key]: value } } } : d));

  const runChecks = async () => {
    setChecking(true);
    setError(undefined);
    const extracted: ExtractedDocs = {};
    const quality: Partial<Record<DocSlot, ScanQuality>> = {};
    const refs: Partial<Record<DocSlot, { fileName: string; url?: string }>> = {};
    for (const s of DOC_SLOTS) {
      const d = docs[s];
      if (!d) continue;
      extracted[s] = d.fields;
      quality[s] = d.quality;
      // Reference only: specimen public path, or the opaque content hash for real uploads (no raw image is kept).
      refs[s] = { fileName: d.specimenUrl ? d.fileName : d.docRef, url: d.specimenUrl };
    }
    const { ok, data } = await postJson<ValidateResult>("/api/kyc/validate", {
      docs: extracted,
      quality,
      udyamDeclaredNone: udyamNone,
      kycId,
      refs,
    });
    setChecking(false);
    if (!ok) return setError(data.error ?? t("common.error"));
    setResult(data);
    setStep("checks");
  };

  // ---------- e-sign / complete ----------
  const sendOtp = async () => {
    setError(undefined);
    const { ok, data } = await postJson("/api/kyc/esign", { kycId, action: "send" });
    if (!ok) return setError(data.error ?? t("common.error"));
    setOtpSent(true);
  };
  const verifyOtp = async () => {
    setError(undefined);
    const { ok, data } = await postJson("/api/kyc/esign", { kycId, action: "verify", otp });
    if (!ok) return setError(data.error ?? t("common.error"));
    setSigned(true);
  };
  const finish = async () => {
    setFinishing(true);
    setError(undefined);
    const done = await postJson<{ quoteId: string | null }>("/api/kyc/complete", { kycId });
    if (!done.ok) {
      setFinishing(false);
      return setError(done.data.error ?? t("common.error"));
    }
    const quoteId = done.data.quoteId ?? undefined;
    if (!quoteId) {
      setFinishing(false);
      return setDoneMsg(t("kyc.done.noQuote"));
    }
    const ord = await postJson<{ orderId: string }>("/api/orders", { quoteId, kycId });
    setFinishing(false);
    if (ord.ok && ord.data.orderId) router.push(`/orders/${ord.data.orderId}`);
    else setDoneMsg(t("kyc.done.orderFailed"));
  };

  const withdraw = async () => {
    if (!kycId) return;
    await fetch(`/api/kyc/consent?kycId=${encodeURIComponent(kycId)}`, { method: "DELETE" });
    setKycId(undefined);
    setDocs({});
    setResult(undefined);
    setAgree(false);
    setMarketing(false);
    setSigned(false);
    setOtpSent(false);
    setStep("consent");
    setErased(true);
  };

  // ---------- render ----------
  const verdictTone =
    result?.verdict === "verified" ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : result?.verdict === "needs_attention" ? "border-amber-300 bg-amber-50 text-amber-900"
    : "border-rose-300 bg-rose-50 text-rose-900";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("kyc.title")}</h1>
        {quoteNote === "linked" && <p className="mt-1 text-sm text-slate-600">{t("kyc.linkedQuote")} {quoteParam}</p>}
        {quoteNote === "missing" && <p className="mt-1 text-sm text-amber-700">{t("kyc.quoteMissing")}</p>}
      </div>

      {/* Stepper */}
      <nav aria-label="Progress" className="space-y-2">
        <p className="text-sm text-slate-600 sm:hidden">
          {stepIndex + 1} / {STEPS.length}: {t(`kyc.step.${step}`)}
        </p>
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col gap-1" aria-current={i === stepIndex ? "step" : undefined}>
              <span className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-action" : "bg-slate-200"}`} />
              <span className={`hidden text-xs sm:block ${i === stepIndex ? "font-semibold text-ink" : "text-slate-500"}`}>
                {i + 1}. {t(`kyc.step.${s}`)}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      {erased && step === "consent" && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{t("kyc.withdrawn")}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {/* 1. Consent (always first) */}
      {step === "consent" && (
        <section className={card}>
          <h2 className="text-lg font-semibold">{t("kyc.consent.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("kyc.consent.body")}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("kyc.notice.lead")}</p>
          <dl className="mt-2 divide-y divide-slate-100">
            {(["what", "purpose", "min", "ret", "rights", "grievance"] as const).map((k) => (
              <div key={k} className="py-3">
                <dt className="text-sm font-semibold text-slate-900">{t(`kyc.notice.${k}.t`)}</dt>
                <dd className="mt-0.5 text-sm text-slate-700">{t(`kyc.notice.${k}.b`)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 space-y-3 rounded-xl bg-slate-50 p-3">
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-action" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                {t("kyc.consent.agree")} <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs">{t("kyc.consent.required")}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-action" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>{t("kyc.consent.marketing")}</span>
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("kyc.consent.version")}: {CONSENT_VERSION}</p>
          <button className={`${btnPrimary} mt-4 w-full sm:w-auto`} disabled={!agree} onClick={submitConsent}>
            {t("kyc.consent.continue")}
          </button>
        </section>
      )}

      {/* 2. Upload */}
      {step === "upload" && (
        <section className="space-y-4">
          <div className={card}>
            <h2 className="text-lg font-semibold">{t("kyc.upload")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("kyc.upload.hint")}</p>
            <ul className="mt-4 space-y-3">
              {DOC_SLOTS.map((slot) => {
                const d = docs[slot];
                const optional = slot === "udyam_certificate";
                return (
                  <li key={slot} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-400">
                      {d?.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        "+"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t(`kyc.doc.${slot}`)} {optional && <span className="text-xs font-normal text-slate-500">({t("kyc.optional")})</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {busy[slot] ? t("kyc.upload.reading") : d ? `${t("kyc.upload.added")}${d.quality !== "ok" ? ` - ${t(`kyc.quality.${d.quality}`)}` : ""}` : ""}
                      </p>
                    </div>
                    <label className={`${btnGhost} cursor-pointer`}>
                      {d ? t("kyc.upload.replace") : t("kyc.upload.choose")}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void extract(slot, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            {!docs.udyam_certificate && (
              <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-action" checked={udyamNone} onChange={(e) => setUdyamNone(e.target.checked)} />
                {t("kyc.noUdyam")}
              </label>
            )}
          </div>

          <div className={`${card} border-dashed`}>
            <h3 className="text-sm font-semibold">{t("kyc.specimen.title")}</h3>
            <p className="mt-1 text-xs text-slate-600">{t("kyc.specimen.hint")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label={t("kyc.specimen.title")}
                className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                value={specimenId}
                onChange={(e) => setSpecimenId(e.target.value)}
              >
                {SPECIMENS.map((s) => (
                  <option key={s.id} value={s.id}>{s.id} - {s.label}</option>
                ))}
              </select>
              <button className={btnGhost} disabled={anyBusy} onClick={() => loadSpecimen(specimenId)}>
                {loadingSpecimen ? t("kyc.upload.reading") : t("kyc.specimen.load")}
              </button>
            </div>
            <button className={`${btnGhost} mt-2 w-full`} disabled={anyBusy} onClick={() => loadSpecimen(specimenId, 900)}>
              {t("kyc.digilocker")}
            </button>
            <p className="mt-1 text-xs text-slate-500">{t("kyc.digilocker.note")}</p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{!haveRequired && t("kyc.upload.need")}</p>
            <button className={btnPrimary} disabled={!haveRequired || anyBusy} onClick={() => setStep("review")}>
              {t("common.next")}
            </button>
          </div>
        </section>
      )}

      {/* 3. Review extracted fields */}
      {step === "review" && (
        <section className="space-y-4">
          <div className={card}>
            <h2 className="text-lg font-semibold">{t("kyc.review.title")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("kyc.review.hint")}</p>
          </div>
          {DOC_SLOTS.filter((s) => docs[s]).map((slot) => (
            <DocReview key={slot} slot={slot} doc={docs[slot]!} onChange={(k, v) => setField(slot, k, v)} />
          ))}
          <div className="flex justify-between gap-3">
            <button className={btnGhost} onClick={() => setStep("upload")}>{t("common.back")}</button>
            <button className={btnPrimary} disabled={checking} onClick={runChecks}>
              {checking ? t("kyc.checking") : t("kyc.check")}
            </button>
          </div>
        </section>
      )}

      {/* 4. Check results */}
      {step === "checks" && result && (
        <section className="space-y-4">
          <div className={`rounded-2xl border p-4 ${verdictTone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{t("kyc.result.title")}</p>
            <p className="mt-1 text-lg font-semibold">
              {t(result.verdict === "verified" ? "kyc.status.verified" : result.verdict === "rejected" ? "kyc.status.rejected" : "kyc.status.needs_review")}
            </p>
            <p className="mt-1 text-sm">{t(`kyc.verdict.${result.verdict}`)}</p>
          </div>
          <ul className="space-y-2">
            {result.checks.map((c) => (
              <CheckRow key={c.id} c={c} onReupload={() => setStep("upload")} />
            ))}
          </ul>
          {lang !== "en" && <p className="text-xs text-slate-500">{t("kyc.msgNote")}</p>}
          <div className="flex flex-wrap justify-between gap-3">
            <button className={btnGhost} onClick={() => setStep("review")}>{t("kyc.recheck")}</button>
            <button className={btnPrimary} disabled={result.verdict === "rejected"} onClick={() => setStep("esign")}>
              {t("kyc.continueEsign")}
            </button>
          </div>
        </section>
      )}

      {/* 5. E-sign (simulated) and finish */}
      {step === "esign" && (
        <section className={card}>
          <h2 className="text-lg font-semibold">{t("kyc.esign.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("kyc.esign.body")}</p>
          {!signed ? (
            <div className="mt-4 space-y-3">
              {!otpSent ? (
                <button className={btnPrimary} onClick={sendOtp}>{t("kyc.esign.send")}</button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={t("kyc.esign.otp")}
                    aria-label={t("kyc.esign.otp")}
                    className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3 text-center text-lg tracking-widest"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  />
                  <button className={btnPrimary} disabled={otp.length < 6} onClick={verifyOtp}>{t("kyc.esign.verify")}</button>
                </div>
              )}
              {otpSent && <p className="text-xs text-slate-500">({DEMO_ESIGN_OTP})</p>}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{t("kyc.esign.signed")}</p>
              {doneMsg ? (
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  {doneMsg} <Link className="font-semibold text-ink underline" href="/advisor">{t("nav.advisor")}</Link>
                </p>
              ) : (
                <button className={`${btnPrimary} w-full sm:w-auto`} disabled={finishing} onClick={finish}>
                  {finishing ? t("kyc.finishing") : result?.verdict === "needs_attention" ? t("kyc.finishReview") : t("kyc.finish")}
                </button>
              )}
            </div>
          )}
          <div className="mt-4">
            <button className={btnGhost} onClick={() => setStep("checks")}>{t("common.back")}</button>
          </div>
        </section>
      )}

      {kycId && (
        <p className="pt-2 text-center">
          <button className="text-xs text-slate-500 underline hover:text-slate-800" onClick={withdraw}>
            {t("kyc.withdraw")}
          </button>
        </p>
      )}
    </div>
  );
}

function DocReview({ slot, doc, onChange }: { slot: DocSlot; doc: DocState; onChange: (key: string, value: string) => void }) {
  const { t } = useLang();
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{t(`kyc.doc.${slot}`)}</h3>
        {doc.quality !== "ok" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{t(`kyc.quality.${doc.quality}`)}</span>}
      </div>
      {doc.needsManualReview && <p className="mt-1 text-xs text-amber-700">{t("kyc.manual")}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {DOC_FIELDS[slot].map((k) => {
          const sensitive = SENSITIVE_FIELDS[slot].includes(k);
          const v = doc.fields[k] ?? "";
          const hidden = sensitive && !editing[k] && v !== "";
          const wide = k === "address";
          return (
            <div key={k} className={wide ? "sm:col-span-2" : ""}>
              <label className="text-xs font-medium text-slate-600" htmlFor={`${slot}-${k}`}>{t(`kyc.field.${k}`)}</label>
              <div className="mt-1 flex gap-2">
                {hidden ? (
                  <p id={`${slot}-${k}`} className="min-h-11 flex-1 rounded-xl bg-slate-100 px-3 py-2.5 font-mono text-sm">{MASKERS[k](v)}</p>
                ) : (
                  <input
                    id={`${slot}-${k}`}
                    className="min-h-11 w-full min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
                    value={v}
                    onChange={(e) => onChange(k, e.target.value)}
                  />
                )}
                {sensitive && v !== "" && (
                  <button type="button" className={btnGhost} onClick={() => setEditing((e) => ({ ...e, [k]: !e[k] }))}>
                    {editing[k] ? t("kyc.hide") : t("kyc.edit")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckRow({ c, onReupload }: { c: CheckResult; onReupload: () => void }) {
  const { t } = useLang();
  const tone =
    c.status === "pass" ? "border-emerald-200 bg-white"
    : c.status === "warn" ? "border-amber-300 bg-amber-50"
    : "border-rose-300 bg-rose-50";
  const badge =
    c.status === "pass" ? "bg-emerald-100 text-emerald-800"
    : c.status === "warn" ? "bg-amber-100 text-amber-800"
    : "bg-rose-100 text-rose-800";
  const labelKey = `kyc.check.${c.id}`;
  const label = t(labelKey) === labelKey ? c.label : t(labelKey);
  return (
    <li className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{t(`kyc.cs.${c.status}`)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{c.message}</p>
      {c.fix && c.status !== "pass" && (
        <p className="mt-2 text-sm text-slate-900">
          <span className="font-semibold">{t("kyc.fix")}: </span>
          {c.fix}
        </p>
      )}
      {c.status !== "pass" && c.slots?.length ? (
        <button className={`${btnGhost} mt-2`} onClick={onReupload}>{t("kyc.reupload")}</button>
      ) : null}
    </li>
  );
}

export default function KycPage() {
  return (
    <Suspense fallback={null}>
      <KycFlow />
    </Suspense>
  );
}
