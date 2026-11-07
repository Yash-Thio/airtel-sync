"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BackofficeLead, Assignment } from "@/lib/backoffice/leads";
import type { DecileRow, OwnerType } from "@/lib/backoffice/propensity";

// Back-office is English only. Types are imported as types only, so no server code reaches the client bundle.

const OWNER_LABEL: Record<OwnerType, string> = {
  field_sales: "Field sales",
  channel_partner: "Channel partner",
  digital_nurture: "Digital nurture",
};
const URGENCY: Record<string, { label: string; cls: string }> = {
  today: { label: "Today", cls: "bg-red-100 text-red-800" },
  this_week: { label: "This week", cls: "bg-amber-100 text-amber-800" },
  nurture: { label: "Nurture", cls: "bg-slate-100 text-slate-700" },
};

interface Kpis {
  totalLeads: number;
  funnel: { stage: string; count: number }[];
  activated: number;
  activationRate: number;
  activationRateWithGstin: number;
  activationRateWithoutGstin: number;
  gstinCounts: { with: number; without: number };
  avgDaysToActivate: number;
  avgFollowUpCalls: number;
  topDropReasons: { reason: string; count: number }[];
  unclosedCsv: number;
  unclosedApp: number;
}
interface Resp {
  total: number;
  unclosedTotal: number;
  leads: BackofficeLead[];
  facets: { stages: string[]; segments: string[]; sources: string[]; languages: string[]; dropReasons: string[] };
  kpis?: Kpis;
  validation?: { deciles: DecileRow[]; avgScoreActivated: number; avgScoreDropped: number };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const PAGE = 50;

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 55 ? "bg-green-100 text-green-800" : score >= 35 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-block min-w-[2.5rem] rounded px-2 py-0.5 text-center text-sm font-semibold tabular-nums ${cls}`}>{score}</span>;
}

export default function BackofficePage() {
  const [f, setF] = useState({ stage: "", segment: "", source: "", language: "", gstin: "", dropReason: "", minScore: "", q: "", sort: "score_desc" });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Resp | null>(null);
  const [meta, setMeta] = useState<Pick<Resp, "kpis" | "validation" | "facets"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BackofficeLead | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("limit", String(PAGE));
    sp.set("offset", String(page * PAGE));
    return sp.toString();
  }, [f, page]);

  const load = useCallback(
    async (withMeta: boolean) => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`/api/backoffice/leads?${query}${withMeta ? "" : "&meta=0"}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j: Resp = await r.json();
        setData(j);
        if (j.kpis) setMeta({ kpis: j.kpis, validation: j.validation, facets: j.facets });
        setSelected((s) => (s ? j.leads.find((l) => l.id === s.id) ?? s : s));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const t = setTimeout(() => load(!meta), f.q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(0);
  };
  const kpis = meta?.kpis;
  const facets = meta?.facets;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Back-office: leads to follow up</h1>
          <p className="text-sm text-slate-600">
            Unclosed leads ranked by a transparent propensity score. Suggestions support the field force: they route work, they do not replace it.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowValidation((v) => !v)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            {showValidation ? "Hide" : "Show"} score validation
          </button>
          <button
            onClick={async () => {
              await fetch("/api/staff/logout", { method: "POST" }).catch(() => null);
              window.location.href = "/staff/login";
            }}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>

      {kpis && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Unclosed leads" value={(kpis.unclosedCsv + kpis.unclosedApp).toLocaleString()} sub={`${kpis.unclosedApp} from in-app advisor`} />
            <Kpi label="Activation rate" value={pct(kpis.activationRate)} sub={`${kpis.activated} of ${kpis.totalLeads.toLocaleString()}`} />
            <Kpi label="With GSTIN" value={pct(kpis.activationRateWithGstin)} sub={`${kpis.gstinCounts.with.toLocaleString()} leads`} tone="good" />
            <Kpi label="Without GSTIN" value={pct(kpis.activationRateWithoutGstin)} sub={`${kpis.gstinCounts.without.toLocaleString()} leads`} tone="bad" />
            <Kpi label="Avg days to activate" value={kpis.avgDaysToActivate.toFixed(1)} sub="lead to activation" />
            <Kpi label="Follow-up calls" value={kpis.avgFollowUpCalls.toFixed(1)} sub="customer chasers per activation" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold">Funnel (Apr-Jun 2026 CSV)</h2>
              <div className="space-y-1.5">
                {kpis.funnel.map((s, i) => (
                  <div key={s.stage} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-slate-600">{s.stage}</span>
                    <div className="h-4 flex-1 rounded bg-slate-100">
                      <div className="h-4 rounded bg-ink" style={{ width: `${(s.count / kpis.funnel[0].count) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right tabular-nums">
                      {s.count.toLocaleString()}
                      {i > 0 && <span className="text-slate-400"> ({Math.round((s.count / kpis.funnel[i - 1].count) * 100)}%)</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold">Top drop reasons</h2>
              <ul className="space-y-1 text-sm">
                {kpis.topDropReasons.map((d) => (
                  <li key={d.reason}>
                    <button onClick={() => set("dropReason", d.reason)} className="flex w-full justify-between rounded px-1 py-0.5 text-left hover:bg-slate-50">
                      <span>{d.reason}</span>
                      <span className="tabular-nums text-slate-600">{d.count.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {showValidation && meta?.validation && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Score validation: deciles vs actual activation (all 5,000 CSV leads)</h2>
          <p className="mb-2 text-xs text-slate-600">
            Average score of activated leads {meta.validation.avgScoreActivated.toFixed(1)} vs dropped {meta.validation.avgScoreDropped.toFixed(1)}. Weights are in lib/backoffice/propensity.ts.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-4">Decile</th><th className="pr-4">Score range</th><th className="pr-4">Leads</th><th className="pr-4">Activated</th><th className="pr-4">Actual rate</th><th className="pr-4">Model rate</th><th className="w-48"></th>
                </tr>
              </thead>
              <tbody>
                {meta.validation.deciles.map((d) => (
                  <tr key={d.decile} className="border-t border-slate-100">
                    <td className="py-1 pr-4">{d.decile}</td>
                    <td className="pr-4 tabular-nums">{d.minScore}-{d.maxScore}</td>
                    <td className="pr-4 tabular-nums">{d.n}</td>
                    <td className="pr-4 tabular-nums">{d.activated}</td>
                    <td className="pr-4 tabular-nums">{pct(d.activationRate)}</td>
                    <td className="pr-4 tabular-nums text-slate-500">{pct(d.avgPredicted)}</td>
                    <td><div className="h-2 rounded bg-ink" style={{ width: `${Math.min(100, d.activationRate * 300)}%` }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
          <input
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search name, ID, city, contact"
            className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-2"
            aria-label="Search"
          />
          <Select label="Stage dropped at" value={f.stage} options={facets?.stages} onChange={(v) => set("stage", v)} />
          <Select label="Segment" value={f.segment} options={facets?.segments} onChange={(v) => set("segment", v)} />
          <Select label="Source" value={f.source} options={facets?.sources} onChange={(v) => set("source", v)} />
          <Select label="Language" value={f.language} options={facets?.languages} onChange={(v) => set("language", v)} />
          <Select label="GSTIN" value={f.gstin} options={["Y", "N"]} labels={{ Y: "Has GSTIN", N: "No GSTIN" }} onChange={(v) => set("gstin", v)} />
          <Select label="Drop reason" value={f.dropReason} options={facets?.dropReasons} onChange={(v) => set("dropReason", v)} />
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-slate-600">Min score</span>
            <input type="number" min={0} max={100} value={f.minScore} onChange={(e) => set("minScore", e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <Select
            label="Sort"
            value={f.sort}
            allowEmpty={false}
            options={["score_desc", "score_asc", "created_desc", "created_asc", "name"]}
            labels={{ score_desc: "Score high to low", score_asc: "Score low to high", created_desc: "Newest first", created_asc: "Oldest first", name: "Name A-Z" }}
            onChange={(v) => set("sort", v)}
          />
          <button
            onClick={() => {
              setF({ stage: "", segment: "", source: "", language: "", gstin: "", dropReason: "", minScore: "", q: "", sort: "score_desc" });
              setPage(0);
            }}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50"
          >
            Clear filters
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
          <span>{loading ? "Loading..." : data ? `${data.total.toLocaleString()} leads match` : ""}</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">Prev</button>
            <span>Page {page + 1} / {pages}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">Next</button>
          </div>
        </div>
        {error && <p className="p-4 text-sm text-red-700">Could not load leads: {error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Dropped at</th>
                <th className="px-3 py-2">Why</th>
                <th className="px-3 py-2">Next action</th>
                <th className="px-3 py-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {data?.leads.map((l) => (
                <tr key={l.id} onClick={() => setSelected(l)} className="cursor-pointer border-t border-slate-100 align-top hover:bg-surface">
                  <td className="px-3 py-2"><ScoreBadge score={l.score} /></td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.businessName}</div>
                    <div className="text-xs text-slate-500">
                      {l.id} · {l.segment ?? "segment n/a"} · {l.city ?? "city n/a"}
                      {l.cityTier ? ` (T${l.cityTier})` : ""} · {l.hasGstin === undefined ? "GSTIN ?" : l.hasGstin ? "GSTIN" : "no GSTIN"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{l.stage}</div>
                    <div className="text-xs text-slate-500">{l.source}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{l.dropReason ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`mr-1 rounded px-1.5 py-0.5 text-xs font-medium ${URGENCY[l.recommendation.urgency].cls}`}>{URGENCY[l.recommendation.urgency].label}</span>
                    <span className="text-xs">{l.recommendation.action}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.assignment ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                        {OWNER_LABEL[l.assignment.ownerType]}
                        {l.assignment.assignee ? `: ${l.assignment.assignee}` : ""}
                      </span>
                    ) : (
                      <span className="text-slate-600">{OWNER_LABEL[l.recommendation.owner]} <span className="text-slate-400">(suggested)</span></span>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.leads.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No leads match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && <Drawer lead={selected} onClose={() => setSelected(null)} onAssigned={() => load(false)} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  labels,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  options?: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
      {allowEmpty && <option value="">{label}: all</option>}
      {(options ?? []).map((o) => (
        <option key={o} value={o}>{labels?.[o] ?? o}</option>
      ))}
    </select>
  );
}

function Drawer({ lead, onClose, onAssigned }: { lead: BackofficeLead; onClose: () => void; onAssigned: () => void }) {
  const [owner, setOwner] = useState<OwnerType>(lead.assignment?.ownerType ?? lead.recommendation.owner);
  const [assignee, setAssignee] = useState(lead.assignment?.assignee ?? "");
  const [note, setNote] = useState(lead.assignment?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function submit(clear = false) {
    setBusy(true);
    setMsg("");
    try {
      const r = clear
        ? await fetch(`/api/backoffice/assign?leadId=${encodeURIComponent(lead.id)}`, { method: "DELETE" })
        : await fetch("/api/backoffice/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: lead.id, ownerType: owner, assignee: assignee || undefined, note: note || undefined }),
          });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!clear) {
        const j: { assignment: Assignment } = await r.json();
        lead.assignment = j.assignment;
      } else lead.assignment = undefined;
      setMsg(clear ? "Assignment cleared." : "Assigned (mock: saved in the prototype store, no notification sent).");
      onAssigned();
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  const t = lead.transcript;
  const maxPts = Math.max(1, ...lead.factors.map((f) => Math.abs(f.points)));
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Lead ${lead.businessName}`}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{lead.businessName}</h2>
            <p className="text-xs text-slate-500">{lead.id} · {lead.origin === "app" ? "In-app session" : "CSV lead"} · {lead.businessType ?? ""}</p>
          </div>
          <button onClick={onClose} className="rounded border px-2 py-1 text-sm hover:bg-slate-50">Close</button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ScoreBadge score={lead.score} />
          <span className="text-sm text-slate-600">propensity score · model estimate {pct(lead.probability)} chance to activate</span>
        </div>

        <div className="mt-4 rounded-lg bg-sky-50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${URGENCY[lead.recommendation.urgency].cls}`}>{URGENCY[lead.recommendation.urgency].label}</span>
            <span className="font-medium">{lead.recommendation.action}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">{lead.recommendation.rationale}</p>
          <p className="mt-1 text-xs">Suggested owner: <strong>{OWNER_LABEL[lead.recommendation.owner]}</strong></p>
        </div>

        <h3 className="mt-5 text-sm font-semibold">Score factors (points vs an average lead)</h3>
        <ul className="mt-2 space-y-1.5">
          {lead.factors.length === 0 && <li className="text-xs text-slate-500">Not enough profile data captured yet; score is neutral.</li>}
          {lead.factors.map((f) => (
            <li key={f.key} className="text-xs">
              <div className="flex justify-between"><span>{f.label}</span><span className={`tabular-nums font-medium ${f.points > 0 ? "text-green-700" : "text-red-700"}`}>{f.points > 0 ? "+" : ""}{f.points}</span></div>
              <div className="my-0.5 h-1.5 rounded bg-slate-100"><div className={`h-1.5 rounded ${f.points > 0 ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${(Math.abs(f.points) / maxPts) * 100}%` }} /></div>
              <div className="text-slate-500">Observed: {f.observed}</div>
            </li>
          ))}
        </ul>

        <h3 className="mt-5 text-sm font-semibold">Profile</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <Row k="Contact" v={[lead.contactName, lead.contactRole].filter(Boolean).join(", ")} />
          <Row k="Phone" v={lead.contactPhone} />
          <Row k="Location" v={[lead.city, lead.state].filter(Boolean).join(", ")} />
          <Row k="Segment" v={lead.segment} />
          <Row k="Language" v={lead.language} />
          <Row k="Source" v={lead.source} />
          <Row k="Employees / sites" v={lead.employeeCount != null ? `${lead.employeeCount} / ${lead.numSites ?? "?"}` : undefined} />
          <Row k="Turnover" v={lead.turnoverBand} />
          <Row k="Internet" v={[lead.currentInternet, lead.currentProvider].filter(Boolean).join(", ")} />
          <Row k="Telecom spend" v={lead.monthlySpendInr != null ? `Rs ${lead.monthlySpendInr.toLocaleString()}/mo` : undefined} />
          <Row k="Stage / reason" v={[lead.stage, lead.dropReason].filter(Boolean).join(": ")} />
          <Row k="Created" v={lead.createdDate ? `${lead.createdDate} (${lead.idleDays ?? "?"}d ago)` : undefined} />
          <Row k="Customer chasers" v={lead.followUpCalls != null ? String(lead.followUpCalls) : undefined} />
          <Row k="Interested in" v={lead.products.map((p) => p.name).join(", ")} />
        </dl>

        {t && (
          <>
            <h3 className="mt-5 text-sm font-semibold">Advisor conversation</h3>
            <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-xs">
              <p className="text-slate-500">{t.messageCount} messages in {t.language}, last active {t.updatedAt?.slice(0, 16).replace("T", " ")}</p>
              {t.firstAsks.length > 0 && (
                <div>
                  <div className="font-medium">Customer asked</div>
                  <ul className="list-disc pl-4">{t.firstAsks.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
              {t.lastAssistant && <div><div className="font-medium">Advisor last said</div><p>{t.lastAssistant}</p></div>}
              {t.recommendedProducts.length > 0 && <div><div className="font-medium">Recommended</div><p>{t.recommendedProducts.join(", ")}</p></div>}
            </div>
          </>
        )}

        <h3 className="mt-5 text-sm font-semibold">Assign</h3>
        <div className="mt-2 space-y-2 text-sm">
          <select value={owner} onChange={(e) => setOwner(e.target.value as OwnerType)} className="w-full rounded border border-slate-300 px-2 py-1.5" aria-label="Owner type">
            {(Object.keys(OWNER_LABEL) as OwnerType[]).map((o) => (
              <option key={o} value={o}>{OWNER_LABEL[o]}{o === lead.recommendation.owner ? " (suggested)" : ""}</option>
            ))}
          </select>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Rep / partner name (optional)" className="w-full rounded border border-slate-300 px-2 py-1.5" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the owner (optional)" rows={2} className="w-full rounded border border-slate-300 px-2 py-1.5" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => submit()} className="rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800 disabled:opacity-50">
              {lead.assignment ? "Reassign" : "Assign"}
            </button>
            {lead.assignment && <button disabled={busy} onClick={() => submit(true)} className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Clear</button>}
          </div>
          {lead.assignment && <p className="text-xs text-slate-600">Currently: {OWNER_LABEL[lead.assignment.ownerType]}{lead.assignment.assignee ? ` (${lead.assignment.assignee})` : ""}, {lead.assignment.assignedAt.slice(0, 16).replace("T", " ")}</p>}
          {msg && <p className="text-xs text-slate-600" role="status">{msg}</p>}
        </div>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{v || "-"}</dd>
    </>
  );
}
