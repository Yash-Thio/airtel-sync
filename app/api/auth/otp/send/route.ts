import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/db";
import { issueOtpCode, normalizePhone, storeOtp } from "@/lib/auth/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { phone } -> { sent: true, devCode? } | 400 | 429. The code is stored as a hash. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  const ip = clientIp(req);
  if (!(await rateLimit(`otp-send:${phone}`, 5, 600)) || !(await rateLimit(`otp-send-ip:${ip}`, 20, 600))) {
    return NextResponse.json({ error: "Too many codes requested. Wait a few minutes and try again." }, { status: 429 });
  }
  const issued = issueOtpCode();
  await storeOtp(phone, issued.code);
  return NextResponse.json({ sent: true, ...(issued.devCode ? { devCode: issued.devCode } : {}) });
}
