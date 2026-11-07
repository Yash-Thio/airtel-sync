/** Pure identifier validators (no fs access, safe in client or server). */

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const normId = (s: string) => s.replace(/\s+/g, "").toUpperCase();

export function gstinChecksumChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export type GstinFormatIssue = "length" | "pattern" | "checksum" | null;

/**
 * Structure + mod-36 checksum. The 4th PAN char is NOT restricted (synthetic data uses 'X'),
 * so 'X' is accepted.
 */
export function gstinFormatIssue(raw: string): GstinFormatIssue {
  const g = normId(raw);
  if (g.length !== 15) return "length";
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return "pattern";
  return gstinChecksumChar(g.slice(0, 14)) === g[14] ? null : "checksum";
}

export const isUdyamFormat = (raw: string) => /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(normId(raw));

/** Signatory ID: letters/digits/hyphens, 6-20 chars (covers specimen SYN-ID-###### and Aadhaar-like numbers). */
export const isIdNumberFormat = (raw: string) => /^[A-Z0-9][A-Z0-9 -]{5,19}$/.test(raw.trim().toUpperCase());

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
