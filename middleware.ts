import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Staff-only gate for the back office. Pages redirect to /staff/login; APIs return 401.
 * The cookie is a jose JWT (STAFF_SESSION_SECRET). This file must not import `pg`.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/backoffice");
  const deny = () => {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/staff/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  };

  const token = req.cookies.get("staff_session")?.value;
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!token || !secret) return deny();
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = payload.role;
    if (payload.kind !== "staff" || (role !== "sales" && role !== "partner" && role !== "admin")) return deny();
    return NextResponse.next();
  } catch {
    return deny();
  }
}

export const config = {
  matcher: ["/backoffice", "/backoffice/:path*", "/api/backoffice/:path*"],
};
