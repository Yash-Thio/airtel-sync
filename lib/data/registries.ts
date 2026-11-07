import { readCsv } from "./csv";
import type { GstinRecord, UdyamRecord } from "./types";

let gstinCache: Map<string, GstinRecord> | null = null;
let udyamCache: Map<string, UdyamRecord> | null = null;

export const normGstin = (g: string) => g.replace(/\s+/g, "").toUpperCase();
export const normUdyam = (u: string) => u.replace(/\s+/g, "").toUpperCase();

function gstinMap() {
  if (!gstinCache) {
    gstinCache = new Map();
    for (const r of readCsv("mock_gstin_registry.csv")) {
      gstinCache.set(normGstin(r.gstin), r as unknown as GstinRecord);
    }
  }
  return gstinCache;
}

function udyamMap() {
  if (!udyamCache) {
    udyamCache = new Map();
    for (const r of readCsv("mock_udyam_registry.csv")) {
      udyamCache.set(normUdyam(r.udyam_number), r as unknown as UdyamRecord);
    }
  }
  return udyamCache;
}

/** Mock GST registry lookup. Returns null if not found. */
export function lookupGstin(gstin: string): GstinRecord | null {
  return gstinMap().get(normGstin(gstin)) ?? null;
}

/** Mock Udyam registry lookup. Returns null if not found. */
export function lookupUdyam(udyam: string): UdyamRecord | null {
  return udyamMap().get(normUdyam(udyam)) ?? null;
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Format + checksum validation of a GSTIN (15 chars, standard mod-36 check digit).
 * The PAN entity-type char (4th of PAN) is NOT restricted, so synthetic 'X' is accepted.
 */
export function isValidGstinFormat(raw: string): boolean {
  const g = normGstin(raw);
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  return g[14] === check;
}

/** Format check for Udyam numbers: UDYAM-XX-00-0000000 */
export function isValidUdyamFormat(raw: string): boolean {
  return /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(normUdyam(raw));
}

export function getGstinRegistry(): GstinRecord[] {
  return Array.from(gstinMap().values());
}
export function getUdyamRegistry(): UdyamRecord[] {
  return Array.from(udyamMap().values());
}
