/** Masking helpers. Use these for anything shown in UI or written to logs. */

const clean = (s: string) => s.replace(/\s+/g, "");

/** Keep first `head` and last `tail` characters; mask the rest. */
export function maskMiddle(value: string | null | undefined, head: number, tail: number): string {
  if (!value) return "";
  const v = clean(value);
  if (v.length <= head + tail) return "*".repeat(v.length);
  return v.slice(0, head) + "*".repeat(v.length - head - tail) + v.slice(v.length - tail);
}

/** 37IHKXV5167L1ZS -> 37*********1ZS */
export const maskGstin = (g?: string | null) => maskMiddle(g, 2, 3);

/** PAN embedded in a GSTIN (chars 3-12), masked: IH******L-like -> IH*******  */
export function maskPanFromGstin(g?: string | null): string {
  if (!g) return "";
  const pan = clean(g).slice(2, 12);
  return pan.length === 10 ? maskMiddle(pan, 2, 1) : "";
}

/** UDYAM-WB-00-5053330 -> UDYAM-WB-00-****330 */
export function maskUdyam(u?: string | null): string {
  if (!u) return "";
  const v = clean(u);
  const m = /^(.*-)(\d+)$/.exec(v);
  if (!m) return maskMiddle(v, 2, 2);
  return m[1] + "*".repeat(Math.max(0, m[2].length - 3)) + m[2].slice(-3);
}

/** SYN-ID-346190 / Aadhaar-like 1234 5678 9012 -> last 3 only. */
export function maskIdNumber(v?: string | null): string {
  if (!v) return "";
  const s = clean(v);
  const m = /^(.*?)(\d+)$/.exec(s);
  if (!m) return maskMiddle(s, 0, 3);
  return m[1] + "*".repeat(Math.max(0, m[2].length - 3)) + m[2].slice(-3);
}

/** Consumer number: keep last 3. */
export const maskConsumerNo = (v?: string | null) => maskMiddle(v, 0, 3);

/** Mask any known identifier patterns inside free text (for logs). */
export function scrubText(text: string): string {
  return text
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, (m) => maskGstin(m))
    .replace(/\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b/g, (m) => maskUdyam(m))
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, (m) => maskMiddle(m, 2, 1))
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, (m) => maskMiddle(m, 0, 3));
}

/** Server-side logger that scrubs identifiers. Never log raw field values. */
export function klog(event: string, data?: Record<string, unknown>) {
  const safe = data ? scrubText(JSON.stringify(data)) : "";
  // eslint-disable-next-line no-console
  console.log(`[kyc] ${event}${safe ? " " + safe : ""}`);
}
