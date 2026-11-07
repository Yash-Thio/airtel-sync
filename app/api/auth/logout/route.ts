import { NextResponse } from "next/server";
import { clearCookie } from "@/lib/auth/customer";
import { CUSTOMER_COOKIE } from "@/lib/auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearCookie(res, CUSTOMER_COOKIE);
  return res;
}
