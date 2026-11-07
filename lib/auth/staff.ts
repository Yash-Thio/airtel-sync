import { getStaffByEmail, type StaffRole } from "@/lib/data/store";
import { readCookie } from "./customer";
import { STAFF_COOKIE, verifyStaffToken } from "./tokens";

export interface StaffSession {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  partnerId?: string;
}

/** Staff session from the httpOnly cookie. Role and partner id come from the signed token. */
export async function getStaff(req: Request): Promise<StaffSession | undefined> {
  const token = readCookie(req, STAFF_COOKIE);
  if (!token) return undefined;
  const claims = await verifyStaffToken(token);
  if (!claims) return undefined;
  const row = await getStaffByEmail(claims.email);
  if (!row || row.id !== claims.sub) return undefined;
  return { id: row.id, email: row.email, name: row.name, role: row.role, partnerId: row.partnerId };
}
