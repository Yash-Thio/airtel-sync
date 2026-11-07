import { NextResponse } from "next/server";
import { getKyc, updateKyc } from "@/lib/data/store";
import { klog } from "@/lib/kyc/mask";
import { buildDocuments, buildSummary } from "@/lib/kyc/persist";
import { validateWithRegistries } from "@/lib/kyc/server";
import type { DocSlot, ExtractedDocs, ScanQuality } from "@/lib/kyc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  docs?: ExtractedDocs;
  quality?: Partial<Record<DocSlot, ScanQuality>>;
  udyamDeclaredNone?: boolean;
  /** Optional: persist the (masked) outcome on this KYC record. */
  kycId?: string;
  /** Optional document references (file name / public specimen url) for the record. */
  refs?: Partial<Record<DocSlot, { fileName: string; url?: string }>>;
}

/**
 * POST { docs, quality?, udyamDeclaredNone?, kycId?, refs? } -> { verdict, checks[], counts, registry }.
 * Each check: { id, label, status: pass|warn|fail, message, fix?, blocking?, slots? }.
 * When kycId is given, only masked fields + verdict are stored (no raw identifiers, no images).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.docs || typeof body.docs !== "object") return NextResponse.json({ error: "docs is required" }, { status: 400 });

  const result = validateWithRegistries({ docs: body.docs, quality: body.quality, udyamDeclaredNone: body.udyamDeclaredNone });

  if (body.kycId) {
    const rec = await getKyc(body.kycId);
    if (!rec) return NextResponse.json({ error: "Unknown kycId" }, { status: 404 });
    if (!rec.consentGivenAt) return NextResponse.json({ error: "Consent is required before verification." }, { status: 403 });
    const nowIso = new Date().toISOString();
    await updateKyc(rec.id, {
      documents: buildDocuments(body.docs, result, body.refs),
      status: result.verdict === "verified" ? "in_progress" : result.verdict === "rejected" ? "rejected" : "needs_review",
      verdict: result.verdict,
      checks: result.checks.map((c) => ({ id: c.id, status: c.status, label: c.label, message: c.message })),
      issues: result.checks.filter((c) => c.status !== "pass").map((c) => c.message),
      summary: buildSummary(body.docs, result, nowIso),
    });
  }

  klog("validate", { kycId: body.kycId, verdict: result.verdict, counts: result.counts, failing: result.checks.filter((c) => c.status !== "pass").map((c) => c.id) });
  return NextResponse.json(result);
}
