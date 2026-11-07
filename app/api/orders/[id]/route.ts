import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/db";
import { getOrder } from "@/lib/data/store";
import { orderView } from "@/lib/orders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACKING_ID = /^ACC-[A-Z2-7]{10}$/;

/** GET /api/orders/:id -> public status, timeline and ETA. No account required and no personal data. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await rateLimit(`track:${clientIp(req)}`, 30, 600))) {
    return NextResponse.json({ error: "Too many lookups. Please wait a few minutes." }, { status: 429 });
  }
  const id = decodeURIComponent(params.id).trim().toUpperCase();
  if (!TRACKING_ID.test(id)) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const o = await getOrder(id);
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order: await orderView(o) });
}
