import type { GstinRecord, UdyamRecord } from "@/lib/data/types";

export type DocSlot = "gst_certificate" | "udyam_certificate" | "signatory_id" | "address_proof";
export const DOC_SLOTS: DocSlot[] = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"];

export type Fields = Record<string, string | null | undefined>;

/** Field names extracted per document slot. */
export const DOC_FIELDS: Record<DocSlot, string[]> = {
  gst_certificate: ["gstin", "legal_name", "trade_name", "constitution", "address", "date_of_liability", "registration_type"],
  udyam_certificate: ["udyam_number", "enterprise_name", "major_activity", "city", "state", "date_of_registration"],
  signatory_id: ["name", "designation", "business", "id_number", "valid_till"],
  address_proof: ["consumer_no", "billed_to", "address", "bill_date", "units", "amount"],
};

/** Identifier fields that are masked in UI and logs. */
export const SENSITIVE_FIELDS: Record<DocSlot, string[]> = {
  gst_certificate: ["gstin"],
  udyam_certificate: ["udyam_number"],
  signatory_id: ["id_number"],
  address_proof: ["consumer_no"],
};

export type ScanQuality = "ok" | "skewed" | "blurry";

export interface ExtractedDocs {
  gst_certificate?: Fields;
  udyam_certificate?: Fields;
  signatory_id?: Fields;
  address_proof?: Fields;
}

export interface ValidateInput {
  docs: ExtractedDocs;
  /** Per-slot scan quality as reported by extraction. */
  quality?: Partial<Record<DocSlot, ScanQuality>>;
  /** Applicant confirms the business has no Udyam registration. */
  udyamDeclaredNone?: boolean;
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  /** Plain-language finding. Never contains raw identifiers (masked). */
  message: string;
  /** Plain-language instruction to fix a warn/fail. */
  fix?: string;
  /** A failing blocking check makes the verdict "rejected" (cannot be fixed by re-upload alone). */
  blocking?: boolean;
  /** Which document slots the problem relates to (UI shows re-upload buttons). */
  slots?: DocSlot[];
}

export type Verdict = "verified" | "needs_attention" | "rejected";

export interface ValidateResult {
  verdict: Verdict;
  checks: CheckResult[];
  counts: { pass: number; warn: number; fail: number };
  /** Registry facts looked up during validation (masked). */
  registry: {
    gstin?: { status: string; legalName: string; state: string } | null;
    udyam?: { enterpriseName: string; state: string } | null;
  };
  checkedAgainst: string; // ISO date used as "today"
}

export interface ValidateDeps {
  lookupGstin: (g: string) => GstinRecord | null;
  lookupUdyam: (u: string) => UdyamRecord | null;
}
