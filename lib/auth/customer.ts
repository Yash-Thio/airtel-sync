import { NextResponse } from "next/server";
import { getUserById, type User } from "@/lib/data/store";
import { CUSTOMER_COOKIE, CUSTOMER_MAX_AGE, signCustomer, verifyCustomerToken } from "./tokens";

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return part.slice(i + 1).trim();
    }
  }
  return undefined;
}

export function applyCookie(res: NextResponse, name: string, value: string, maxAge: number) {
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Logged-in customer, or undefined. Never throws for a missing or bad cookie. */
export async function getCustomer(req: Request): Promise<User | undefined> {
  const token = readCookie(req, CUSTOMER_COOKIE);
  if (!token) return undefined;
  const claims = await verifyCustomerToken(token);
  if (!claims) return undefined;
  return getUserById(claims.sub);
}

export async function customerCookie(user: User): Promise<{ name: string; value: string; maxAge: number }> {
  const value = await signCustomer({ sub: user.id, phone: user.phone });
  return { name: CUSTOMER_COOKIE, value, maxAge: CUSTOMER_MAX_AGE };
}

export function publicUser(u: User) {
  return { id: u.id, phone: u.phone, name: u.name, businessName: u.businessName, language: u.language };
}
