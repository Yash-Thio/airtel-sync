/**
 * AI provider: Groq (OpenAI-compatible chat completions API), server-side only.
 *
 * - GROQ_API_KEY missing, or any call fails / rate-limits  ->  deterministic fallback
 *   (the caller-supplied `fallback`, or a safe generic default). Never throws.
 * - Env: GROQ_API_KEY, GROQ_CHAT_MODEL, GROQ_VISION_MODEL (see .env.example).
 * - Do not import from client components (key must stay on the server).
 */

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_CHAT_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export type AiSource = "groq" | "fallback";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Ask for a JSON object (response_format json_object). Prompt must mention "JSON". */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Override model (defaults to GROQ_CHAT_MODEL). */
  model?: string;
  /**
   * Deterministic rule-based path, used when no key is set or the API call fails.
   * Return a string, or an object (will be JSON-stringified into `text` and set on `json`).
   */
  fallback?: () => string | object | Promise<string | object>;
}

export interface ChatResult {
  /** Raw assistant text (JSON string when json mode). */
  text: string;
  /** Parsed JSON when `json: true` and parsing succeeded. */
  json?: unknown;
  source: AiSource;
  model?: string;
  /** Why the fallback was used (no key, http status, timeout...). Contains no secrets. */
  fallbackReason?: string;
}

export interface ExtractRequest {
  /** Raw image bytes... */
  image?: Buffer | Uint8Array;
  /** ...or an already base64-encoded image (no data: prefix)... */
  imageBase64?: string;
  /** ...or a full data URI. One of image / imageBase64 / dataUri is required. */
  dataUri?: string;
  /** e.g. image/png, image/jpeg. Default image/png. */
  mimeType?: string;
  /** Document kind hint, e.g. "gst_certificate", "udyam_certificate", "signatory_id", "address_proof". */
  docType?: string;
  /** Field names to extract, e.g. ["legal_name","gstin","address","date"]. */
  fields?: string[];
  /** Extra instructions appended to the prompt. */
  instructions?: string;
  /** Override model (defaults to GROQ_VISION_MODEL). */
  model?: string;
  /** Deterministic fallback, e.g. filename/manual-entry based. Default: empty fields + needsManualReview. */
  fallback?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface ExtractResult {
  /** Extracted key/value fields (null for unreadable fields). */
  fields: Record<string, unknown>;
  /** Model-reported observations (blur, cropped, tampering suspicion...), if any. */
  notes?: string[];
  /** True when fallback was used or the model flagged low legibility; route to manual review. */
  needsManualReview: boolean;
  source: AiSource;
  model?: string;
  fallbackReason?: string;
}

export interface ProviderInfo {
  enabled: boolean;
  provider: "groq";
  chatModel: string;
  visionModel: string;
}

const env = () => ({
  key: process.env.GROQ_API_KEY?.trim() || "",
  chatModel: process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
  visionModel: process.env.GROQ_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
});

/** True if GROQ_API_KEY is configured (real mode). */
export function isAiEnabled(): boolean {
  return !!env().key;
}

export function getProviderInfo(): ProviderInfo {
  const e = env();
  return { enabled: !!e.key, provider: "groq", chatModel: e.chatModel, visionModel: e.visionModel };
}

/** Best-effort JSON parse that tolerates code fences / leading prose. */
export function parseJsonLoose(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fallthrough */
      }
    }
  }
  return undefined;
}

type GroqContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string | GroqContentPart[];
}

class GroqError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGroq(opts: {
  model: string;
  messages: GroqMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { key } = env();
  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });

  let lastErr = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.length) return content;
        lastErr = "empty response";
        break;
      }
      lastErr = `http ${res.status}`;
      // Retry once on rate limit / transient server errors with a short wait.
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 3) * 1000 : 800);
        continue;
      }
      break;
    } catch (e) {
      lastErr = e instanceof Error && e.name !== "Error" ? e.name : "network error";
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
    }
  }
  throw new GroqError(lastErr);
}

/**
 * Chat completion. Falls back to `req.fallback()` (or a generic default) when GROQ_API_KEY is
 * missing or the call fails. Never throws.
 */
export async function chat(req: ChatRequest): Promise<ChatResult> {
  const e = env();
  const runFallback = async (reason: string): Promise<ChatResult> => {
    const fb = req.fallback ? await req.fallback() : "Sorry, the assistant is unavailable right now. Please try again shortly.";
    if (typeof fb === "string") {
      return { text: fb, json: req.json ? parseJsonLoose(fb) : undefined, source: "fallback", fallbackReason: reason };
    }
    return { text: JSON.stringify(fb), json: fb, source: "fallback", fallbackReason: reason };
  };

  if (!e.key) return runFallback("GROQ_API_KEY not set");
  const model = req.model || e.chatModel;
  try {
    const text = await callGroq({
      model,
      messages: req.messages,
      json: req.json,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
    });
    if (req.json) {
      const parsed = parseJsonLoose(text);
      if (parsed === undefined) return runFallback("invalid JSON from model");
      return { text, json: parsed, source: "groq", model };
    }
    return { text, source: "groq", model };
  } catch (err) {
    return runFallback(err instanceof Error ? err.message : "error");
  }
}

function toDataUri(req: ExtractRequest): string | null {
  if (req.dataUri) return req.dataUri;
  const mime = req.mimeType || "image/png";
  if (req.imageBase64) return `data:${mime};base64,${req.imageBase64}`;
  if (req.image) return `data:${mime};base64,${Buffer.from(req.image).toString("base64")}`;
  return null;
}

/**
 * Vision extraction of document fields (JSON mode, image sent as base64 data URI).
 * Falls back to `req.fallback()` / empty fields + needsManualReview when no key or on failure.
 * This only extracts; validation (registry match, expiry, mismatch checks) is the caller's job.
 */
export async function extractDocument(req: ExtractRequest): Promise<ExtractResult> {
  const e = env();
  const runFallback = async (reason: string): Promise<ExtractResult> => {
    const fields = req.fallback ? await req.fallback() : {};
    return { fields, needsManualReview: true, source: "fallback", fallbackReason: reason };
  };

  if (!e.key) return runFallback("GROQ_API_KEY not set");
  const uri = toDataUri(req);
  if (!uri) return runFallback("no image supplied");

  const model = req.model || e.visionModel;
  const fieldList = req.fields?.length ? req.fields.join(", ") : "all clearly visible key fields";
  const prompt =
    `You are extracting data from an Indian business KYC document${req.docType ? ` of type "${req.docType}"` : ""}. ` +
    `Return ONLY a JSON object: {"fields": {<field>: <string or null>}, "legible": <true|false>, "notes": [<short observations such as blur, cropping, missing stamp, inconsistent fonts>]}. ` +
    `Extract these fields exactly as printed (use null if absent or unreadable; never guess): ${fieldList}. ` +
    `Use ISO dates (YYYY-MM-DD) where a date is printed. ${req.instructions ?? ""}`;

  try {
    const text = await callGroq({
      model,
      json: true,
      temperature: 0,
      maxTokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: uri } },
          ],
        },
      ],
    });
    const parsed = parseJsonLoose(text) as
      | { fields?: Record<string, unknown>; legible?: boolean; notes?: unknown[] }
      | undefined;
    if (!parsed || typeof parsed !== "object") return runFallback("invalid JSON from model");
    const fields = parsed.fields && typeof parsed.fields === "object" ? parsed.fields : (parsed as Record<string, unknown>);
    return {
      fields,
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : undefined,
      needsManualReview: parsed.legible === false,
      source: "groq",
      model,
    };
  } catch (err) {
    return runFallback(err instanceof Error ? err.message : "error");
  }
}
