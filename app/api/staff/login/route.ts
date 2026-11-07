import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { applyCookie } from "@/lib/auth/customer";
import { STAFF_COOKIE, STAFF_MAX_AGE, signStaff } from "@/lib/auth/tokens";
import { clientIp, rateLimit } from "@/lib/db";
import { getStaffByEmail } from "@/lib/data/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A valid bcrypt hash of a throwaway string, so a missing user still takes a compare. */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  const ip = clientIp(req);
  if (!(await rateLimit(`staff-login:${ip}`, 10, 600))) {
    return NextResponse.json({ error: "Too many sign-in attempts. Wait a few minutes." }, { status: 429 });
  }
  const staff = await getStaffByEmail(email);
  const ok = await bcrypt.compare(password, staff?.passwordHash ?? DUMMY_HASH);
  if (!staff || !ok) return NextResponse.json({ error: "Email or password is not correct." }, { status: 401 });
  const token = await signStaff({ sub: staff.id, email: staff.email, role: staff.role, partnerId: staff.partnerId });
  const res = NextResponse.json({
    staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role, partnerId: staff.partnerId ?? null },
  });
  applyCookie(res, STAFF_COOKIE, token, STAFF_MAX_AGE);
  return res;
}
