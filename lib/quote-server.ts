import { computeQuote, evaluateAllProducts, validateBundleDependencies, type EligibilityProfile, type QuoteLineInput } from "./eligibility";
import { getSession, type BusinessProfile } from "./data/store";

export function toEligibilityProfile(p: BusinessProfile | undefined): EligibilityProfile {
  const x = p ?? {};
  return {
    cityTier: x.cityTier === 2 ? 2 : 1,
    employeeCount: Number.isFinite(Number(x.employeeCount)) ? Number(x.employeeCount) : 1,
    numSites: Number.isFinite(Number(x.numSites)) ? Math.max(1, Number(x.numSites)) : 1,
    hasGstin: x.hasGstin === true || (x.hasGstin === undefined && !!x.gstin),
    segment: x.segment,
  };
}

export function cleanLines(raw: unknown): QuoteLineInput[] {
  if (!Array.isArray(raw)) return [];
  const m = new Map<string, number>();
  for (const l of raw) {
    const id = typeof l?.productId === "string" ? l.productId : null;
    if (!id) continue;
    const q = Math.min(99, Math.max(1, Math.floor(Number(l.quantity) || 1)));
    m.set(id, q);
  }
  return Array.from(m, ([productId, quantity]) => ({ productId, quantity }));
}

/** Session recommended lines: prefers `recommendedLines` (if the advisor stored them), else recommendedProductIds x1. */
export async function sessionLines(sessionId?: string): Promise<{ profile?: BusinessProfile; lines: QuoteLineInput[]; language?: string }> {
  const s = sessionId ? await getSession(sessionId) : undefined;
  if (!s) return { lines: [] };
  const extra = (s as unknown as { recommendedLines?: unknown }).recommendedLines;
  let lines = cleanLines(extra);
  if (!lines.length) lines = (s.recommendedProductIds ?? []).map((productId) => ({ productId, quantity: 1 }));
  return { profile: s.profile, lines, language: s.language };
}

/** Compute + validate a bundle for a profile. */
export function buildQuote(profile: EligibilityProfile, lines: QuoteLineInput[]) {
  const totals = computeQuote(lines);
  const validation = validateBundleDependencies(lines.map((l) => l.productId), profile);
  return { totals, validation };
}

export function catalogue(profile: EligibilityProfile) {
  return evaluateAllProducts(profile).map((e) => ({
    productId: e.product.product_id,
    name: e.product.product_name,
    category: e.product.category,
    description: e.product.description,
    unit: e.product.unit,
    priceMinInr: e.product.price_min_inr_per_month,
    priceMaxInr: e.product.price_max_inr_per_month,
    unitPriceInr: Math.round((e.product.price_min_inr_per_month + e.product.price_max_inr_per_month) / 2),
    setupInr: e.product.one_time_setup_inr,
    contractMonths: e.product.min_contract_months,
    installDays: e.product.typical_install_days,
    requiresOneOf: e.requiresOneOf,
    eligible: e.eligible,
    reasons: e.reasons,
    segmentFit: e.segmentFit,
  }));
}
