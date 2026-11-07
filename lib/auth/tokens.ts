import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/** Cookie names. Middleware (edge) and route handlers must use the same strings. */
export const CUSTOMER_COOKIE = "customer_session";
export const STAFF_COOKIE = "staff_session";

const CUSTOMER_TTL = "30d";
const STAFF_TTL = "12h";
export const CUSTOMER_MAX_AGE = 60 * 60 * 24 * 30;
export const STAFF_MAX_AGE = 60 * 60 * 12;

function customerKey() {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("CUSTOMER_SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

function staffKey() {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("STAFF_SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export interface CustomerClaims {
  sub: string;
  phone: string;
}

export interface StaffClaims {
  sub: string;
  email: string;
  role: "sales" | "partner" | "admin";
  partnerId?: string;
}

export async function signCustomer(c: CustomerClaims): Promise<string> {
  return new SignJWT({ kind: "customer", phone: c.phone })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(CUSTOMER_TTL)
    .sign(customerKey());
}

export async function verifyCustomerToken(token: string): Promise<CustomerClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, customerKey());
    if (payload.kind !== "customer" || !payload.sub || typeof payload.phone !== "string") return undefined;
    return { sub: payload.sub, phone: payload.phone };
  } catch {
    return undefined;
  }
}

export async function signStaff(c: StaffClaims): Promise<string> {
  const body: JWTPayload = { kind: "staff", email: c.email, role: c.role };
  if (c.partnerId) body.partnerId = c.partnerId;
  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(STAFF_TTL)
    .sign(staffKey());
}

export async function verifyStaffToken(token: string): Promise<StaffClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, staffKey());
    const role = payload.role;
    if (payload.kind !== "staff" || !payload.sub || typeof payload.email !== "string") return undefined;
    if (role !== "sales" && role !== "partner" && role !== "admin") return undefined;
    return {
      sub: payload.sub,
      email: payload.email,
      role,
      partnerId: typeof payload.partnerId === "string" ? payload.partnerId : undefined,
    };
  } catch {
    return undefined;
  }
}
