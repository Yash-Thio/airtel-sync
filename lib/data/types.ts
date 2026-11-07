export type SegmentCode = "micro" | "prof" | "multi" | "mfg";

export const SEGMENT_LABEL_TO_CODE: Record<string, SegmentCode> = {
  "Micro retail & services": "micro",
  "Professional offices": "prof",
  "Small multi-site businesses": "multi",
  "Small manufacturers": "mfg",
};

export const SEGMENT_CODE_LABEL: Record<SegmentCode, string> = {
  micro: "Micro retail & services",
  prof: "Professional offices",
  multi: "Small multi-site businesses",
  mfg: "Small manufacturers",
};

export interface Product {
  product_id: string;
  category: string;
  product_name: string;
  description: string;
  unit: string;
  price_min_inr_per_month: number;
  price_max_inr_per_month: number;
  one_time_setup_inr: number;
  min_contract_months: number;
  /** Eligibility: city tiers where the product is sold, e.g. [1,2] */
  tiers: number[];
  min_employees: number;
  min_sites: number;
  requires_gstin: boolean;
  /** Product IDs, at least one must be in the same bundle. Empty = none. */
  requires_one_of: string[];
  typical_install_days: number;
  target_segments: SegmentCode[];
}

export interface Lead {
  lead_id: string;
  created_date: string;
  lead_source: string;
  business_name: string;
  business_type: string;
  segment: string;
  segment_code: SegmentCode | null;
  city: string;
  city_tier: number;
  state: string;
  preferred_language: string;
  employee_count: number;
  num_sites: number;
  annual_turnover_band: string;
  has_gstin: boolean;
  gstin: string;
  has_udyam: boolean;
  udyam_number: string;
  current_internet: string;
  current_provider: string;
  monthly_telecom_spend_inr: number;
  products_of_interest: string[];
  contact_name: string;
  contact_role: string;
  stage_reached: string;
  outcome: string;
  drop_reason: string;
  contacted_date: string;
  needs_assessed_date: string;
  quote_accepted_date: string;
  kyc_complete_date: string;
  activated_date: string;
  days_lead_to_activation: number | null;
  customer_follow_up_calls: number | null;
  bundle_products: { product_id: string; quantity: number }[];
  monthly_bundle_value_inr: number | null;
  one_time_setup_inr: number | null;
  contract_months: number | null;
  churned_within_6_months: string;
  nps_score: number | null;
  acquisition_cost_inr: number | null;
}

export interface GstinRecord {
  gstin: string;
  legal_name: string;
  trade_name: string;
  constitution: string;
  principal_place_of_business: string;
  state: string;
  registration_date: string;
  status: "Active" | "Cancelled" | "Suspended" | string;
}

export interface UdyamRecord {
  udyam_number: string;
  enterprise_name: string;
  enterprise_type: string;
  major_activity: string;
  nic_description: string;
  state: string;
  city: string;
  date_of_registration: string;
}
