import { TODAY } from "./eligibility";
import { getProduct } from "./data/products";
import { getQuote, type Order, type OrderStatus } from "./data/store";

export const STAGES: OrderStatus[] = ["quote_accepted", "kyc_complete", "install_scheduled", "installing", "activated"];

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Public-safe order shape: status, timeline, product install ETAs and quote totals.
 * Omits user, session, quote and KYC ids so a tracking link cannot be used to pull personal data.
 */
export async function orderView(o: Order) {
  const q = o.quoteId ? await getQuote(o.quoteId) : undefined;
  const items = (q?.lines ?? []).map((l) => {
    const p = getProduct(l.productId);
    return {
      productId: l.productId,
      name: p?.product_name ?? l.productId,
      unit: p?.unit ?? "",
      quantity: l.quantity,
      installDays: p?.typical_install_days ?? 0,
      expectedInstallDate: addDays(TODAY, p?.typical_install_days ?? 0),
    };
  });
  return {
    id: o.id,
    status: o.status,
    events: o.events.map((e) => ({ status: e.status, ts: e.ts, note: e.note })),
    expectedActivationDate: o.expectedActivationDate,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    stages: STAGES,
    items,
    quote: q ? { monthlyTotalInr: q.monthlyTotalInr, setupTotalInr: q.setupTotalInr, contractMonths: q.contractMonths } : null,
    baseDate: TODAY,
  };
}
