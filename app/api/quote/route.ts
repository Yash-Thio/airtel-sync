import { NextResponse } from "next/server";
import { buildQuote, catalogue, cleanLines, sessionLines, toEligibilityProfile } from "@/lib/quote-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/quote  body: { sessionId?, profile?, lines?: [{productId, quantity}] }
 * Profile defaults to the session profile; lines default to the session's recommended lines.
 * -> { sessionFound, language, profile, eligibilityProfile, lines, catalogue[], totals, validation }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const sess = await sessionLines(sessionId);
  if (sessionId && !sess.profile) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const profile = { ...(sess.profile ?? {}), ...(body.profile ?? {}) };
  const lines = Array.isArray(body.lines) ? cleanLines(body.lines) : sess.lines;
  const ep = toEligibilityProfile(profile);
  const cat = catalogue(ep);
  const { totals, validation } = buildQuote(ep, lines);
  return NextResponse.json({
    sessionFound: !!sess.profile,
    language: sess.language,
    profile,
    eligibilityProfile: ep,
    lines,
    catalogue: cat,
    totals,
    validation,
  });
}
