import { NextResponse } from "next/server";
import { handleMessage } from "@/lib/advisor/engine";
import type { LangCode } from "@/lib/data/store";

export const dynamic = "force-dynamic";

const LANGS: LangCode[] = ["en", "hi", "ta", "mr"];

/**
 * POST { sessionId?, text?, lang?, init? }
 *  - no sessionId + no text  -> start a new session (greeting + first question)
 *  - sessionId + init:true   -> resume (returns history, chips, recommendation)
 *  - text                    -> next turn
 */
export async function POST(req: Request) {
  let body: { sessionId?: string; text?: string; lang?: string; init?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lang = LANGS.includes(body.lang as LangCode) ? (body.lang as LangCode) : "en";
  try {
    const res = await handleMessage({
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      text: typeof body.text === "string" ? body.text : undefined,
      lang,
      init: !!body.init,
    });
    return NextResponse.json(res);
  } catch (e) {
    console.error("advisor error", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Advisor failed" }, { status: 500 });
  }
}
