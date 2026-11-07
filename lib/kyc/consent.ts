/** DPDP Act 2023 consent notice constants (versioned; version is recorded with each consent). */

export const CONSENT_VERSION = "kyc-notice-2026-07-v1";

/** Purposes the applicant consents to. "kyc" and "service" are required; "marketing" is optional and off by default. */
export const CONSENT_PURPOSES = {
  kyc: "business_kyc_verification",
  service: "service_activation",
  marketing: "marketing_communications",
} as const;

/** Retention schedule (documented in the notice and in the stored KYC record). */
export const RETENTION = {
  /** Raw document images are processed in memory only and never written to disk. */
  rawDocuments: "not stored (processed in memory; deleted immediately after extraction)",
  /** Extracted, masked fields kept for this many days after verification, then erased. */
  maskedFieldsDays: 90,
  /** Minimal verification outcome + consent record kept as statutory/audit record (years). */
  statutoryRecordYears: 7,
} as const;

export const GRIEVANCE = {
  officer: "Data Protection Officer, Accel Business",
  email: "privacy@accel.example",
  responseDays: 7,
} as const;

/** Mock demo OTP for the simulated e-sign step. */
export const DEMO_ESIGN_OTP = "123456";
