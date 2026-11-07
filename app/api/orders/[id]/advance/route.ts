import { NextResponse } from "next/server";
import { advanceOrder, getKyc, getOrder, updateKyc, type OrderStatus } from "@/lib/data/store";
import { STAGES, orderView } from "@/lib/orders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTE: Record<OrderStatus, string> = {
  quote_accepted: "Quote accepted",
  kyc_complete: "KYC verified (demo)",
  install_scheduled: "Install scheduled (demo)",
  installing: "Technician on site, installing (demo)",
  activated: "Service activated (demo)",
  on_hold: "On hold",
};

/** POST /api/orders/:id/advance (demo only) -> moves to next stage. { order } | 409 if already activated */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id).trim().toUpperCase();
  const o = await getOrder(id);
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const i = STAGES.indexOf(o.status);
  if (i === STAGES.length - 1) return NextResponse.json({ error: "Already activated" }, { status: 409 });
  const next = STAGES[Math.max(0, i) + 1];
  // Demo: the manual KYC review passes when the order moves past it.
  if (next === "kyc_complete" && o.kycId) {
    const kyc = await getKyc(o.kycId);
    if (kyc?.status === "needs_review") await updateKyc(o.kycId, { status: "verified" });
  }
  return NextResponse.json({ order: await orderView(await advanceOrder(id, next, NOTE[next])) });
}
