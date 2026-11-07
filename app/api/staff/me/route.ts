import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ staff: null }, { status: 401 });
  return NextResponse.json({ staff: { ...staff, partnerId: staff.partnerId ?? null } });
}
