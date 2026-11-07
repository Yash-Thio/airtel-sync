import { computeQuote, getEligibleProducts, validateBundleDependencies, type EligibilityProfile } from "@/lib/eligibility";
import { getProduct } from "@/lib/data/products";
import type { SegmentCode } from "@/lib/data/types";
import type { AdvisorRecommendation, QuoteLine } from "@/lib/data/store";
import {
  buildProfilePlan,
  classifyProfileRule,
  isProfileKey,
  type PlannedItem,
  type ProfileKey,
  type SizeContext,
} from "@/lib/advisor/profiles";

export interface RecInput extends SizeContext {
  cityTier: 1 | 2;
  /** Set when the classifier already chose a profile. */
  profileKey?: ProfileKey;
}

const MFG = /(manufactur|factory|unit\b|workshop|mill|foundry|moulding|molding|packaging|textile|auto-parts|printing|furniture|food processing|कारखान|फैक्ट|वर्कशॉप|தொழிற்சாலை|பட்டறை)/i;
const PROF = /(office|law|ca firm|clinic|lab|dental|physio|architect|studio|agency|consult|coaching|accountant|advocate|insurance|real estate|travel|ऑफिस|क्लिनिक|वकील|அலுவலகம்|கிளினிக்)/i;
const CHAIN = /(chain|group|branches|franchise|multi|शाखा|கிளை)/i;

export function detectSegment(r: Pick<RecInput, "businessType" | "numSites" | "employees">): SegmentCode {
  const bt = r.businessType ?? "";
  if (MFG.test(bt)) return "mfg";
  if (r.numSites >= 2 || CHAIN.test(bt)) return "multi";
  if (PROF.test(bt)) return "prof";
  return "micro";
}

/** Role -> i18n key suffix for the plain-language reason ("adv.why.<role>"). */
const ROLE: Record<string, string> = {
  P01: "connectivity",
  P02: "connectivity",
  P04: "connectivityAir",
  P05: "leased",
  P06: "leased",
  P03: "connectivity",
  P07: "mobile",
  P08: "mobile",
  P09: "backup",
  P10: "sdwan",
  P11: "static",
  P12: "telephony",
  P15: "whatsapp",
  P16: "email",
  P17: "cloudbackup",
  P19: "pos",
  P20: "security",
  P21: "firewall",
  P22: "wifi",
  P23: "cctv",
  P24: "iot",
  P25: "tracker",
};

/** Codes understood by the UI/strings: gstin | tier | employees:<n> | sites:<n> | dependency */
function reasonCodes(productId: string, ep: EligibilityProfile): string[] {
  const p = getProduct(productId)!;
  const codes: string[] = [];
  if (!p.tiers.includes(ep.cityTier)) codes.push("tier");
  if (ep.employeeCount < p.min_employees) codes.push(`employees:${p.min_employees}`);
  if (ep.numSites < p.min_sites) codes.push(`sites:${p.min_sites}`);
  if (p.requires_gstin && !ep.hasGstin) codes.push("gstin");
  return codes;
}

export interface RecResult {
  segment: SegmentCode;
  profileKey: ProfileKey;
  lines: QuoteLine[];
  optionalLines: QuoteLine[];
  excluded: { productId: string; reasons: string[] }[];
  /** productId -> adv.why suffix. */
  why: Record<string, string>;
  /** Optional lines the review step is allowed to promote. */
  allowedOptional: string[];
  never: string[];
  eligibility: EligibilityProfile;
}

function whyFor(item: PlannedItem, picked: string): string {
  return item.whyById?.[picked] ?? item.why;
}

export function recommend(r: RecInput): RecResult {
  const detected = detectSegment(r);
  const profileKey = r.profileKey && isProfileKey(r.profileKey) ? r.profileKey : classifyProfileRule(r.businessType ?? "", detected);
  const plan = buildProfilePlan(profileKey, r);
  const ep: EligibilityProfile = {
    cityTier: r.cityTier,
    employeeCount: r.employees,
    numSites: r.numSites,
    hasGstin: r.hasGstin,
    segment: plan.segment,
  };
  const eligible = new Set(getEligibleProducts(ep).map((e) => e.product.product_id));
  const never = new Set(plan.never);
  const lines: QuoteLine[] = [];
  const optionalLines: QuoteLine[] = [];
  const excluded: RecResult["excluded"] = [];
  const why: Record<string, string> = {};

  const consider = (items: PlannedItem[], optional: boolean) => {
    for (const w of items) {
      const preferred = w.ids[0];
      const pick = w.ids.find((id) => eligible.has(id) && !never.has(id));
      if (!eligible.has(preferred) && !never.has(preferred) && !excluded.some((x) => x.productId === preferred)) {
        const reasons = reasonCodes(preferred, ep);
        if (reasons.length) excluded.push({ productId: preferred, reasons });
      }
      if (!pick) continue;
      const line = { productId: pick, quantity: Math.max(1, Math.floor(w.qty) || 1) };
      (optional ? optionalLines : lines).push(line);
      why[pick] = whyFor(w, pick);
    }
  };
  consider(plan.core, false);
  consider(plan.optional, true);

  // Enforce requires_one_of: drop dependants lacking a base product in the core bundle.
  const coreIds = () => lines.map((l) => l.productId);
  const v = validateBundleDependencies(coreIds(), ep);
  for (const issue of v.issues) {
    if (issue.kind !== "missing_dependency") continue;
    const i = lines.findIndex((l) => l.productId === issue.productId);
    if (i >= 0) lines.splice(i, 1);
    if (!excluded.some((x) => x.productId === issue.productId)) {
      excluded.push({ productId: issue.productId, reasons: ["dependency"] });
    }
  }
  const core = new Set(coreIds());
  for (let i = optionalLines.length - 1; i >= 0; i--) {
    const p = getProduct(optionalLines[i].productId);
    if (!p) {
      optionalLines.splice(i, 1);
      continue;
    }
    if (never.has(p.product_id) || (p.requires_one_of.length && !p.requires_one_of.some((x) => core.has(x)))) {
      optionalLines.splice(i, 1);
    }
  }

  return {
    segment: plan.segment,
    profileKey,
    lines,
    optionalLines,
    excluded,
    why,
    allowedOptional: optionalLines.map((l) => l.productId),
    never: plan.never,
    eligibility: ep,
  };
}

export function whyRole(productId: string): string {
  return ROLE[productId] ?? "connectivity";
}

export function toRecommendation(rec: RecResult, createdAt = new Date().toISOString()): AdvisorRecommendation {
  const q = computeQuote(rec.lines);
  return {
    segment: rec.segment,
    profileKey: rec.profileKey,
    lines: rec.lines,
    optionalLines: rec.optionalLines,
    excluded: rec.excluded,
    why: rec.why,
    monthlyTotalInr: q.monthlyTotalInr,
    setupTotalInr: q.setupTotalInr,
    contractMonths: q.contractMonths,
    createdAt,
  };
}

export function buildRecommendation(r: RecInput): AdvisorRecommendation {
  return toRecommendation(recommend(r));
}
