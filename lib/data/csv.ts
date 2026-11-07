import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export const DATA_DIR = path.join(process.cwd(), "data");

/** Read a CSV from app/data/ into an array of string records. */
export function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

export const splitList = (v: string, sep: string | RegExp = /[;|]/): string[] =>
  v ? v.split(sep).map((s) => s.trim()).filter(Boolean) : [];

export const num = (v: string): number | null => (v === "" || v == null ? null : Number(v));
