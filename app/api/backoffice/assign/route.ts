import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth/staff";
import { assignLead, unassignLead } from "@/lib/backoffice/leads";
import type { OwnerType } from "@/lib/backoffice/propensity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNERS: OwnerType[] = ["field_sales", "channel_partner", "digital_nurture"];

/** POST { leadId, ownerType, assignee?, note?, partnerId? }. Partners cannot assign leads. DELETE ?leadId= clears. */
export async function POST(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (staff.role === "partner") return NextResponse.json({ error: "Partners cannot assign leads." }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b.leadId !== "string" || !OWNERS.includes(b.ownerType)) {
    return NextResponse.json({ error: "leadId and a valid ownerType are required" }, { status: 400 });
  }
  const a = await assignLead({
    leadId: b.leadId.slice(0, 80),
    ownerType: b.ownerType,
    assignee: typeof b.assignee === "string" ? b.assignee.slice(0, 80) : undefined,
    note: typeof b.note === "string" ? b.note.slice(0, 300) : undefined,
    partnerId: typeof b.partnerId === "string" ? b.partnerId.slice(0, 40) : undefined,
    assignedBy: staff.id,
  });
  return NextResponse.json({ assignment: a });
}

export async function DELETE(req: Request) {
  const staff = await getStaff(req);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (staff.role === "partner") return NextResponse.json({ error: "Partners cannot assign leads." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("leadId");
  if (!id) return NextResponse.json({ error: "leadId required" }, { status: 400 });
  await unassignLead(id);
  return NextResponse.json({ ok: true });
}
