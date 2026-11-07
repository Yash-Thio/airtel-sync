import { NextResponse } from "next/server";
import { applyCookie, customerCookie, publicUser } from "@/lib/auth/customer";
import { checkOtp, normalizePhone } from "@/lib/auth/otp";
import { clientIp, rateLimit } from "@/lib/db";
import { attachSessionToUser, consumeOtp, createUser, getUserByPhone, type LangCode } from "@/lib/data/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LANGS: LangCode[] = ["en", "hi", "ta", "mr"];

/**
 * POST { phone, code, name?, businessName?, language?, sessionId? }
 * Existing phone logs in. A new phone needs name and businessName (422 { needsProfile: true } if missing).
 * Sets the httpOnly customer cookie and attaches an anonymous advisor session when sessionId is sent.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    phone?: string;
    code?: string;
    name?: string;
    businessName?: string;
    language?: string;
    sessionId?: string;
  } | null;
  const phone = normalizePhone(String(body?.phone ?? ""));
  const code = String(body?.code ?? "");
  if (!phone || !/^\d{6}$/.test(code.replace(/\D/g, ""))) {
    return NextResponse.json({ error: "Enter the mobile number and the 6-digit code." }, { status: 400 });
  }
  const ip = clientIp(req);
  if (!(await rateLimit(`otp-verify:${phone}`, 8, 600)) || !(await rateLimit(`otp-verify-ip:${ip}`, 30, 600))) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }

  const outcome = await checkOtp(phone, code);
  if (outcome.status === "locked") return NextResponse.json({ error: "That code is no longer valid. Request a new one." }, { status: 400 });
  if (outcome.status !== "ok") return NextResponse.json({ error: "That code is not correct." }, { status: 400 });

  let user = await getUserByPhone(phone);
  if (!user) {
    const name = String(body?.name ?? "").trim();
    const businessName = String(body?.businessName ?? "").trim();
    if (name.length < 2 || businessName.length < 2) {
      return NextResponse.json(
        { error: "Add your name and business name to create an account.", needsProfile: true },
        { status: 422 },
      );
    }
    const language = LANGS.includes(body?.language as LangCode) ? (body?.language as LangCode) : "en";
    user = await createUser({ phone, name: name.slice(0, 80), businessName: businessName.slice(0, 120), language });
  }
  await consumeOtp(outcome.id);

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 40) : "";
  if (sessionId) await attachSessionToUser(sessionId, user.id, { name: user.name, phone: user.phone, businessName: user.businessName });

  const res = NextResponse.json({ user: publicUser(user) });
  const cookie = await customerCookie(user);
  applyCookie(res, cookie.name, cookie.value, cookie.maxAge);
  return res;
}
