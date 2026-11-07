import "@/lib/advisor/strings";
import { tr } from "@/lib/advisor/strings";
import { detectSegment, whyRole } from "@/lib/advisor/recommend";
import { buildReviewedRecommendation } from "@/lib/advisor/llm";
import { chat, isAiEnabled, type AiSource } from "@/lib/ai/provider";
import { computeQuote } from "@/lib/eligibility";
import { getLeads } from "@/lib/data/leads";
import { getProduct } from "@/lib/data/products";
import { isValidGstinFormat, lookupGstin } from "@/lib/data/registries";
import {
  createSession,
  getSession,
  updateSession,
  type AdvisorRecommendation,
  type LangCode,
  type Session,
} from "@/lib/data/store";
import { LANG_PROMPT_NAME } from "@/lib/i18n";
import type { AdvisorResponse, Chip, RecommendationView, ViewLine } from "@/lib/advisor/types";

export type { AdvisorResponse, Chip, RecommendationView, ViewLine };

// ---------------------------------------------------------------- slots

export interface Slots {
  businessType?: string;
  employees?: number;
  numSites?: number;
  city?: string;
  cityTier?: 1 | 2;
  hasGstin?: boolean;
  gstin?: string;
  currentInternet?: string;
  /** 0 = unknown / skipped */
  monthlySpend?: number;
}

export const FIELDS = ["businessType", "employees", "numSites", "city", "hasGstin", "currentInternet", "monthlySpend"] as const;
export type Field = (typeof FIELDS)[number];

const INTERNET = ["None", "Mobile hotspot", "Home broadband", "Business broadband", "Leased line"] as const;
const BT_CHIPS = ["Kirana store", "Salon", "Dental clinic", "CA firm", "Restaurant chain", "Plastic moulding unit"];

// ---------------------------------------------------------------- extraction (rule-based)

const normDigits = (s: string) =>
  s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966)).replace(/[௦-௯]/g, (d) => String(d.charCodeAt(0) - 0xbe6));

const CITY_ALIASES: Record<string, string> = {
  मुंबई: "Mumbai", मुम्बई: "Mumbai", पुणे: "Pune", दिल्ली: "Delhi", नागपुर: "Nagpur", नाशिक: "Nashik", जयपुर: "Jaipur",
  लखनऊ: "Lucknow", इंदौर: "Indore", भोपाल: "Bhopal", पटना: "Patna", सूरत: "Surat", अहमदाबाद: "Ahmedabad",
  बेंगलुरु: "Bengaluru", हैदराबाद: "Hyderabad", कोलकाता: "Kolkata", चेन्नई: "Chennai",
  சென்னை: "Chennai", கோயம்புத்தூர்: "Coimbatore", மும்பை: "Mumbai", புனே: "Pune", பெங்களூரு: "Bengaluru", கொச்சி: "Kochi",
  bangalore: "Bengaluru", bombay: "Mumbai", madras: "Chennai", calcutta: "Kolkata", vizag: "Visakhapatnam",
};

let cityTierMap: Map<string, 1 | 2> | null = null;
function cities(): Map<string, 1 | 2> {
  if (!cityTierMap) {
    cityTierMap = new Map();
    for (const l of getLeads()) cityTierMap.set(l.city, l.city_tier === 1 ? 1 : 2);
  }
  return cityTierMap;
}

const YES = new Set(["y", "yes", "yeah", "yep", "yup", "haan", "han", "ha", "haa", "hai", "ji", "हां", "हाँ", "हा", "हो", "होय", "है", "ஆம்", "ஆமாம்", "aam", "ho", "hoy"]);
const NO = new Set(["n", "no", "nope", "nahi", "nahin", "nai", "naahi", "nako", "नहीं", "नही", "नाही", "नको", "இல்லை", "illai", "illa"]);

function yesNo(text: string): boolean | undefined {
  const t = text.toLowerCase().trim();
  if (/\b(no|without|don'?t have|do not have|not registered|nahi)\b.{0,12}\bgst/.test(t) || /\bgst\b.{0,12}\b(no|nahi|not)\b/.test(t)) return false;
  if (/\b(have|has|with|registered|got)\b.{0,12}\bgst/.test(t) && !/\b(no|not|don'?t)\b/.test(t)) return true;
  const first = t.split(/[\s,.!?।]+/).filter(Boolean)[0];
  if (!first) return undefined;
  if (YES.has(first)) return true;
  if (NO.has(first)) return false;
  return undefined;
}

const BT_WORDS = ["kirana", "grocery", "salon", "parlour", "parlor", "beauty", "spa", "bakery", "pharmacy", "chemist", "clinic", "dental", "diagnostic", "coaching", "boutique", "restaurant", "cafe", "hotel", "guesthouse", "gym", "school", "factory", "workshop", "logistics", "fleet", "shop", "store", "office", "firm", "studio", "agency", "lab"];

/** Short business label from free text: known lead business types first, then a keyword, else the trimmed text. */
function canonicalBusinessType(text: string): string {
  const lower = text.toLowerCase();
  if (text.length <= 30) return text;
  const known = Array.from(new Set(getLeads().map((l) => l.business_type))).find((b) => lower.includes(b.toLowerCase()));
  if (known) return known;
  const w = BT_WORDS.find((x) => (x === "spa" ? /\bspa\b/.test(lower) : lower.includes(x)));
  return w ? w[0].toUpperCase() + w.slice(1) : text.slice(0, 30).trim();
}

export function maskGstin(g: string) {
  return g.length >= 6 ? `${g.slice(0, 2)}${"X".repeat(g.length - 5)}${g.slice(-3)}` : g;
}

export interface Extracted {
  slots: Slots;
  /** Acknowledgement codes to mention in the reply. */
  notes: ("gstinOk" | "gstinBad")[];
}

function extractRule(raw: string, asked: Field | undefined): Extracted {
  const text = normDigits(raw).trim();
  const lower = text.toLowerCase();
  const out: Slots = {};
  const notes: Extracted["notes"] = [];
  const intIn = (s: string) => {
    const m = s.replace(/,/g, "").match(/\d+/);
    return m ? parseInt(m[0], 10) : undefined;
  };

  // GSTIN number pasted
  const gm = text.toUpperCase().replace(/\s+/g, "").match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]/);
  if (gm && isValidGstinFormat(gm[0])) {
    const rec = lookupGstin(gm[0]);
    if (rec && rec.status === "Active") {
      out.hasGstin = true;
      out.gstin = gm[0];
      notes.push("gstinOk");
    } else {
      out.hasGstin = false;
      notes.push("gstinBad");
    }
  }

  // City: known names/aliases anywhere
  for (const [alias, name] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias.toLowerCase())) {
      out.city = name;
      out.cityTier = cities().get(name) ?? 2;
    }
  }
  if (!out.city) {
    for (const [name, tier] of Array.from(cities())) {
      if (lower.includes(name.toLowerCase())) {
        out.city = name;
        out.cityTier = tier;
        break;
      }
    }
  }
  if (!out.city && /\b(metro|big city|tier\s*-?1)\b/.test(lower)) out.cityTier = 1;
  else if (!out.city && /\b(smaller|small city|town|tier\s*-?2)\b/.test(lower)) out.cityTier = 2;

  // Employees / sites phrases
  const emp = lower.match(/(\d+)\s*(employees?|staff|people|persons?|workers?|members?|लोग|कर्मचारी|பேர்|ஊழியர்|कामगार)/);
  if (emp) out.employees = parseInt(emp[1], 10);
  const sites = lower.match(/(\d+)\s*(sites?|branch(?:es)?|outlets?|shops?|stores?|locations?|offices?|units?|plants?|शाखा|दुकान|साइट|கிளை|கடை)/);
  if (sites) out.numSites = parseInt(sites[1], 10);
  const spend = lower.match(/(?:₹|rs\.?|inr|rupees?)\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:₹|rs\b|rupees?|\/\s*month|per month|रुपये|ரூபாய்)/);
  if (spend) out.monthlySpend = parseInt((spend[1] ?? spend[2]).replace(/,/g, ""), 10);

  const yn = yesNo(text);
  if (out.hasGstin === undefined && (asked === "hasGstin" || /gst/i.test(lower))) {
    if (yn !== undefined) out.hasGstin = yn;
    else if (asked === "hasGstin" && /\b(unsure|not sure|dont know|don't know|skip)\b/.test(lower)) out.hasGstin = false;
  }

  // Internet type
  const net = (() => {
    if (/leased/.test(lower)) return "Leased line";
    if (/hotspot|mobile data|phone data|\bmobile\b|\b4g\b|\b5g\b/.test(lower)) return "Mobile hotspot";
    if (/home|ghar|घर|வீட்டு/.test(lower)) return "Home broadband";
    if (/business|office|fibre|fiber|broadband|wifi|wi-fi|lan\b/.test(lower)) return "Business broadband";
    if (/\b(none|nothing|no internet)\b|कोई नहीं|இல்லை|काही नाही/.test(lower)) return "None";
    return undefined;
  })();
  if (net && (asked === "currentInternet" || /internet|broadband|wifi|hotspot|leased|fibre|fiber/.test(lower))) out.currentInternet = net;

  // Asked-field fallbacks for bare answers
  if (asked === "employees" && out.employees === undefined) {
    if (/\b(just me|alone|myself|only me|one)\b|सिर्फ|फक्त|நான் மட்டும்/.test(lower)) out.employees = 1;
    else out.employees = intIn(text);
  }
  if (asked === "numSites" && out.numSites === undefined) {
    if (/\b(one|single|just one|only one)\b|एक|ஒன்று/.test(lower)) out.numSites = 1;
    else out.numSites = intIn(text);
  }
  if (asked === "monthlySpend" && out.monthlySpend === undefined) {
    if (/\b(skip|not sure|dont know|don't know|unknown)\b|पता नहीं|தெரியவில்லை|माहीत नाही/.test(lower)) out.monthlySpend = 0;
    else out.monthlySpend = intIn(text);
  }
  if (asked === "city" && !out.city && out.cityTier === undefined && /^[^\d!?,;:@#$%^&*()_+=<>/\\|{}[\]]{2,40}$/.test(text)) {
    out.city = text.replace(/(^|\s)(\S)/g, (_m, a: string, c: string) => a + c.toUpperCase());
    out.cityTier = 2;
  }
  if (asked === "businessType" && text.length > 1) {
    out.businessType = canonicalBusinessType(text);
  }
  return { slots: out, notes };
}

// ---------------------------------------------------------------- extraction (Groq, optional)

function cleanLlmSlots(j: unknown): Slots {
  if (!j || typeof j !== "object") return {};
  const o = j as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : undefined;
  };
  const s: Slots = {};
  if (typeof o.businessType === "string" && o.businessType.trim()) s.businessType = o.businessType.trim().slice(0, 80);
  const e = num(o.employees, 1, 5000);
  if (e !== undefined) s.employees = e;
  const n = num(o.numSites, 1, 500);
  if (n !== undefined) s.numSites = n;
  if (typeof o.city === "string" && o.city.trim()) {
    s.city = o.city.trim().slice(0, 40);
    s.cityTier = cities().get(s.city) ?? (o.cityTier === 1 || o.cityTier === "1" ? 1 : 2);
  }
  if (typeof o.hasGstin === "boolean") s.hasGstin = o.hasGstin;
  if (typeof o.currentInternet === "string") {
    const m = INTERNET.find((x) => x.toLowerCase() === (o.currentInternet as string).toLowerCase());
    if (m) s.currentInternet = m;
  }
  const sp = num(o.monthlySpend, 0, 10_000_000);
  if (sp !== undefined) s.monthlySpend = sp;
  return s;
}

async function extract(text: string, asked: Field | undefined, lang: LangCode, have: Slots): Promise<Extracted & { source: AiSource }> {
  const rule = extractRule(text, asked);
  if (!isAiEnabled()) return { ...rule, source: "fallback" };
  const res = await chat({
    json: true,
    temperature: 0,
    maxTokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You extract business details from a message by a small-business owner in India (the message may be in English, Hindi, Tamil or Marathi, or mixed). " +
          'Return ONLY a JSON object with any of these keys that the message clearly states: businessType (short English label e.g. "Kirana store"), employees (integer), numSites (integer shops/offices/branches), ' +
          'city (English name), cityTier (1 for metros like Mumbai/Delhi/Bengaluru/Chennai/Kolkata/Hyderabad/Pune/Ahmedabad, else 2), hasGstin (boolean), currentInternet (one of "None","Mobile hotspot","Home broadband","Business broadband","Leased line"), monthlySpend (integer rupees per month on internet and phones). ' +
          `Omit keys that are not stated. Current question asked: ${asked ?? "none"}. Already known: ${JSON.stringify(have)}.`,
      },
      { role: "user", content: text },
    ],
    fallback: () => rule.slots,
  });
  const llm = res.source === "groq" ? cleanLlmSlots(res.json) : {};
  const merged: Slots = { ...rule.slots };
  for (const [k, v] of Object.entries(llm)) if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
  // GSTIN registry verdict from rules always wins (LLM cannot verify).
  if (rule.slots.gstin || rule.notes.length) {
    merged.hasGstin = rule.slots.hasGstin;
    merged.gstin = rule.slots.gstin;
  }
  return { slots: merged, notes: rule.notes, source: res.source };
}

// ---------------------------------------------------------------- chips

export function chipsFor(field: Field | undefined, lang: LangCode): Chip[] {
  switch (field) {
    case "businessType":
      return BT_CHIPS.map((v) => ({ value: v, label: tr(lang, `adv.bt.${v}`) }));
    case "employees":
      return [
        { value: "1", label: tr(lang, "adv.chip.alone") },
        ...["2", "5", "10", "25"].map((v) => ({ value: v, label: v })),
      ];
    case "numSites":
      return ["1", "2", "3", "5"].map((v) => ({ value: v, label: v }));
    case "city":
      return [
        ...["Mumbai", "Delhi", "Pune", "Nagpur", "Coimbatore"].map((v) => ({ value: v, label: v })),
        { value: "smaller city", label: tr(lang, "adv.chip.smaller") },
      ];
    case "hasGstin":
      return [
        { value: "yes", label: tr(lang, "adv.chip.yes") },
        { value: "no", label: tr(lang, "adv.chip.no") },
      ];
    case "currentInternet":
      return INTERNET.map((v) => ({ value: v, label: tr(lang, `adv.net.${v}`) }));
    case "monthlySpend":
      return [
        ...["500", "1000", "2000", "5000"].map((v) => ({ value: `₹${v}`, label: `₹${v}` })),
        { value: "skip", label: tr(lang, "adv.chip.skip") },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- recommendation view

function viewLines(lines: { productId: string; quantity: number }[], lang: LangCode, seg: string, whyMap?: Record<string, string>): ViewLine[] {
  return computeQuote(lines).lines.map((l) => {
    const role = whyMap?.[l.productId] ?? whyRole(l.productId);
    return {
      productId: l.productId,
      name: l.productName,
      unit: l.unit,
      quantity: l.quantity,
      unitPriceInr: l.unitPriceInr,
      monthlyInr: l.monthlyInr,
      setupInr: l.setupInr,
      why: tr(lang, `adv.why.${role}`, { where: tr(lang, `adv.where.${seg}`) }),
    };
  });
}

function reasonText(codes: string[], lang: LangCode): string {
  return codes
    .map((c) => {
      const [k, n] = c.split(":");
      return tr(lang, `adv.ex.${k}`, { n: n ?? "" });
    })
    .join("; ");
}

export function recommendationView(rec: AdvisorRecommendation, lang: LangCode): RecommendationView {
  const q = computeQuote(rec.lines);
  return {
    segment: rec.segment,
    segmentLabel: tr(lang, `adv.seg.${rec.segment}`),
    lines: viewLines(rec.lines, lang, rec.segment, rec.why),
    optional: viewLines(rec.optionalLines, lang, rec.segment, rec.why),
    excluded: rec.excluded.map((x) => ({
      productId: x.productId,
      name: getProduct(x.productId)?.product_name ?? x.productId,
      reason: reasonText(x.reasons, lang),
    })),
    monthlyTotalInr: q.monthlyTotalInr,
    monthlyMinInr: q.monthlyMinInr,
    monthlyMaxInr: q.monthlyMaxInr,
    setupTotalInr: q.setupTotalInr,
    contractMonths: q.contractMonths,
  };
}

// ---------------------------------------------------------------- engine

const QKEY: Record<Field, string> = { businessType: "businessType", employees: "employees", numSites: "numSites", city: "city", hasGstin: "gstin", currentInternet: "internet", monthlySpend: "spend" };
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const nextField = (s: Slots): Field | undefined =>
  FIELDS.find((f) => (f === "city" ? s.cityTier === undefined : s[f] === undefined));

function profileSummary(s: Slots, lang: LangCode): string {
  const parts = [
    s.businessType,
    s.employees !== undefined ? tr(lang, "adv.profile.emp", { n: s.employees }) : undefined,
    s.numSites !== undefined ? tr(lang, "adv.profile.sites", { n: s.numSites }) : undefined,
    s.city,
    s.hasGstin !== undefined ? tr(lang, s.hasGstin ? "adv.profile.gst" : "adv.profile.nogst") : undefined,
  ].filter(Boolean);
  return parts.join(tr(lang, "adv.profile.sep"));
}

async function polish(base: string, lang: LangCode): Promise<{ text: string; source: AiSource }> {
  if (!isAiEnabled()) return { text: base, source: "fallback" };
  const r = await chat({
    temperature: 0.3,
    maxTokens: 300,
    messages: [
      {
        role: "system",
        content:
          `You are Accel's friendly business advisor for small Indian businesses. Rewrite the user's message in ${LANG_PROMPT_NAME[lang]}, in simple warm everyday words, at most 3 short sentences. ` +
          "Keep every number, rupee amount, product name and the meaning of any question exactly. Output only the rewritten message.",
      },
      { role: "user", content: base },
    ],
    fallback: () => base,
  });
  const text = r.text.trim();
  return r.source === "groq" && text ? { text, source: "groq" } : { text: base, source: "fallback" };
}

function toProfile(slots: Slots, seg: string) {
  return {
    businessType: slots.businessType,
    segment: seg as "micro" | "prof" | "multi" | "mfg",
    city: slots.city,
    cityTier: slots.cityTier,
    employeeCount: slots.employees,
    numSites: slots.numSites,
    hasGstin: slots.hasGstin,
    gstin: slots.gstin,
    currentInternet: slots.currentInternet,
    monthlyTelecomSpendInr: slots.monthlySpend || undefined,
  };
}

function stored(s: Session) {
  return (s.advisor?.slots ?? {}) as Slots;
}

export async function handleMessage(input: { sessionId?: string; text?: string; lang: LangCode; init?: boolean }): Promise<AdvisorResponse> {
  const lang = input.lang;
  let session = input.sessionId ? await getSession(input.sessionId) : undefined;
  const text = (input.text ?? "").trim().slice(0, 600);

  // New or resumed session, no user text.
  if (!text) {
    if (session && input.init) {
      const slots = stored(session);
      const asked = (session.advisor?.asked as Field | undefined) ?? nextField(slots);
      session = await updateSession(session.id, { language: lang });
      const rec = session.recommendation;
      return {
        sessionId: session.id,
        reply: session.messages.filter((m) => m.role === "assistant").slice(-1)[0]?.content ?? "",
        stage: session.advisor?.stage ?? "businessType",
        chips: rec ? [] : chipsFor(asked, lang),
        done: !!rec,
        ai: "fallback",
        recommendation: rec ? recommendationView(rec, lang) : undefined,
        quoteUrl: rec ? `/quote?session=${session.id}` : undefined,
        history: session.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      };
    }
    const first: Field = "businessType";
    const reply = `${tr(lang, "adv.greeting")} ${tr(lang, "adv.q.businessType")}`;
    const now = new Date().toISOString();
    const s = await createSession({
      language: lang,
      unclosed: true,
      lastStage: first,
      advisor: { stage: first, asked: first, slots: {} },
      messages: [{ role: "assistant", content: reply, ts: now }],
    });
    return { sessionId: s.id, reply, stage: first, chips: chipsFor(first, lang), done: false, ai: "fallback" };
  }

  if (!session) session = await createSession({ language: lang, unclosed: true, advisor: { stage: "businessType", asked: "businessType", slots: {} } });
  const sid = session.id;
  const slots: Slots = { ...stored(session) };
  const asked = session.advisor?.asked as Field | undefined;
  const wasDone = !!session.recommendation;

  const ex = await extract(text, wasDone ? undefined : asked, lang, slots);
  let changed = false;
  let filledAsked = false;
  for (const [k, v] of Object.entries(ex.slots)) {
    if (v === undefined) continue;
    if (!wasDone && slots[k as keyof Slots] !== undefined && k !== asked && k !== "cityTier" && k !== "city") {
      // Don't let a stray phrase overwrite earlier answers unless it is the field being asked.
      if (k !== "gstin" && k !== "hasGstin") continue;
    }
    if (slots[k as keyof Slots] !== v) changed = true;
    (slots as Record<string, unknown>)[k] = v;
    if (k === asked || (asked === "city" && k === "cityTier") || (asked === "hasGstin" && k === "hasGstin")) filledAsked = true;
  }

  const nowIso = new Date().toISOString();
  const userMsg = { role: "user" as const, content: text.replace(/[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][0-9A-Za-z]Z[0-9A-Za-z]/g, (g) => maskGstin(g.toUpperCase())), ts: nowIso };

  const next = nextField(slots);
  let base: string;
  let rec: AdvisorRecommendation | undefined;
  let stage: string;

  const ack = ex.notes.map((n) => tr(lang, n === "gstinOk" ? "adv.ack.gstinOk" : "adv.ack.gstinBad")).join(" ");

  if (wasDone && !changed) {
    rec = session.recommendation;
    stage = "recommended";
    base = tr(lang, "adv.recSessionHint");
  } else if (next) {
    stage = next;
    const retry = !wasDone && !filledAsked && Object.values(ex.slots).every((v) => v === undefined) ? tr(lang, "adv.retry") : "";
    base = `${ack ? ack + " " : ""}${retry}${tr(lang, `adv.q.${QKEY[next]}`)}`;
  } else {
    stage = "recommended";
    const input = {
      businessType: slots.businessType,
      employees: slots.employees ?? 1,
      numSites: slots.numSites ?? 1,
      cityTier: (slots.cityTier ?? 2) as 1 | 2,
      hasGstin: !!slots.hasGstin,
      currentInternet: slots.currentInternet,
      monthlySpend: slots.monthlySpend,
    };
    rec = await buildReviewedRecommendation(input);
    const v = recommendationView(rec, lang);
    const profile = profileSummary(slots, lang);
    const parts = [tr(lang, "adv.recIntro", { profile, price: inr(v.monthlyTotalInr) })];
    if (ack) parts.unshift(ack);
    if (v.excluded.length) parts.push(tr(lang, "adv.recExcluded", { list: v.excluded.map((x) => `${x.name} (${x.reason})`).join(", ") }));
    if (v.optional.length) parts.push(tr(lang, "adv.recOptional", { list: v.optional.map((x) => x.name).join(", ") }));
    base = parts.join(" ");
  }

  // Language-aware wording via Groq when available; the deterministic text is the fallback.
  // The recommendation reply keeps its exact figures/lists (card shows them) so we only polish questions.
  const polished = rec && !wasDone ? { text: base, source: "fallback" as AiSource } : await polish(base, lang);
  const reply = polished.text;

  const segment = rec?.segment ?? detectSegment({ businessType: slots.businessType, numSites: slots.numSites ?? 1, employees: slots.employees ?? 1 });
  const patch: Partial<Session> = {
    language: lang,
    messages: [...session.messages, userMsg, { role: "assistant", content: reply, ts: new Date().toISOString() }],
    profile: { ...session.profile, ...toProfile(slots, segment) },
    advisor: { stage, asked: rec ? undefined : next, slots: slots as Record<string, unknown> },
    lastStage: stage,
    unclosed: session.quoteId || session.orderId ? session.unclosed : true,
  };
  if (rec) {
    patch.recommendation = rec;
    patch.recommendedProductIds = rec.lines.map((l) => l.productId);
    patch.recommendedLines = rec.lines;
  }
  await updateSession(sid, patch);

  return {
    sessionId: sid,
    reply,
    stage,
    chips: rec ? [] : chipsFor(next, lang),
    done: !!rec,
    ai: polished.source,
    recommendation: rec ? recommendationView(rec, lang) : undefined,
    quoteUrl: rec ? `/quote?session=${sid}` : undefined,
  };
}
