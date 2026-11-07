import { getLeads, getProducts, SEGMENT_CODE_LABEL, type Lead, type SegmentCode } from "@/lib/data";
import { deleteAssignment, listAssignments, listUnclosedSessions, upsertAssignment, type Quote, type Session } from "@/lib/data/store";
import {
  OWNER_LABEL,
  recommend,
  scoreDeciles,
  scoreLead,
  type DecileRow,
  type Factor,
  type OwnerType,
  type Recommendation,
  type ScoreInput,
} from "./propensity";

/** Prototype "today" per the dataset README. */
export const TODAY = new Date("2026-07-15T00:00:00Z");

export interface Assignment {
  leadId: string;
  ownerType: OwnerType;
  assignee?: string;
  note?: string;
  partnerId?: string;
  assignedBy?: string;
  assignedAt: string;
}

export interface TranscriptSummary {
  messageCount: number;
  language: string;
  firstAsks: string[];
  lastAssistant?: string;
  recommendedProducts: string[];
  updatedAt: string;
}

export interface BackofficeLead {
  id: string;
  origin: "csv" | "app";
  businessName: string;
  businessType?: string;
  contactName?: string;
  contactRole?: string;
  contactPhone?: string;
  segment?: string;
  city?: string;
  cityTier?: number;
  state?: string;
  source: string;
  language?: string;
  hasGstin?: boolean;
  hasUdyam?: boolean;
  employeeCount?: number;
  numSites?: number;
  turnoverBand?: string;
  currentInternet?: string;
  currentProvider?: string;
  monthlySpendInr?: number;
  products: { id: string; name: string }[];
  stage: string;
  dropReason?: string;
  createdDate: string;
  idleDays?: number;
  followUpCalls?: number | null;
  score: number;
  probability: number;
  factors: Factor[];
  positives: Factor[];
  negatives: Factor[];
  recommendation: Recommendation;
  assignment?: Assignment;
  transcript?: TranscriptSummary;
}

// ---------------- assignments (Postgres) ----------------

async function loadAssignments(): Promise<Record<string, Assignment>> {
  const rows = await listAssignments();
  const out: Record<string, Assignment> = {};
  for (const a of rows) {
    out[a.leadId] = {
      leadId: a.leadId,
      ownerType: a.ownerType as OwnerType,
      assignee: a.assignee,
      note: a.note,
      partnerId: a.partnerId,
      assignedBy: a.assignedBy,
      assignedAt: a.assignedAt,
    };
  }
  return out;
}

export async function assignLead(a: Omit<Assignment, "assignedAt">): Promise<Assignment> {
  const rec = await upsertAssignment({
    leadId: a.leadId,
    ownerType: a.ownerType,
    assignee: a.assignee,
    note: a.note,
    partnerId: a.partnerId,
    assignedBy: a.assignedBy,
  });
  return {
    leadId: rec.leadId,
    ownerType: rec.ownerType as OwnerType,
    assignee: rec.assignee,
    note: rec.note,
    partnerId: rec.partnerId,
    assignedBy: rec.assignedBy,
    assignedAt: rec.assignedAt,
  };
}

export async function unassignLead(leadId: string) {
  await deleteAssignment(leadId);
}

// ---------------- row builders ----------------

const dayDiff = (iso: string) => Math.max(0, Math.round((TODAY.getTime() - new Date(iso).getTime()) / 86400000));

let productNames: Map<string, string> | null = null;
function productName(id: string) {
  if (!productNames) productNames = new Map(getProducts().map((p) => [p.product_id, p.product_name]));
  return productNames.get(id) ?? id;
}

function scoreInputOf(l: Lead): ScoreInput {
  return {
    hasGstin: l.has_gstin,
    hasUdyam: l.has_udyam,
    cityTier: l.city_tier,
    segment: l.segment,
    leadSource: l.lead_source,
    currentInternet: l.current_internet,
    currentProvider: l.current_provider,
  };
}

interface Scored {
  lead: Lead;
  row: BackofficeLead;
}
let csvCache: { scored: Scored[]; deciles: DecileRow[]; avgScoreActivated: number; avgScoreDropped: number } | null = null;

function csvRows() {
  if (csvCache) return csvCache;
  const leads = getLeads();
  const scored: Scored[] = [];
  const forDeciles: { score: number; probability: number; activated: boolean }[] = [];
  for (const l of leads) {
    const input = scoreInputOf(l);
    const s = scoreLead(input);
    forDeciles.push({ score: s.score, probability: s.probability, activated: l.outcome === "Activated" });
    if (l.outcome === "Activated") continue;
    scored.push({
      lead: l,
      row: {
        id: l.lead_id,
        origin: "csv",
        businessName: l.business_name,
        businessType: l.business_type,
        contactName: l.contact_name,
        contactRole: l.contact_role,
        segment: l.segment,
        city: l.city,
        cityTier: l.city_tier,
        state: l.state,
        source: l.lead_source,
        language: l.preferred_language,
        hasGstin: l.has_gstin,
        hasUdyam: l.has_udyam,
        employeeCount: l.employee_count,
        numSites: l.num_sites,
        turnoverBand: l.annual_turnover_band,
        currentInternet: l.current_internet,
        currentProvider: l.current_provider,
        monthlySpendInr: l.monthly_telecom_spend_inr,
        products: l.products_of_interest.map((id) => ({ id, name: productName(id) })),
        stage: l.stage_reached,
        dropReason: l.drop_reason || undefined,
        createdDate: l.created_date,
        idleDays: dayDiff(l.created_date),
        followUpCalls: l.customer_follow_up_calls,
        score: s.score,
        probability: s.probability,
        factors: s.factors,
        positives: s.positives,
        negatives: s.negatives,
        recommendation: recommend({ stage: l.stage_reached, dropReason: l.drop_reason, score: s.score, input, idleDays: dayDiff(l.created_date) }),
      },
    });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  csvCache = {
    scored,
    deciles: scoreDeciles(forDeciles),
    avgScoreActivated: mean(forDeciles.filter((r) => r.activated).map((r) => r.score)),
    avgScoreDropped: mean(forDeciles.filter((r) => !r.activated).map((r) => r.score)),
  };
  return csvCache;
}

const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", ta: "Tamil", mr: "Marathi" };

function sessionToLead(s: Session, quote?: Quote): BackofficeLead | null {
  const p = (s.profile ?? {}) as Record<string, unknown>;
  const msgs = Array.isArray(s.messages) ? s.messages : [];
  const recs = Array.isArray(s.recommendedProductIds) ? s.recommendedProductIds : [];
  const hasProfile = Object.values(p).some((v) => v !== undefined && v !== null && v !== "");
  if (!hasProfile && !recs.length) return null;

  if (quote?.status === "accepted") return null; // closed
  if (s.orderId) return null;

  const seg = p.segment as SegmentCode | undefined;
  const segLabel = seg ? SEGMENT_CODE_LABEL[seg] ?? String(seg) : undefined;
  const input: ScoreInput = {
    hasGstin: typeof p.hasGstin === "boolean" ? p.hasGstin : p.gstin ? true : undefined,
    hasUdyam: typeof p.hasUdyam === "boolean" ? p.hasUdyam : p.udyamNumber ? true : undefined,
    cityTier: typeof p.cityTier === "number" ? p.cityTier : undefined,
    segment: segLabel,
    currentInternet: typeof p.currentInternet === "string" ? p.currentInternet : undefined,
  };
  const sc = scoreLead(input);
  const stage = quote ? "Quote shared" : "Advisor in progress";
  const idle = dayDiff(s.updatedAt ?? s.createdAt);
  const users = msgs.filter((m) => m.role === "user");
  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
  const clip = (t: string, n = 180) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  return {
    id: s.id,
    origin: "app",
    businessName: (p.businessName as string) || "(unnamed business)",
    businessType: p.businessType as string | undefined,
    contactName: p.contactName as string | undefined,
    contactPhone: p.contactPhone as string | undefined,
    segment: segLabel,
    city: p.city as string | undefined,
    cityTier: input.cityTier,
    state: p.state as string | undefined,
    source: "In-app advisor",
    language: LANG_NAME[s.language] ?? s.language,
    hasGstin: input.hasGstin,
    hasUdyam: input.hasUdyam,
    employeeCount: typeof p.employeeCount === "number" ? p.employeeCount : undefined,
    numSites: typeof p.numSites === "number" ? p.numSites : undefined,
    currentInternet: input.currentInternet,
    monthlySpendInr: typeof p.monthlyTelecomSpendInr === "number" ? p.monthlyTelecomSpendInr : undefined,
    products: recs.map((id) => ({ id, name: productName(id) })),
    stage,
    dropReason: quote ? "Quote not accepted yet" : "Advisor session not completed",
    createdDate: (s.createdAt ?? "").slice(0, 10),
    idleDays: idle,
    score: sc.score,
    probability: sc.probability,
    factors: sc.factors,
    positives: sc.positives,
    negatives: sc.negatives,
    recommendation: recommend({ stage, score: sc.score, input, idleDays: idle }),
    transcript: {
      messageCount: msgs.length,
      language: LANG_NAME[s.language] ?? s.language,
      firstAsks: users.slice(0, 3).map((m) => clip(m.content)),
      lastAssistant: lastAssistant ? clip(lastAssistant.content, 280) : undefined,
      recommendedProducts: recs.map(productName),
      updatedAt: s.updatedAt,
    },
  };
}

async function appRows(): Promise<BackofficeLead[]> {
  const rows = await listUnclosedSessions();
  return rows.map(({ session, quote }) => sessionToLead(session, quote)).filter((x): x is BackofficeLead => !!x);
}

// ---------------- query ----------------

export interface LeadQuery {
  stage?: string;
  segment?: string;
  source?: string;
  language?: string;
  gstin?: string; // Y | N
  dropReason?: string;
  minScore?: number;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

const uniq = (xs: (string | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x))).sort();

export interface LeadScope {
  role: "sales" | "partner" | "admin";
  partnerId?: string;
}

export async function queryLeads(q: LeadQuery, scope?: LeadScope) {
  const csv = csvRows();
  const all: BackofficeLead[] = [...(await appRows()), ...csv.scored.map((s) => s.row)];
  const asg = await loadAssignments();
  for (const r of all) r.assignment = asg[r.id];
  const visible =
    scope?.role === "partner"
      ? all.filter((r) => !!scope.partnerId && r.assignment?.partnerId === scope.partnerId)
      : all;

  const needle = q.q?.trim().toLowerCase();
  let rows = visible.filter((r) => {
    if (q.stage && r.stage !== q.stage) return false;
    if (q.segment && r.segment !== q.segment) return false;
    if (q.source && r.source !== q.source) return false;
    if (q.language && r.language !== q.language) return false;
    if (q.gstin === "Y" && r.hasGstin !== true) return false;
    if (q.gstin === "N" && r.hasGstin !== false) return false;
    if (q.dropReason && r.dropReason !== q.dropReason) return false;
    if (q.minScore != null && r.score < q.minScore) return false;
    if (needle) {
      const hay = `${r.id} ${r.businessName} ${r.contactName ?? ""} ${r.city ?? ""} ${r.businessType ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const sort = q.sort ?? "score_desc";
  const cmp: Record<string, (a: BackofficeLead, b: BackofficeLead) => number> = {
    score_desc: (a, b) => b.score - a.score,
    score_asc: (a, b) => a.score - b.score,
    created_desc: (a, b) => b.createdDate.localeCompare(a.createdDate),
    created_asc: (a, b) => a.createdDate.localeCompare(b.createdDate),
    name: (a, b) => a.businessName.localeCompare(b.businessName),
  };
  rows = rows.sort((a, b) => (cmp[sort] ?? cmp.score_desc)(a, b) || a.id.localeCompare(b.id));

  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);
  return {
    total: rows.length,
    unclosedTotal: visible.length,
    leads: rows.slice(offset, offset + limit),
    facets: {
      stages: uniq(visible.map((r) => r.stage)),
      segments: uniq(visible.map((r) => r.segment)),
      sources: uniq(visible.map((r) => r.source)),
      languages: uniq(visible.map((r) => r.language)),
      dropReasons: uniq(visible.map((r) => r.dropReason)),
    },
  };
}

export async function getKpis() {
  const leads = getLeads();
  const order = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"];
  const idx = (l: Lead) => order.indexOf(l.stage_reached);
  const funnel = order.map((stage, i) => ({ stage, count: leads.filter((l) => idx(l) >= i).length }));
  const act = leads.filter((l) => l.outcome === "Activated");
  const rate = (xs: Lead[]) => (xs.length ? xs.filter((l) => l.outcome === "Activated").length / xs.length : 0);
  const withG = leads.filter((l) => l.has_gstin);
  const noG = leads.filter((l) => !l.has_gstin);
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const reasons = new Map<string, number>();
  for (const l of leads) if (l.outcome !== "Activated" && l.drop_reason) reasons.set(l.drop_reason, (reasons.get(l.drop_reason) ?? 0) + 1);
  const csv = csvRows();
  const app = await appRows();
  return {
    totalLeads: leads.length,
    funnel,
    activated: act.length,
    activationRate: rate(leads),
    activationRateWithGstin: rate(withG),
    activationRateWithoutGstin: rate(noG),
    gstinCounts: { with: withG.length, without: noG.length },
    avgDaysToActivate: mean(act.map((l) => l.days_lead_to_activation)),
    avgFollowUpCalls: mean(act.map((l) => l.customer_follow_up_calls)),
    topDropReasons: Array.from(reasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason, count]) => ({ reason, count })),
    unclosedCsv: csv.scored.length,
    unclosedApp: app.length,
  };
}

export function getValidation() {
  const c = csvRows();
  return { deciles: c.deciles, avgScoreActivated: c.avgScoreActivated, avgScoreDropped: c.avgScoreDropped };
}

export { OWNER_LABEL };
