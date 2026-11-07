import { readCsv, splitList } from "./csv";
import type { Product, SegmentCode } from "./types";

let cache: Product[] | null = null;

/** All 25 catalogue products with parsed eligibility fields (cached in memory). */
export function getProducts(): Product[] {
  if (cache) return cache;
  cache = readCsv("product_catalogue.csv").map((r) => ({
    product_id: r.product_id,
    category: r.category,
    product_name: r.product_name,
    description: r.description,
    unit: r.unit,
    price_min_inr_per_month: Number(r.price_min_inr_per_month),
    price_max_inr_per_month: Number(r.price_max_inr_per_month),
    one_time_setup_inr: Number(r.one_time_setup_inr),
    min_contract_months: Number(r.min_contract_months),
    tiers: splitList(r.available_city_tiers, ";").map(Number),
    min_employees: Number(r.min_employees),
    min_sites: Number(r.min_sites),
    requires_gstin: r.requires_gstin === "Y",
    requires_one_of: splitList(r.requires_one_of, "|"),
    typical_install_days: Number(r.typical_install_days),
    target_segments: splitList(r.target_segments, ";") as SegmentCode[],
  }));
  return cache;
}

export function getProduct(id: string): Product | undefined {
  return getProducts().find((p) => p.product_id === id);
}
