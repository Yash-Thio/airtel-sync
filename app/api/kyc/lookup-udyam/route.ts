import { NextResponse } from "next/server";
import { lookupUdyam } from "@/lib/data/registries";
import { isUdyamFormat, normId } from "@/lib/kyc/identifiers";
import { klog, maskUdyam } from "@/lib/kyc/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { udyam } -> mock Udyam registry lookup. Identifier returned masked. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { udyam?: string; udyamNumber?: string } | null;
  const u = normId(body?.udyam ?? body?.udyamNumber ?? "");
  if (!u) return NextResponse.json({ error: "udyam is required" }, { status: 400 });
  const formatValid = isUdyamFormat(u);
  const rec = formatValid ? lookupUdyam(u) : null;
  klog("lookup-udyam", { udyam: maskUdyam(u), formatValid, found: !!rec });
  return NextResponse.json({
    udyamMasked: maskUdyam(u),
    formatValid,
    found: !!rec,
    status: rec ? "Active" : null,
    enterpriseName: rec?.enterprise_name ?? null,
    enterpriseType: rec?.enterprise_type ?? null,
    majorActivity: rec?.major_activity ?? null,
    nicDescription: rec?.nic_description ?? null,
    city: rec?.city ?? null,
    state: rec?.state ?? null,
    registrationDate: rec?.date_of_registration ?? null,
  });
}
