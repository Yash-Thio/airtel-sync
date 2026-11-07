"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import "@/lib/i18n-quote";

interface CatItem {
  productId: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  priceMinInr: number;
  priceMaxInr: number;
  unitPriceInr: number;
  setupInr: number;
  contractMonths: number;
  installDays: number;
  requiresOneOf: string[];
  eligible: boolean;
  reasons: string[];
  segmentFit: boolean;
}
interface Line {
  productId: string;
  quantity: number;
}
interface Totals {
  lines: { productId: string; quantity: number; monthlyInr: number; setupInr: number; unitPriceInr: number }[];
  monthlyTotalInr: number;
  monthlyMinInr: number;
  monthlyMaxInr: number;
  setupTotalInr: number;
  contractMonths: number;
}
interface Profile {
  cityTier?: 1 | 2;
  employeeCount?: number;
  numSites?: number;
  hasGstin?: boolean;
  [k: string]: unknown;
}
interface Resp {
  profile: Profile;
  eligibilityProfile: Profile;
  lines: Line[];
  catalogue: CatItem[];
  totals: Totals;
  validation: { valid: boolean; issues: { productId: string; message: string }[] };
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function QuoteInner() {
  const { t } = useLang();
  const router = useRouter();
  const sessionId = useSearchParams().get("session") ?? undefined;
  const [profile, setProfile] = useState<Profile>({ cityTier: 1, employeeCount: 5, numSites: 1, hasGstin: false });
  const [lines, setLines] = useState<Line[]>([]);
  const [cat, setCat] = useState<CatItem[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [valid, setValid] = useState(true);
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fromSession = useRef(false);
  const seq = useRef(0);

  const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

  const call = useCallback(
    async (p: Profile, l: Line[] | undefined) => {
      const my = ++seq.current;
      try {
        const r = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, profile: p, lines: l }),
        });
        if (!r.ok) throw new Error();
        const d: Resp = await r.json();
        if (my !== seq.current) return null;
        setCat(d.catalogue);
        setTotals(d.totals);
        setValid(d.validation.valid);
        setError("");
        return d;
      } catch {
        if (my === seq.current) setError(t("common.error"));
        return null;
      }
    },
    [sessionId, t],
  );

  // initial load
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, profile: sessionId ? undefined : profile }),
      }).catch(() => null);
      if (r?.ok) {
        const d: Resp = await r.json();
        fromSession.current = !!sessionId && d.lines.length > 0;
        setProfile((p) => ({ ...p, ...(sessionId ? { ...d.eligibilityProfile, ...d.profile } : {}) }));
        setLines(d.lines);
        setCat(d.catalogue);
        setTotals(d.totals);
        setValid(d.validation.valid);
      } else if (sessionId) setError(t("common.error"));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /** Apply a new selection with dependency enforcement, then refresh from the server. */
  const apply = async (next: Line[], p: Profile = profile, msgs: string[] = []) => {
    const byId = new Map(cat.map((c) => [c.productId, c]));
    // drop dependents that lost every base (iterate to fixpoint)
    let cur = next;
    for (;;) {
      const ids = new Set(cur.map((l) => l.productId));
      const bad = cur.filter((l) => {
        const c = byId.get(l.productId);
        return c && c.requiresOneOf.length > 0 && !c.requiresOneOf.some((r) => ids.has(r));
      });
      if (!bad.length) break;
      for (const b of bad) msgs.push(fmt(t("q.autoRemoved"), { dep: byId.get(b.productId)!.name }));
      cur = cur.filter((l) => !bad.includes(l));
    }
    setNotices(msgs);
    setLines(cur);
    await call(p, cur);
  };

  const toggle = (id: string, on: boolean) => {
    const c = cat.find((x) => x.productId === id);
    if (!c) return;
    if (!on) return apply(lines.filter((l) => l.productId !== id));
    const next = [...lines.filter((l) => l.productId !== id), { productId: id, quantity: 1 }];
    const msgs: string[] = [];
    if (c.requiresOneOf.length && !c.requiresOneOf.some((r) => next.some((l) => l.productId === r))) {
      const base = c.requiresOneOf.map((r) => cat.find((x) => x.productId === r)).find((b) => b?.eligible);
      if (!base) {
        setNotices([`${c.name}: ${t("q.needsBase")}`]);
        return;
      }
      next.unshift({ productId: base.productId, quantity: 1 });
      msgs.push(fmt(t("q.autoAdded"), { base: base.name, dep: c.name }));
    }
    return apply(next, profile, msgs);
  };

  const setQty = (id: string, q: number) =>
    apply(lines.map((l) => (l.productId === id ? { ...l, quantity: Math.min(99, Math.max(1, q)) } : l)), profile, notices);

  const updateProfile = async (patch: Profile) => {
    const p = { ...profile, ...patch };
    setProfile(p);
    const d = await call(p, lines);
    if (d) {
      // eligibility may have changed: drop now-ineligible lines
      const ok = new Set(d.catalogue.filter((c) => c.eligible).map((c) => c.productId));
      const kept = lines.filter((l) => ok.has(l.productId));
      if (kept.length !== lines.length) await apply(kept, p);
    }
  };

  const accept = async () => {
    if (!lines.length) return setError(t("q.selectOne"));
    if (!valid) return setError(t("q.invalid"));
    setBusy(true);
    const r = await fetch("/api/quote/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, profile, lines }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (r?.status === 401 || d?.loginRequired) {
      const back = `/quote${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`;
      router.push(`/login?next=${encodeURIComponent(back)}`);
      return;
    }
    if (r?.ok && d?.redirect) {
      // The advisor conversation is finished: the next visit to /advisor starts a fresh one.
      try { localStorage.removeItem("udyam.sessionId"); } catch { /* ignore */ }
      router.push(d.redirect);
    }
    else {
      setError(d?.error ?? t("common.error"));
      setBusy(false);
    }
  };

  if (loading) return <p className="text-slate-600">{t("common.loading")}</p>;

  const byId = new Map(cat.map((c) => [c.productId, c]));
  const tl = new Map((totals?.lines ?? []).map((l) => [l.productId, l]));
  const selected = new Set(lines.map((l) => l.productId));
  const others = cat.filter((c) => !selected.has(c.productId));
  const field = "field";

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <div>
        <h1 className="text-2xl font-semibold">{t("quote.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{fromSession.current ? t("q.fromAdvisor") : t("q.standalone")}</p>
      </div>

      {!fromSession.current && (
        <section className="card grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm">
            {t("q.profile.tier")}
            <select className={field} value={profile.cityTier ?? 1} onChange={(e) => updateProfile({ cityTier: Number(e.target.value) === 2 ? 2 : 1 })}>
              <option value={1}>{t("q.profile.tier1")}</option>
              <option value={2}>{t("q.profile.tier2")}</option>
            </select>
          </label>
          <label className="text-sm">
            {t("q.profile.employees")}
            <input type="number" min={1} className={field} value={profile.employeeCount ?? 1} onChange={(e) => updateProfile({ employeeCount: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="text-sm">
            {t("q.profile.sites")}
            <input type="number" min={1} className={field} value={profile.numSites ?? 1} onChange={(e) => updateProfile({ numSites: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={!!profile.hasGstin} onChange={(e) => updateProfile({ hasGstin: e.target.checked })} />
            {t("q.profile.gstin")}
          </label>
        </section>
      )}

      {notices.map((n, i) => (
        <p key={i} role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {n}
        </p>
      ))}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="card">
        <h2 className="text-lg font-medium">{t("q.yourBundle")}</h2>
        {!lines.length && <p className="mt-2 text-sm text-slate-600">{t("q.empty")}</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {lines.map((l) => {
            const c = byId.get(l.productId);
            const pl = tl.get(l.productId);
            if (!c) return null;
            return (
              <li key={l.productId} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-slate-600">
                      {inr(c.unitPriceInr)} {t("common.perMonth")} {t("q.perUnit")} {c.unit.replace(/^per\s+/i, "")}
                      {c.setupInr > 0 && ` · ${fmt(t("q.setupLine"), { amt: inr(c.setupInr) })}`}
                    </p>
                    <p className="text-xs text-slate-500">{fmt(t("q.installDays"), { n: c.installDays }).replace(/^(.*\b1) days\b/, "$1 day")}</p>
                  </div>
                  <p className="whitespace-nowrap text-right font-semibold">
                    {inr(pl?.monthlyInr ?? c.unitPriceInr * l.quantity)}
                    <span className="block text-xs font-normal text-slate-500">{t("common.perMonth")}</span>
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2" aria-label={t("q.qty")}>
                    <button className="h-10 w-10 rounded-lg border border-slate-300 text-lg" onClick={() => setQty(l.productId, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="-">
                      −
                    </button>
                    <span className="w-8 text-center tabular-nums">{l.quantity}</span>
                    <button className="h-10 w-10 rounded-lg border border-slate-300 text-lg" onClick={() => setQty(l.productId, l.quantity + 1)} aria-label="+">
                      +
                    </button>
                  </div>
                  <button className="text-sm text-red-700 underline" onClick={() => toggle(l.productId, false)}>
                    {t("q.remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("q.addons")}</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {others.map((c) => {
            const needsBase = c.requiresOneOf.length > 0 && !c.requiresOneOf.some((r) => selected.has(r));
            return (
              <li key={c.productId} className={`flex items-center justify-between gap-3 py-3 ${c.eligible ? "" : "opacity-60"}`}>
                <div>
                  <p className="font-medium">
                    {c.name} {c.eligible && c.segmentFit && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">{t("q.segmentFit")}</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    {inr(c.unitPriceInr)} {t("common.perMonth")} {t("q.perUnit")} {c.unit.replace(/^per\s+/i, "")}
                  </p>
                  {!c.eligible && <p className="text-xs text-red-700">{c.reasons.join("; ")}</p>}
                  {c.eligible && needsBase && <p className="text-xs text-slate-500">{t("q.needsBase")}</p>}
                </div>
                <button
                  disabled={!c.eligible}
                  onClick={() => toggle(c.productId, true)}
                  className="btn btn-secondary h-10 shrink-0 px-4 text-sm disabled:cursor-not-allowed"
                >
                  {c.eligible ? t("q.add") : t("q.notAvailable")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="composer">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-slate-600">{t("quote.monthly")}</p>
              <p className="text-2xl font-bold tabular-nums">
                {inr(totals?.monthlyTotalInr ?? 0)}
                <span className="text-sm font-normal text-slate-600"> {t("common.perMonth")}</span>
              </p>
            </div>
            <div className="text-right text-xs text-slate-700">
              <p>
                {t("quote.setup")}: <b>{inr(totals?.setupTotalInr ?? 0)}</b>
              </p>
              <p>
                {t("quote.contract")}: <b>{totals?.contractMonths ?? 0} {t("common.months")}</b>
              </p>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("q.monthlyNote")}</p>
          <button
            onClick={accept}
            disabled={busy || !lines.length || !valid}
            className="btn btn-primary mt-2 w-full"
          >
            {busy ? t("q.accepting") : t("quote.accept")}
          </button>
          <p className="mt-1 text-center text-xs text-slate-500">{t("q.acceptHint")}</p>
        </div>
      </div>
    </div>
  );
}

export default function QuotePage() {
  return (
    <Suspense fallback={null}>
      <QuoteInner />
    </Suspense>
  );
}
