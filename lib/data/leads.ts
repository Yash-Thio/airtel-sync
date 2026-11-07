import { readCsv, splitList, num } from "./csv";
import { SEGMENT_LABEL_TO_CODE, type Lead } from "./types";

let cache: Lead[] | null = null;

/** All 5,000 historical leads (cached in memory). Useful for analytics / similar-customer hints. */
export function getLeads(): Lead[] {
  if (cache) return cache;
  cache = readCsv("smb_leads.csv").map((r) => ({
    lead_id: r.lead_id,
    created_date: r.created_date,
    lead_source: r.lead_source,
    business_name: r.business_name,
    business_type: r.business_type,
    segment: r.segment,
    segment_code: SEGMENT_LABEL_TO_CODE[r.segment] ?? null,
    city: r.city,
    city_tier: Number(r.city_tier),
    state: r.state,
    preferred_language: r.preferred_language,
    employee_count: Number(r.employee_count),
    num_sites: Number(r.num_sites),
    annual_turnover_band: r.annual_turnover_band,
    has_gstin: r.has_gstin === "Y",
    gstin: r.gstin,
    has_udyam: r.has_udyam === "Y",
    udyam_number: r.udyam_number,
    current_internet: r.current_internet,
    current_provider: r.current_provider,
    monthly_telecom_spend_inr: Number(r.monthly_telecom_spend_inr),
    products_of_interest: splitList(r.products_of_interest, ";"),
    contact_name: r.contact_name,
    contact_role: r.contact_role,
    stage_reached: r.stage_reached,
    outcome: r.outcome,
    drop_reason: r.drop_reason,
    contacted_date: r.contacted_date,
    needs_assessed_date: r.needs_assessed_date,
    quote_accepted_date: r.quote_accepted_date,
    kyc_complete_date: r.kyc_complete_date,
    activated_date: r.activated_date,
    days_lead_to_activation: num(r.days_lead_to_activation),
    customer_follow_up_calls: num(r.customer_follow_up_calls),
    bundle_products: splitList(r.bundle_products, ";").map((s) => {
      const [product_id, q] = s.split("x");
      return { product_id, quantity: Number(q) || 1 };
    }),
    monthly_bundle_value_inr: num(r.monthly_bundle_value_inr),
    one_time_setup_inr: num(r.one_time_setup_inr),
    contract_months: num(r.contract_months),
    churned_within_6_months: r.churned_within_6_months,
    nps_score: num(r.nps_score),
    acquisition_cost_inr: num(r.acquisition_cost_inr),
  }));
  return cache;
}

export function getLead(id: string): Lead | undefined {
  return getLeads().find((l) => l.lead_id === id);
}
