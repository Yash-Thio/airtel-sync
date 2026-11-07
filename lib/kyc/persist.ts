import type { KycDocument, KycRecord } from "@/lib/data/store";
import { RETENTION } from "./consent";
import { maskConsumerNo, maskGstin, maskIdNumber, maskPanFromGstin, maskUdyam } from "./mask";
import { splitLegalName } from "./match";
import { DOC_SLOTS, SENSITIVE_FIELDS, type DocSlot, type ExtractedDocs, type Fields, type ValidateResult } from "./types";

const MASKERS: Record<string, (v?: string | null) => string> = {
  gstin: maskGstin,
  udyam_number: maskUdyam,
  id_number: maskIdNumber,
  consumer_no: maskConsumerNo,
};

/** Replace identifier fields with masked values. Non-identifier fields pass through. */
export function maskFields(slot: DocSlot, f: Fields = {}): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(f)) {
    out[k] = v == null || v === "" ? null : SENSITIVE_FIELDS[slot].includes(k) ? MASKERS[k](String(v)) : String(v);
  }
  return out;
}

export function buildDocuments(
  docs: ExtractedDocs,
  result: ValidateResult,
  refs: Partial<Record<DocSlot, { fileName: string; url?: string }>> = {},
): KycDocument[] {
  return DOC_SLOTS.filter((s) => docs[s]).map((slot) => {
    const related = result.checks.filter((c) => c.status !== "pass" && c.slots?.includes(slot));
    const status: KycDocument["status"] = related.some((c) => c.status === "fail" && c.blocking)
      ? "rejected"
      : related.length
        ? "flagged"
        : "verified";
    return {
      type: slot,
      fileName: refs[slot]?.fileName ?? slot,
      url: refs[slot]?.url,
      extracted: maskFields(slot, docs[slot]),
      issues: related.map((c) => c.message),
      status,
    };
  });
}

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/** Masked summary persisted on the KYC record (no raw identifiers). */
export function buildSummary(docs: ExtractedDocs, result: ValidateResult, nowIso: string): NonNullable<KycRecord["summary"]> {
  const g = docs.gst_certificate;
  const gstin = g?.gstin ?? "";
  const { business } = splitLegalName(g?.legal_name);
  return {
    businessName: g?.trade_name || business || null,
    constitution: g?.constitution ?? null,
    gstinMasked: maskGstin(gstin) || null,
    panMasked: maskPanFromGstin(gstin) || null,
    udyamMasked: maskUdyam(docs.udyam_certificate?.udyam_number) || null,
    signatory: docs.signatory_id?.name ?? null,
    signatoryIdMasked: maskIdNumber(docs.signatory_id?.id_number) || null,
    addressProofDate: docs.address_proof?.bill_date ?? null,
    gstRegistryStatus: result.registry.gstin?.status ?? null,
    verdict: result.verdict,
    retention: {
      rawDocuments: RETENTION.rawDocuments,
      maskedFieldsEraseOn: addDays(nowIso.slice(0, 10), RETENTION.maskedFieldsDays),
      statutoryRecordYears: RETENTION.statutoryRecordYears,
    },
  };
}
