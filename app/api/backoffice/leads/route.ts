import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth/staff";
import { getKpis, getValidation, queryLeads } from "@/lib/backoffice/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/backoffice/leads. Partners only receive leads assigned to their partner id. */
export async function GET(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const s = (k: string) => sp.get(k) || undefined;
  const n = (k: string) => {
    const v = sp.get(k);
    return v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  };
  const result = await queryLeads(
    {
      stage: s("stage"),
      segment: s("segment"),
      source: s("source"),
      language: s("language"),
      gstin: s("gstin"),
      dropReason: s("dropReason"),
      minScore: n("minScore"),
      q: s("q"),
      sort: s("sort"),
      limit: n("limit"),
      offset: n("offset"),
    },
    { role: staff.role, partnerId: staff.partnerId },
  );
  const withMeta = sp.get("meta") !== "0";
  return NextResponse.json({
    ...result,
    ...(withMeta ? { kpis: await getKpis(), validation: getValidation() } : {}),
  });
}
