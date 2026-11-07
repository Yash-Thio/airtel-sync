/** Fuzzy matching helpers for names and addresses (pure). */

const SUFFIXES = new Set(["llp", "pvt", "ltd", "private", "limited", "co", "company", "and", "the"]);

export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t))
    .join(" ");
}

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

/** 0..1 similarity of two names (suffix/punctuation insensitive). */
export function nameSimilarity(a?: string | null, b?: string | null): number {
  const x = normName(a ?? "");
  const y = normName(b ?? "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const charSim = 1 - lev(x, y) / Math.max(x.length, y.length);
  return Math.max(charSim, jaccard(x.split(" "), y.split(" ")));
}

/** "Neha Kaur (Prop. Vindhya Tours & Travels)" -> business "Vindhya Tours & Travels", person "Neha Kaur". */
export function splitLegalName(legal?: string | null): { person?: string; business: string } {
  const l = (legal ?? "").trim();
  const m = /^(.*?)\s*\(\s*Prop\.?\s*(.+?)\s*\)\s*$/i.exec(l);
  return m ? { person: m[1].trim(), business: m[2].trim() } : { business: l };
}

export const extractPin = (addr?: string | null): string | null => (/\b(\d{6})\b/.exec(addr ?? "") ?? [])[1] ?? null;

export function normAddress(s?: string | null): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function addressSimilarity(a?: string | null, b?: string | null): number {
  const x = normAddress(a);
  const y = normAddress(b);
  if (!x.length || !y.length) return 0;
  return jaccard(x, y);
}

/** Whole days from ISO date a to ISO date b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export const isIsoDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
