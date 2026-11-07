import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/auth/customer";
import { createQuote, createSession, getSession, updateSession } from "@/lib/data/store";
import { buildQuote, cleanLines, sessionLines, toEligibilityProfile } from "@/lib/quote-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/quote/accept  body: { sessionId?, profile?, lines: [{productId, quantity}] }
 * Requires a logged-in customer. Validates, persists an accepted Quote, links it to the session.
 * -> 200 { quoteId, sessionId, redirect, totals } | 400 { error, issues } | 401 { loginRequired }
 */
export async function POST(req: Request) {
  const user = await getCustomer(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to accept this quote.", loginRequired: true }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  let sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const sess = await sessionLines(sessionId);
  const profile = { ...(sess.profile ?? {}), ...(body.profile ?? {}) };
  const lines = cleanLines(body.lines);
  if (!lines.length) return NextResponse.json({ error: "Select at least one product", issues: [] }, { status: 400 });
  const { totals, validation } = buildQuote(toEligibilityProfile(profile), lines);
  if (!validation.valid || totals.lines.length !== lines.length) {
    return NextResponse.json({ error: "Bundle is not valid", issues: validation.issues }, { status: 400 });
  }
  const existing = sessionId ? await getSession(sessionId) : undefined;
  if (existing?.userId && existing.userId !== user.id) {
    return NextResponse.json({ error: "This quote belongs to another account." }, { status: 403 });
  }
  if (!existing) {
    sessionId = (await createSession({ profile, userId: user.id, language: user.language })).id;
  } else {
    await updateSession(sessionId!, { profile, userId: user.id });
  }
  const now = new Date().toISOString();
  const quote = await createQuote({
    sessionId,
    userId: user.id,
    lines,
    monthlyTotalInr: totals.monthlyTotalInr,
    setupTotalInr: totals.setupTotalInr,
    contractMonths: totals.contractMonths,
    status: "accepted",
    acceptedAt: now,
  });
  await updateSession(sessionId!, { quoteId: quote.id, unclosed: false, userId: user.id });
  return NextResponse.json({ quoteId: quote.id, sessionId, redirect: `/kyc?quote=${quote.id}`, totals });
}
