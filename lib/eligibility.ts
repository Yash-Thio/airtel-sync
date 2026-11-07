import { getProduct, getProducts } from "./data/products";
import type { Product, SegmentCode } from "./data/types";

/** "Today" for date-based checks, per dataset README. */
export const TODAY = "2026-07-15";

export interface EligibilityProfile {
  cityTier: number;
  employeeCount: number;
  numSites: number;
  /** True only if the business holds a valid, ACTIVE GSTIN. */
  hasGstin: boolean;
  /** Optional: used only to flag segment fit (not a hard rule). */
  segment?: SegmentCode;
}

export interface ProductEligibility {
  product: Product;
  eligible: boolean;
  /** Human-readable reasons when ineligible. */
  reasons: string[];
  /** Product IDs of which >=1 must be in the same bundle (bundle-level rule, not checked here). */
  requiresOneOf: string[];
  /** Whether the product targets the profile segment (soft signal for ranking). */
  segmentFit: boolean;
}

export function evaluateProduct(p: Product, profile: EligibilityProfile): ProductEligibility {
  const reasons: string[] = [];
  if (!p.tiers.includes(profile.cityTier)) reasons.push(`Not available in tier ${profile.cityTier} cities`);
  if (profile.employeeCount < p.min_employees) reasons.push(`Needs at least ${p.min_employees} employees`);
  if (profile.numSites < p.min_sites) reasons.push(`Needs at least ${p.min_sites} sites`);
  if (p.requires_gstin && !profile.hasGstin) reasons.push("Requires a valid, active GSTIN");
  return {
    product: p,
    eligible: reasons.length === 0,
    reasons,
    requiresOneOf: p.requires_one_of,
    segmentFit: profile.segment ? p.target_segments.includes(profile.segment) : false,
  };
}

/** Evaluate every catalogue product for a profile (eligible and ineligible, with reasons). */
export function evaluateAllProducts(profile: EligibilityProfile): ProductEligibility[] {
  return getProducts().map((p) => evaluateProduct(p, profile));
}

/**
 * Products the profile may be offered, per catalogue rules: city tier, min employees,
 * min sites, requires_gstin. Segment-fit products sort first, then catalogue order.
 * Note: `requires_one_of` is a bundle-level dependency; use validateBundleDependencies().
 */
export function getEligibleProducts(profile: EligibilityProfile): ProductEligibility[] {
  return evaluateAllProducts(profile)
    .filter((e) => e.eligible)
    .sort((a, b) => Number(b.segmentFit) - Number(a.segmentFit));
}

export interface BundleIssue {
  productId: string;
  /** Machine-readable kind. */
  kind: "unknown_product" | "missing_dependency" | "ineligible";
  message: string;
  /** For missing_dependency: any one of these would satisfy the rule. */
  satisfiedByAnyOf?: string[];
}

export interface BundleValidation {
  valid: boolean;
  issues: BundleIssue[];
}

/**
 * Validate a selection (list of product IDs) for dependency rules (`requires_one_of`).
 * If `profile` is passed, per-product eligibility is also checked.
 */
export function validateBundleDependencies(selection: string[], profile?: EligibilityProfile): BundleValidation {
  const ids = new Set(selection);
  const issues: BundleIssue[] = [];
  for (const id of Array.from(ids)) {
    const p = getProduct(id);
    if (!p) {
      issues.push({ productId: id, kind: "unknown_product", message: `Unknown product ${id}` });
      continue;
    }
    if (p.requires_one_of.length && !p.requires_one_of.some((r) => ids.has(r))) {
      const names = p.requires_one_of.map((r) => `${r} ${getProduct(r)?.product_name ?? ""}`.trim()).join(", ");
      issues.push({
        productId: id,
        kind: "missing_dependency",
        message: `${p.product_name} needs at least one of: ${names}`,
        satisfiedByAnyOf: p.requires_one_of,
      });
    }
    if (profile) {
      const ev = evaluateProduct(p, profile);
      if (!ev.eligible) {
        issues.push({ productId: id, kind: "ineligible", message: `${p.product_name}: ${ev.reasons.join("; ")}` });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

// ---------------- Pricing ----------------

export interface QuoteLineInput {
  productId: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPriceInr: number;
  unitPriceMinInr: number;
  unitPriceMaxInr: number;
  monthlyInr: number;
  setupInr: number;
  contractMonths: number;
}

export interface QuoteTotals {
  lines: PricedLine[];
  monthlyTotalInr: number;
  /** Monthly total at catalogue price range bounds. */
  monthlyMinInr: number;
  monthlyMaxInr: number;
  setupTotalInr: number;
  contractMonths: number;
}

/**
 * Pricing rule (documented, matches historical lead data):
 *  - unit price = midpoint of [price_min, price_max], rounded to whole rupees
 *  - line monthly = unit price x quantity
 *  - line setup   = one_time_setup_inr x quantity (setup is charged per unit)
 *  - contract months for the bundle = MAX of min_contract_months across lines
 *  - quantity is clamped to a positive integer; unknown products are skipped
 */
export function computeQuote(lines: QuoteLineInput[]): QuoteTotals {
  const priced: PricedLine[] = [];
  for (const l of lines) {
    const p = getProduct(l.productId);
    if (!p) continue;
    const q = Math.max(1, Math.floor(l.quantity || 1));
    const unit = Math.round((p.price_min_inr_per_month + p.price_max_inr_per_month) / 2);
    priced.push({
      productId: p.product_id,
      productName: p.product_name,
      unit: p.unit,
      quantity: q,
      unitPriceInr: unit,
      unitPriceMinInr: p.price_min_inr_per_month,
      unitPriceMaxInr: p.price_max_inr_per_month,
      monthlyInr: unit * q,
      setupInr: p.one_time_setup_inr * q,
      contractMonths: p.min_contract_months,
    });
  }
  return {
    lines: priced,
    monthlyTotalInr: priced.reduce((s, l) => s + l.monthlyInr, 0),
    monthlyMinInr: priced.reduce((s, l) => s + l.unitPriceMinInr * l.quantity, 0),
    monthlyMaxInr: priced.reduce((s, l) => s + l.unitPriceMaxInr * l.quantity, 0),
    setupTotalInr: priced.reduce((s, l) => s + l.setupInr, 0),
    contractMonths: priced.reduce((m, l) => Math.max(m, l.contractMonths), 0),
  };
}

/** Expected activation: today + longest typical_install_days across lines (calendar days). */
export function expectedInstallDays(productIds: string[]): number {
  return productIds.reduce((m, id) => Math.max(m, getProduct(id)?.typical_install_days ?? 0), 0);
}
