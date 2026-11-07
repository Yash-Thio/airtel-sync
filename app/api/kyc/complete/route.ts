import { NextResponse } from "next/server";
import { getKyc, updateKyc } from "@/lib/data/store";
import { klog } from "@/lib/kyc/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { kycId } -> finalises the KYC record after consent + validation + (simulated) e-sign.
 * verified -> status "verified"; needs_attention -> "needs_review" (queued for the back office).
 * rejected cannot be completed. The caller then POSTs { quoteId, kycId } to /api/orders.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kycId?: string } | null;
  const rec = body?.kycId ? await getKyc(body.kycId) : undefined;
  if (!rec) return NextResponse.json({ error: "Unknown kycId" }, { status: 404 });
  if (!rec.consentGivenAt) return NextResponse.json({ error: "Consent is required." }, { status: 403 });
  if (!rec.verdict || rec.verdict === "rejected") {
    return NextResponse.json({ error: "These documents were rejected. Please fix the issues and re-check." }, { status: 409 });
  }
  if (!rec.eSignedAt) return NextResponse.json({ error: "Please complete the e-sign step first." }, { status: 409 });
  const status = rec.verdict === "verified" ? "verified" : "needs_review";
  const updated = await updateKyc(rec.id, { status });
  klog("complete", { kycId: rec.id, status });
  return NextResponse.json({ kycId: updated.id, status, verdict: rec.verdict, quoteId: rec.quoteId ?? null, summary: updated.summary });
}
