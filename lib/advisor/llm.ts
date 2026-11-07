import { chat } from "@/lib/ai/provider";
import { getProduct } from "@/lib/data/products";
import type { AdvisorRecommendation } from "@/lib/data/store";
import { evaluateProduct, validateBundleDependencies } from "@/lib/eligibility";
import {
  classifyProfileRule,
  isProfileKey,
  isSpecificProfile,
  profileKeyList,
  type ProfileKey,
} from "@/lib/advisor/profiles";
import { detectSegment, recommend, toRecommendation, type RecInput, type RecResult } from "@/lib/advisor/recommend";

const CONNECTIVITY = new Set(["P01", "P02", "P03", "P04", "P05", "P06"]);

function readProfileKey(json: unknown): ProfileKey | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  const raw = o.profileKey ?? o.profile ?? o.key;
  if (typeof raw !== "string") return undefined;
  const key = raw.trim();
  return isProfileKey(key) ? key : undefined;
}

/**
 * Map free text to a profile key. A specific rule match always wins (parlour, salon, spa, …).
 * Groq is asked only to fill gaps, and only a known key is accepted. No key -> the rule result.
 */
export async function classifyProfile(text: string, detected = detectSegment({ businessType: text, numSites: 1, employees: 1 })): Promise<ProfileKey> {
  const rule = classifyProfileRule(text, detected);
  const res = await chat({
    json: true,
    temperature: 0,
    maxTokens: 40,
    messages: [
      {
        role: "system",
        content:
          "You classify a small Indian business description into exactly one profile key. " +
          "The text may be English, Hindi, Tamil, Marathi, or mixed. " +
          "Return ONLY JSON: {\"profileKey\":\"<one key>\"}. " +
          "Do not invent keys. Use a fallback_* key only when nothing else fits. " +
          `Keys: ${profileKeyList()}. ` +
          "salon covers salon, parlour, parlor, beauty parlor, beauty parlour, spa, barber. " +
          "kirana covers grocery and general stores. pharmacy covers chemist and medical stores. " +
          "restaurant covers cafe, bakery, dhaba. clinic covers dental, diagnostic, pathology. " +
          "coaching covers tuition and classes. professional covers CA, law, advocate, consulting. " +
          "retail covers a shop that sells goods. hotel covers guesthouse and lodge. " +
          "manufacturer covers factory, workshop, mill. logistics covers fleet, courier, transport.",
      },
      { role: "user", content: text.trim() || "(no description)" },
    ],
    fallback: () => ({ profileKey: rule }),
  });
  const llm = res.source === "groq" ? readProfileKey(res.json) : undefined;
  // Rules keep an explicit type. The model may only name a type when rules found nothing specific.
  if (llm && isSpecificProfile(llm) && !isSpecificProfile(rule)) return llm;
  return rule;
}

interface ReviewDecision {
  remove: string[];
  demote: string[];
  promote: string[];
}

function normId(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.toUpperCase().match(/P\d{2}/);
  return m ? m[0] : undefined;
}

function readDecision(json: unknown): ReviewDecision {
  const empty = { remove: [], demote: [], promote: [] };
  if (!json || typeof json !== "object") return empty;
  const o = json as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(normId).filter((x): x is string => !!x) : []);
  return { remove: ids(o.remove), demote: ids(o.demote), promote: ids(o.promote) };
}

/**
 * Apply a review decision. Unknown ids, catalogue misses, never-list ids, and products
 * outside the current core / allowed-optional lists are ignored. requires_one_of is
 * re-checked. If the edit would drop every connectivity product, the original bundle is kept.
 */
export function applyReviewDecision(rec: RecResult, raw: unknown): RecResult {
  const decision = readDecision(raw);
  if (!decision.remove.length && !decision.demote.length && !decision.promote.length) return rec;

  const never = new Set(rec.never);
  const allowed = new Set(rec.allowedOptional);
  const known = (id: string) => !!getProduct(id) && !never.has(id);

  let lines = rec.lines.map((l) => ({ ...l }));
  let optional = rec.optionalLines.map((l) => ({ ...l }));

  for (const id of decision.remove) {
    if (!known(id)) continue;
    lines = lines.filter((l) => l.productId !== id);
    optional = optional.filter((l) => l.productId !== id);
  }
  for (const id of decision.demote) {
    if (!known(id)) continue;
    const i = lines.findIndex((l) => l.productId === id);
    if (i < 0) continue;
    const [line] = lines.splice(i, 1);
    if (!optional.some((l) => l.productId === id)) optional.push(line);
  }
  for (const id of decision.promote) {
    if (!known(id) || !allowed.has(id)) continue;
    const orig = rec.optionalLines.find((l) => l.productId === id);
    if (!orig || lines.some((l) => l.productId === id)) continue;
    const product = getProduct(id)!;
    if (!evaluateProduct(product, rec.eligibility).eligible) continue;
    optional = optional.filter((l) => l.productId !== id);
    lines.push({ ...orig });
  }

  const issues = validateBundleDependencies(
    lines.map((l) => l.productId),
    rec.eligibility,
  ).issues;
  const drop = new Set(issues.filter((i) => i.kind === "missing_dependency" || i.kind === "ineligible" || i.kind === "unknown_product").map((i) => i.productId));
  if (drop.size) lines = lines.filter((l) => !drop.has(l.productId));

  const core = new Set(lines.map((l) => l.productId));
  optional = optional.filter((l) => {
    const p = getProduct(l.productId);
    if (!p || never.has(p.product_id) || !evaluateProduct(p, rec.eligibility).eligible) return false;
    if (p.requires_one_of.length && !p.requires_one_of.some((x) => core.has(x))) return false;
    return true;
  });

  if (!lines.some((l) => CONNECTIVITY.has(l.productId))) return rec;

  return {
    ...rec,
    lines,
    optionalLines: optional,
    allowedOptional: optional.map((l) => l.productId),
  };
}

function bundleBrief(rec: RecResult): string {
  const fmt = (lines: { productId: string; quantity: number }[]) =>
    lines
      .map((l) => {
        const name = getProduct(l.productId)?.product_name ?? l.productId;
        return `${l.productId} ${name} x${l.quantity}`;
      })
      .join("; ");
  return `Core: ${fmt(rec.lines) || "(none)"}. Optional (only these may be promoted): ${fmt(rec.optionalLines) || "(none)"}. Never add: ${rec.never.join(", ") || "(none)"}.`;
}

/**
 * Bounded review. The model may remove, demote core->optional, or promote from the
 * allowed-optional list. Output is checked against the catalogue, the never-list and eligibility.
 * With no Groq key the rule bundle is unchanged.
 */
export async function reviewBundle(rec: RecResult, r: RecInput): Promise<RecResult> {
  const business = [
    r.businessType || "unspecified",
    `${r.employees} employees`,
    `${r.numSites} site(s)`,
    r.hasGstin ? "GSTIN yes" : "GSTIN no",
    r.currentInternet ? `internet: ${r.currentInternet}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const res = await chat({
    json: true,
    temperature: 0,
    maxTokens: 180,
    messages: [
      {
        role: "system",
        content:
          "You review a product bundle for a small Indian business. Return ONLY JSON: " +
          '{"remove":[],"demote":[],"promote":[]}. ' +
          "remove: drop a product id that is already in core or optional. " +
          "demote: move a core id to optional. " +
          "promote: move an id from the optional list into core. " +
          "You cannot add any id that is not already in core or optional. You cannot add never-list ids. " +
          "You cannot invent products. Leave the lists empty unless a line clearly does not fit this business. " +
          "Do not remove the only internet connection.",
      },
      { role: "user", content: `Business: ${business}. Profile: ${rec.profileKey}. ${bundleBrief(rec)}` },
    ],
    fallback: () => ({ remove: [], demote: [], promote: [] }),
  });
  if (res.source !== "groq") return rec;
  return applyReviewDecision(rec, res.json);
}

/** Rule bundle, then Groq classify + bounded review. Safe when GROQ_API_KEY is unset. */
export async function buildReviewedRecommendation(r: RecInput): Promise<AdvisorRecommendation> {
  const detected = detectSegment(r);
  const profileKey = r.profileKey && isProfileKey(r.profileKey) ? r.profileKey : await classifyProfile(r.businessType ?? "", detected);
  const rec = await reviewBundle(recommend({ ...r, profileKey }), r);
  return toRecommendation(rec);
}
