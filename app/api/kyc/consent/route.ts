import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/auth/customer";
import { createKyc, deleteKyc, getKyc, getQuote, updateKyc } from "@/lib/data/store";
import { CONSENT_PURPOSES, CONSENT_VERSION } from "@/lib/kyc/consent";
import { klog } from "@/lib/kyc/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { acknowledged: true, marketingOptIn?: boolean, quoteId?, lang? } -> { kycId, consent }
 * Records DPDP consent (timestamp, notice version, purposes). Required purposes: KYC + service activation.
 * Marketing is separate, optional, and false unless explicitly true.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { acknowledged?: boolean; marketingOptIn?: boolean; quoteId?: string; lang?: string }
    | null;
  if (!body?.acknowledged) return NextResponse.json({ error: "You must accept the KYC notice to continue." }, { status: 400 });
  const marketingOptIn = body.marketingOptIn === true;
  const givenAt = new Date().toISOString();
  const purposes: string[] = [CONSENT_PURPOSES.kyc, CONSENT_PURPOSES.service];
  if (marketingOptIn) purposes.push(CONSENT_PURPOSES.marketing);
  const quote = body.quoteId ? await getQuote(body.quoteId) : undefined;
  const user = await getCustomer(req);

  const rec = await createKyc({
    quoteId: quote?.id,
    sessionId: quote?.sessionId,
    userId: user?.id ?? quote?.userId,
    consentGivenAt: givenAt,
    status: "in_progress",
    consent: { version: CONSENT_VERSION, givenAt, purposes, marketingOptIn, lang: body.lang },
  });
  klog("consent", { kycId: rec.id, version: CONSENT_VERSION, purposes, quoteLinked: !!quote });
  return NextResponse.json({ kycId: rec.id, quoteId: quote?.id ?? null, quoteFound: body.quoteId ? !!quote : null, consent: rec.consent });
}

/**
 * DELETE ?kycId=... -> withdraw consent and erase. Unfinished records are deleted outright; completed
 * ones keep only the minimal statutory record (verdict + consent log) and lose documents/masked fields.
 */
export async function DELETE(req: Request) {
  const kycId = new URL(req.url).searchParams.get("kycId") ?? "";
  const rec = await getKyc(kycId);
  if (!rec) return NextResponse.json({ error: "Unknown kycId" }, { status: 404 });
  if (!rec.eSignedAt) {
    await deleteKyc(kycId);
    klog("withdraw", { kycId, mode: "deleted" });
    return NextResponse.json({ erased: true, mode: "deleted" });
  }
  await updateKyc(kycId, {
    documents: [],
    checks: [],
    issues: [],
    summary: { erasedAt: new Date().toISOString(), note: "Documents and masked fields erased on withdrawal; statutory record retained." },
    consent: rec.consent ? { ...rec.consent, withdrawnAt: new Date().toISOString() } : rec.consent,
  });
  klog("withdraw", { kycId, mode: "anonymised" });
  return NextResponse.json({ erased: true, mode: "anonymised" });
}
