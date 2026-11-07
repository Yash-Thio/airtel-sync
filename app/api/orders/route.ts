import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/auth/customer";
import { createOrder, getKyc, getQuote, listOrders, updateSession, getSession, type OrderEvent } from "@/lib/data/store";
import { TODAY, expectedInstallDays } from "@/lib/eligibility";
import { addDays, orderView } from "@/lib/orders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orders -> { orders } for the logged-in user only. */
export async function GET(req: Request) {
  const user = await getCustomer(req);
  if (!user) return NextResponse.json({ error: "Sign in to see your orders." }, { status: 401 });
  const orders = await listOrders(user.id, 20);
  return NextResponse.json({ orders: await Promise.all(orders.map((o) => orderView(o))) });
}

/**
 * POST /api/orders  body: { quoteId, kycId }
 * Creates an Order with timeline events. If KYC is not verified the order waits at quote_accepted.
 * Requires the customer who accepted the quote. -> 200 { orderId, order } | 400/401/404/409
 */
export async function POST(req: Request) {
  const user = await getCustomer(req);
  if (!user) return NextResponse.json({ error: "Sign in to create an order." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const quote = typeof body.quoteId === "string" ? await getQuote(body.quoteId) : undefined;
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (quote.userId && quote.userId !== user.id) return NextResponse.json({ error: "This quote belongs to another account." }, { status: 403 });
  const kyc = typeof body.kycId === "string" ? await getKyc(body.kycId) : undefined;
  if (!kyc) return NextResponse.json({ error: "KYC record not found" }, { status: 404 });

  if (kyc.verdict === "rejected" || kyc.status === "rejected" || !kyc.eSignedAt || (kyc.status !== "verified" && kyc.status !== "needs_review")) {
    return NextResponse.json({ error: "KYC must be completed (verified or under review) before an order can be created" }, { status: 409 });
  }
  if (kyc.quoteId && kyc.quoteId !== quote.id) {
    return NextResponse.json({ error: "KYC record belongs to a different quote" }, { status: 409 });
  }

  const ts = () => new Date().toISOString();
  const events: OrderEvent[] = [
    { status: "quote_accepted", ts: ts(), note: "Quote accepted" },
    { status: "quote_accepted", ts: ts(), note: "KYC submitted" },
  ];
  let status: OrderEvent["status"] = "quote_accepted";
  let expected: string | undefined;
  const days = expectedInstallDays(quote.lines.map((l) => l.productId));
  if (kyc.status === "verified") {
    status = "install_scheduled";
    expected = addDays(TODAY, days);
    events.push({ status: "kyc_complete", ts: ts(), note: "KYC verified" });
    events.push({ status: "install_scheduled", ts: ts(), note: `Install scheduled; expected by ${expected}` });
    events.push({ status: "install_scheduled", ts: ts(), note: "Activation pending" });
  } else {
    events.push({ status: "quote_accepted", ts: ts(), note: "KYC under review; installation is scheduled once verified" });
    expected = addDays(TODAY, days);
  }
  const order = await createOrder({
    userId: user.id,
    sessionId: quote.sessionId ?? kyc.sessionId,
    quoteId: quote.id,
    kycId: kyc.id,
    status,
    events,
    expectedActivationDate: expected,
  });
  const sid = order.sessionId;
  if (sid && (await getSession(sid))) await updateSession(sid, { orderId: order.id, kycId: kyc.id, userId: user.id });
  return NextResponse.json({ orderId: order.id, order: await orderView(order) });
}
