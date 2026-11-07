import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { latestOpenOtp, bumpOtpAttempts, saveOtp } from "@/lib/data/store";

/** Indian mobile, stored as 10 digits. Accepts 10 digits or a leading 91. */
export function normalizePhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return undefined;
  return ten;
}

/** Mock provider (default) always issues 123456. Any other OTP_PROVIDER generates a code for a future SMS gateway. */
export function issueOtpCode(): { code: string; devCode?: string } {
  const provider = process.env.OTP_PROVIDER || "mock";
  if (provider === "mock") return { code: "123456", devCode: "123456" };
  return { code: String(randomInt(0, 1_000_000)).padStart(6, "0") };
}

function pepper(): string {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  if (!s) throw new Error("CUSTOMER_SESSION_SECRET is not set");
  return s;
}

export function hashOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${pepper()}|${phone}|${code}`).digest("hex");
}

function hashEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function storeOtp(phone: string, code: string): Promise<void> {
  await saveOtp(phone, hashOtp(phone, code), 600);
}

export type OtpCheck = { status: "ok"; id: string } | { status: "invalid" } | { status: "locked" };

/**
 * Checks the latest unconsumed code without consuming it. The caller consumes the row
 * only after signup fields are present, so a new user can resubmit the same code with their name.
 * Five mismatches lock that code.
 */
export async function checkOtp(phone: string, code: string): Promise<OtpCheck> {
  const row = await latestOpenOtp(phone);
  if (!row) return { status: "invalid" };
  if (row.attempts >= 5) return { status: "locked" };
  const digits = code.replace(/\D/g, "");
  if (!hashEq(row.codeHash, hashOtp(phone, digits))) {
    const n = await bumpOtpAttempts(row.id);
    return n >= 5 ? { status: "locked" } : { status: "invalid" };
  }
  return { status: "ok", id: row.id };
}
