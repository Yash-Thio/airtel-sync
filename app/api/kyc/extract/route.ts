import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { extractDocument } from "@/lib/ai/provider";
import { klog } from "@/lib/kyc/mask";
import { maskFields } from "@/lib/kyc/persist";
import { specimenFields } from "@/lib/kyc/specimens";
import { DOC_FIELDS, DOC_SLOTS, SENSITIVE_FIELDS, type DocSlot, type Fields, type ScanQuality } from "@/lib/kyc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST multipart/form-data { image: File, docType }.
 * The file is processed in memory only; nothing is written to disk. Response includes the extracted
 * fields (for the applicant to confirm/edit), a masked copy for display, scan quality and the source.
 *
 * Source order: known specimen file name (K##_<docType>.png) -> deterministic table;
 * otherwise Groq vision (extractDocument); if that is unavailable/illegible -> empty fields with
 * needsManualReview=true so the applicant types/confirms the values.
 * Set KYC_VISION_FOR_SPECIMENS=1 to send specimen images to Groq vision as well.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data with 'image' and 'docType'." }, { status: 400 });
  }
  const docType = String(form.get("docType") ?? "") as DocSlot;
  const file = form.get("image");
  if (!DOC_SLOTS.includes(docType)) return NextResponse.json({ error: `docType must be one of ${DOC_SLOTS.join(", ")}` }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 8 MB." }, { status: 413 });
  const mime = file.type || "image/png";
  if (!mime.startsWith("image/")) return NextResponse.json({ error: "Please upload a photo or image (PNG, JPG, WEBP)." }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const docRef = "doc-" + createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const spec = specimenFields(file.name);
  const specMatches = spec && file.name.toLowerCase().includes(docType);

  let fields: Fields = {};
  let source: "specimen" | "groq" | "fallback" | "manual" = "manual";
  let needsManualReview = true;
  let quality: ScanQuality = "ok";
  let notes: string[] = [];
  let fallbackReason: string | undefined;

  if (specMatches && process.env.KYC_VISION_FOR_SPECIMENS !== "1") {
    fields = spec.fields;
    quality = spec.quality;
    source = "specimen";
    needsManualReview = false;
    if (quality === "blurry") notes = ["The scan is blurry; please check every field carefully."];
    if (quality === "skewed") notes = ["The page is tilted but readable."];
  } else {
    const r = await extractDocument({
      image: bytes,
      mimeType: mime,
      docType,
      fields: DOC_FIELDS[docType],
      instructions:
        "For GSTIN use 15 characters, for Udyam use UDYAM-XX-00-0000000. Put addresses on one line. Return amounts and unit counts as digits only.",
      fallback: () => (specMatches ? spec.fields : {}),
    });
    const raw = r.fields as Record<string, unknown>;
    for (const k of DOC_FIELDS[docType]) fields[k] = raw[k] == null || raw[k] === "" ? null : String(raw[k]);
    notes = r.notes ?? [];
    fallbackReason = r.fallbackReason;
    if (r.source === "groq") {
      source = "groq";
      needsManualReview = r.needsManualReview;
      if (r.needsManualReview) quality = "blurry";
    } else if (specMatches) {
      source = "fallback";
      quality = spec.quality;
      needsManualReview = false;
    } else {
      source = "manual";
      needsManualReview = true;
      notes = ["We could not read this file automatically. Please type or confirm the details below."];
    }
  }

  // Server logs: no raw values, only masked previews and metadata.
  const m = maskFields(docType, fields);
  klog("extract", {
    docType, source, bytes: bytes.length, docRef,
    ids: Object.fromEntries(SENSITIVE_FIELDS[docType].map((k) => [k, m[k]])),
  });

  return NextResponse.json({
    docType,
    docRef,
    source,
    quality,
    needsManualReview,
    notes,
    fallbackReason,
    fields,
    masked: m,
  });
}
