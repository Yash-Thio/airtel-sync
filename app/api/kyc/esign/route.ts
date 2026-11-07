import { NextResponse } from "next/server";
import { getKyc, updateKyc } from "@/lib/data/store";
import { DEMO_ESIGN_OTP } from "@/lib/kyc/consent";
import { klog } from "@/lib/kyc/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SIMULATED Aadhaar-style e-sign. POST { kycId, action: "send" } -> pretends to send an OTP;
 * POST { kycId, action: "verify", otp } -> accepts the demo OTP and stamps eSignedAt.
 * No real OTP is sent and nothing is signed legally; this only demonstrates the step.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kycId?: string; action?: string; otp?: string } | null;
  const rec = body?.kycId ? await getKyc(body.kycId) : undefined;
  if (!rec) return NextResponse.json({ error: "Unknown kycId" }, { status: 404 });
  if (!rec.consentGivenAt) return NextResponse.json({ error: "Consent is required first." }, { status: 403 });
  if (rec.verdict !== "verified" && rec.verdict !== "needs_attention") {
    return NextResponse.json({ error: "Documents must be validated before e-sign." }, { status: 409 });
  }
  if (body?.action === "send") {
    klog("esign-send", { kycId: rec.id });
    return NextResponse.json({ sent: true, simulated: true, demoHint: `Demo mode: enter ${DEMO_ESIGN_OTP}` });
  }
  if (body?.action === "verify") {
    if (String(body.otp ?? "").trim() !== DEMO_ESIGN_OTP) {
      return NextResponse.json({ error: "That code is not correct. Please try again." }, { status: 400 });
    }
    const t = new Date().toISOString();
    await updateKyc(rec.id, { eSignedAt: t });
    klog("esign-verify", { kycId: rec.id });
    return NextResponse.json({ signed: true, simulated: true, eSignedAt: t });
  }
  return NextResponse.json({ error: "action must be 'send' or 'verify'" }, { status: 400 });
}
