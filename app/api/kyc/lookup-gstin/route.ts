import { NextResponse } from "next/server";
import { lookupGstin } from "@/lib/data/registries";
import { GST_STATE_CODES, gstinFormatIssue, normId } from "@/lib/kyc/identifiers";
import { klog, maskGstin } from "@/lib/kyc/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { gstin } -> mock GST registry lookup (status incl. Cancelled/Suspended). Identifier returned masked. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { gstin?: string } | null;
  const gstin = normId(body?.gstin ?? "");
  if (!gstin) return NextResponse.json({ error: "gstin is required" }, { status: 400 });
  const issue = gstinFormatIssue(gstin);
  const rec = issue ? null : lookupGstin(gstin);
  klog("lookup-gstin", { gstin: maskGstin(gstin), issue, found: !!rec, status: rec?.status });
  return NextResponse.json({
    gstinMasked: maskGstin(gstin),
    formatValid: !issue,
    formatIssue: issue,
    stateFromCode: GST_STATE_CODES[gstin.slice(0, 2)] ?? null,
    found: !!rec,
    status: rec?.status ?? null,
    active: rec?.status === "Active",
    legalName: rec?.legal_name ?? null,
    tradeName: rec?.trade_name ?? null,
    constitution: rec?.constitution ?? null,
    address: rec?.principal_place_of_business ?? null,
    state: rec?.state ?? null,
    registrationDate: rec?.registration_date ?? null,
  });
}
