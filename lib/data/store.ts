import { randomBytes } from "node:crypto";
import { query, queryOne, withTx } from "@/lib/db";

/**
 * Postgres-backed repository (sessions, quotes, KYC records, orders). Same helper names as the old
 * JSON store, but every call is async. KYC rows hold masked fields only.
 */

export type LangCode = "en" | "hi" | "ta" | "mr";

export interface BusinessProfile {
  businessName?: string;
  businessType?: string;
  segment?: "micro" | "prof" | "multi" | "mfg";
  city?: string;
  cityTier?: 1 | 2;
  state?: string;
  employeeCount?: number;
  numSites?: number;
  gstin?: string;
  udyamNumber?: string;
  hasGstin?: boolean;
  hasUdyam?: boolean;
  currentInternet?: string;
  monthlyTelecomSpendInr?: number;
  contactName?: string;
  contactPhone?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts: string;
}

export interface AdvisorRecommendation {
  segment: "micro" | "prof" | "multi" | "mfg";
  /** Business-type profile that produced this bundle (see lib/advisor/profiles.ts). */
  profileKey?: string;
  lines: QuoteLine[];
  optionalLines: QuoteLine[];
  /** Products the plan wanted but the profile is not eligible for, with reason codes. */
  excluded: { productId: string; reasons: string[] }[];
  /** productId -> i18n suffix for adv.why.<suffix>. */
  why?: Record<string, string>;
  monthlyTotalInr: number;
  setupTotalInr: number;
  contractMonths: number;
  createdAt: string;
}

export interface Session {
  id: string;
  /** Owner once the visitor has logged in. */
  userId?: string;
  language: LangCode;
  profile: BusinessProfile;
  messages: ChatMessage[];
  recommendedProductIds: string[];
  /** Advisor's recommended core lines (product + quantity), ready to seed /quote. */
  recommendedLines?: QuoteLine[];
  /** Full advisor recommendation snapshot (language-agnostic). */
  recommendation?: AdvisorRecommendation;
  /** Advisor slot-filling state (internal to lib/advisor). */
  advisor?: { stage: string; asked?: string; slots: Record<string, unknown> };
  /**
   * True while the session has NOT ended in an accepted quote (set true by the advisor at creation;
   * quote/order workers set false on acceptance). Back office reads this as "unclosed" data.
   */
  unclosed?: boolean;
  /** Last advisor stage reached (e.g. "businessType" ... "recommended"); useful as a drop-off point. */
  lastStage?: string;
  quoteId?: string;
  kycId?: string;
  orderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLine {
  productId: string;
  quantity: number;
}

export interface Quote {
  id: string;
  userId?: string;
  sessionId?: string;
  lines: QuoteLine[];
  monthlyTotalInr: number;
  setupTotalInr: number;
  contractMonths: number;
  status: "draft" | "accepted" | "rejected";
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type KycDocType = "gst_certificate" | "udyam_certificate" | "signatory_id" | "address_proof" | "business_registration";

export interface KycDocument {
  type: KycDocType;
  fileName: string;
  /** Path under /public or storage reference */
  url?: string;
  /** Extracted (masked) fields, as produced by the KYC worker */
  extracted?: Record<string, unknown>;
  issues?: string[];
  status: "pending" | "verified" | "flagged" | "rejected";
}

export interface KycRecord {
  id: string;
  userId?: string;
  sessionId?: string;
  quoteId?: string;
  consentGivenAt?: string;
  /** DPDP consent record (additive, written by the KYC flow). */
  consent?: {
    version: string;
    givenAt: string;
    purposes: string[];
    marketingOptIn: boolean;
    lang?: string;
    withdrawnAt?: string;
  };
  /** Latest validation outcome (masked messages only). */
  verdict?: "verified" | "needs_attention" | "rejected";
  checks?: { id: string; status: "pass" | "warn" | "fail"; label: string; message: string }[];
  /** Masked identifiers + retention schedule (no raw documents are stored). */
  summary?: Record<string, unknown>;
  eSignedAt?: string;
  documents: KycDocument[];
  status: "not_started" | "in_progress" | "verified" | "needs_review" | "rejected";
  issues: string[];
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = "quote_accepted" | "kyc_complete" | "install_scheduled" | "installing" | "activated" | "on_hold";

export interface OrderEvent {
  status: OrderStatus;
  ts: string;
  note?: string;
}

export interface Order {
  id: string;
  userId?: string;
  sessionId?: string;
  quoteId?: string;
  kycId?: string;
  status: OrderStatus;
  events: OrderEvent[];
  expectedActivationDate?: string;
  createdAt: string;
  updatedAt: string;
}


export type Collection = "sessions" | "quotes" | "kyc" | "orders";

// ---- ids ----

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function randomBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += B32[bytes[i] % 32];
  return out;
}
const PREFIX: Record<Collection, string> = { sessions: "S-", quotes: "Q-", kyc: "K-", orders: "ACC-" };
/** Non-guessable ids: prefix + 10 random base32 characters (orders: ACC-XXXXXXXXXX is the public tracking ID). */
export const newId = (c: Collection) => `${PREFIX[c]}${randomBase32(10)}`;

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);
const nowIso = () => new Date().toISOString();

// ---- sessions ----

interface SessionRow {
  id: string; user_id: string | null; language: string; unclosed: boolean; last_stage: string | null;
  quote_id: string | null; kyc_id: string | null; order_id: string | null; data: Record<string, unknown>;
  created_at: Date; updated_at: Date;
}

function toSession(r: SessionRow): Session {
  const d = r.data ?? {};
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    language: r.language as LangCode,
    unclosed: r.unclosed,
    lastStage: r.last_stage ?? undefined,
    quoteId: r.quote_id ?? undefined,
    kycId: r.kyc_id ?? undefined,
    orderId: r.order_id ?? undefined,
    profile: (d.profile as BusinessProfile) ?? {},
    messages: (d.messages as ChatMessage[]) ?? [],
    recommendedProductIds: (d.recommendedProductIds as string[]) ?? [],
    recommendedLines: d.recommendedLines as QuoteLine[] | undefined,
    recommendation: d.recommendation as AdvisorRecommendation | undefined,
    advisor: d.advisor as Session["advisor"],
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

async function saveSession(s: Session): Promise<Session> {
  const data = {
    profile: s.profile, messages: s.messages, recommendedProductIds: s.recommendedProductIds,
    recommendedLines: s.recommendedLines, recommendation: s.recommendation, advisor: s.advisor,
  };
  const row = await queryOne<SessionRow>(
    `INSERT INTO sessions (id, user_id, language, unclosed, last_stage, quote_id, kyc_id, order_id, data, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (id) DO UPDATE SET user_id=$2, language=$3, unclosed=$4, last_stage=$5, quote_id=$6, kyc_id=$7, order_id=$8, data=$9, updated_at=now()
     RETURNING *`,
    [s.id, s.userId ?? null, s.language, s.unclosed ?? true, s.lastStage ?? null, s.quoteId ?? null, s.kycId ?? null, s.orderId ?? null, JSON.stringify(data), s.createdAt],
  );
  return toSession(row!);
}

export async function createSession(init: Partial<Session> = {}): Promise<Session> {
  const t = nowIso();
  return saveSession({ id: newId("sessions"), language: "en", profile: {}, messages: [], recommendedProductIds: [], createdAt: t, updatedAt: t, ...init });
}
export async function getSession(id: string): Promise<Session | undefined> {
  const r = await queryOne<SessionRow>("SELECT * FROM sessions WHERE id = $1", [id]);
  return r ? toSession(r) : undefined;
}
export async function updateSession(id: string, patch: Partial<Session>): Promise<Session> {
  const cur = await getSession(id);
  if (!cur) throw new Error(`sessions/${id} not found`);
  return saveSession({ ...cur, ...patch, id });
}
/** Attach an anonymous advisor session to a user (no-op if it already has an owner). */
export async function attachSessionToUser(sessionId: string, userId: string, contact?: { name?: string; phone?: string; businessName?: string }): Promise<boolean> {
  const s = await getSession(sessionId);
  if (!s || (s.userId && s.userId !== userId)) return false;
  const profile = { ...s.profile };
  if (contact?.name && !profile.contactName) profile.contactName = contact.name;
  if (contact?.phone && !profile.contactPhone) profile.contactPhone = contact.phone;
  if (contact?.businessName && !profile.businessName) profile.businessName = contact.businessName;
  await saveSession({ ...s, userId, profile });
  await query(`UPDATE quotes SET user_id = $1, updated_at = now() WHERE session_id = $2 AND (user_id IS NULL OR user_id = $1)`, [userId, sessionId]);
  await query(`UPDATE kyc_records SET user_id = $1, updated_at = now() WHERE session_id = $2 AND (user_id IS NULL OR user_id = $1)`, [userId, sessionId]);
  await query(`UPDATE orders SET user_id = $1, updated_at = now() WHERE session_id = $2 AND (user_id IS NULL OR user_id = $1)`, [userId, sessionId]);
  return true;
}

/** Back office: sessions that have not ended in an accepted quote or an order, with their quote (if any). */
export async function listUnclosedSessions(): Promise<{ session: Session; quote?: Quote }[]> {
  const rows = await query<SessionRow & { q: QuoteRow | null }>(
    `SELECT s.*, to_jsonb(q) AS q FROM sessions s
     LEFT JOIN quotes q ON q.id = s.quote_id
     WHERE s.order_id IS NULL AND COALESCE(q.status, '') <> 'accepted'
     ORDER BY s.updated_at DESC LIMIT 2000`,
  );
  return rows.map((r) => ({ session: toSession(r), quote: r.q ? toQuote(normQuoteJson(r.q)) : undefined }));
}

// ---- quotes ----

interface QuoteRow {
  id: string; session_id: string | null; user_id: string | null; lines: QuoteLine[]; monthly_total_inr: string | number;
  setup_total_inr: string | number; contract_months: number; status: string; accepted_at: Date | null; created_at: Date; updated_at: Date;
}
// to_jsonb() renders timestamps as strings; normalise for toQuote.
const normQuoteJson = (r: QuoteRow): QuoteRow => ({ ...r, accepted_at: r.accepted_at ? new Date(r.accepted_at) : null, created_at: new Date(r.created_at), updated_at: new Date(r.updated_at) });

function toQuote(r: QuoteRow): Quote {
  return {
    id: r.id,
    sessionId: r.session_id ?? undefined,
    userId: r.user_id ?? undefined,
    lines: r.lines ?? [],
    monthlyTotalInr: Number(r.monthly_total_inr),
    setupTotalInr: Number(r.setup_total_inr),
    contractMonths: r.contract_months,
    status: r.status as Quote["status"],
    acceptedAt: iso(r.accepted_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

async function saveQuote(q: Quote): Promise<Quote> {
  const row = await queryOne<QuoteRow>(
    `INSERT INTO quotes (id, session_id, user_id, lines, monthly_total_inr, setup_total_inr, contract_months, status, accepted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (id) DO UPDATE SET session_id=$2, user_id=$3, lines=$4, monthly_total_inr=$5, setup_total_inr=$6, contract_months=$7, status=$8, accepted_at=$9, updated_at=now()
     RETURNING *`,
    [q.id, q.sessionId ?? null, q.userId ?? null, JSON.stringify(q.lines), q.monthlyTotalInr, q.setupTotalInr, q.contractMonths, q.status, q.acceptedAt ?? null, q.createdAt],
  );
  return toQuote(row!);
}

export async function createQuote(init: Pick<Quote, "lines" | "monthlyTotalInr" | "setupTotalInr" | "contractMonths"> & Partial<Quote>): Promise<Quote> {
  const t = nowIso();
  return saveQuote({ id: newId("quotes"), status: "draft", createdAt: t, updatedAt: t, ...init });
}
export async function getQuote(id: string): Promise<Quote | undefined> {
  const r = await queryOne<QuoteRow>("SELECT * FROM quotes WHERE id = $1", [id]);
  return r ? toQuote(r) : undefined;
}
export async function updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
  const cur = await getQuote(id);
  if (!cur) throw new Error(`quotes/${id} not found`);
  return saveQuote({ ...cur, ...patch, id });
}

// ---- KYC (masked fields only) ----

interface KycRow {
  id: string; session_id: string | null; quote_id: string | null; user_id: string | null; status: string; verdict: string | null;
  consent_given_at: Date | null; consent: KycRecord["consent"] | null; checks: KycRecord["checks"] | null; summary: KycRecord["summary"] | null;
  documents: KycDocument[]; issues: string[]; e_signed_at: Date | null; created_at: Date; updated_at: Date;
}

function toKyc(r: KycRow): KycRecord {
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    sessionId: r.session_id ?? undefined,
    quoteId: r.quote_id ?? undefined,
    consentGivenAt: iso(r.consent_given_at),
    consent: r.consent ?? undefined,
    verdict: (r.verdict as KycRecord["verdict"]) ?? undefined,
    checks: r.checks ?? undefined,
    summary: r.summary ?? undefined,
    eSignedAt: iso(r.e_signed_at),
    documents: r.documents ?? [],
    status: r.status as KycRecord["status"],
    issues: r.issues ?? [],
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

async function saveKyc(k: KycRecord): Promise<KycRecord> {
  const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
  const row = await queryOne<KycRow>(
    `INSERT INTO kyc_records (id, session_id, quote_id, user_id, status, verdict, consent_given_at, consent, checks, summary, documents, issues, e_signed_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     ON CONFLICT (id) DO UPDATE SET session_id=$2, quote_id=$3, user_id=$4, status=$5, verdict=$6, consent_given_at=$7, consent=$8, checks=$9, summary=$10, documents=$11, issues=$12, e_signed_at=$13, updated_at=now()
     RETURNING *`,
    [k.id, k.sessionId ?? null, k.quoteId ?? null, k.userId ?? null, k.status, k.verdict ?? null, k.consentGivenAt ?? null, j(k.consent), j(k.checks), j(k.summary), JSON.stringify(k.documents ?? []), JSON.stringify(k.issues ?? []), k.eSignedAt ?? null, k.createdAt],
  );
  return toKyc(row!);
}

export async function createKyc(init: Partial<KycRecord> = {}): Promise<KycRecord> {
  const t = nowIso();
  return saveKyc({ id: newId("kyc"), documents: [], status: "not_started", issues: [], createdAt: t, updatedAt: t, ...init });
}
export async function getKyc(id: string): Promise<KycRecord | undefined> {
  const r = await queryOne<KycRow>("SELECT * FROM kyc_records WHERE id = $1", [id]);
  return r ? toKyc(r) : undefined;
}
export async function updateKyc(id: string, patch: Partial<KycRecord>): Promise<KycRecord> {
  const cur = await getKyc(id);
  if (!cur) throw new Error(`kyc/${id} not found`);
  return saveKyc({ ...cur, ...patch, id });
}
export async function deleteKyc(id: string): Promise<boolean> {
  return (await query("DELETE FROM kyc_records WHERE id = $1 RETURNING id", [id])).length > 0;
}

// ---- orders ----

interface OrderRow {
  id: string; user_id: string | null; session_id: string | null; quote_id: string | null; kyc_id: string | null; status: string;
  expected: string | null; created_at: Date; updated_at: Date;
}
interface EventRow { order_id: string; status: string; note: string | null; ts: Date }

const ORDER_COLS = "id, user_id, session_id, quote_id, kyc_id, status, expected_activation_date::text AS expected, created_at, updated_at";

function toOrder(r: OrderRow, events: EventRow[]): Order {
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    sessionId: r.session_id ?? undefined,
    quoteId: r.quote_id ?? undefined,
    kycId: r.kyc_id ?? undefined,
    status: r.status as OrderStatus,
    events: events.map((e) => ({ status: e.status as OrderStatus, ts: iso(e.ts)!, note: e.note ?? undefined })),
    expectedActivationDate: r.expected ?? undefined,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

export async function createOrder(init: Partial<Order> = {}): Promise<Order> {
  const t = nowIso();
  const status = init.status ?? "quote_accepted";
  const id = init.id ?? newId("orders");
  const events = init.events ?? [{ status, ts: t }];
  await withTx(async (q) => {
    await q(
      `INSERT INTO orders (id, user_id, session_id, quote_id, kyc_id, status, expected_activation_date) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, init.userId ?? null, init.sessionId ?? null, init.quoteId ?? null, init.kycId ?? null, status, init.expectedActivationDate ?? null],
    );
    for (const e of events) await q("INSERT INTO order_events (order_id, status, note, ts) VALUES ($1,$2,$3,$4)", [id, e.status, e.note ?? null, e.ts]);
  });
  return (await getOrder(id))!;
}
export async function getOrder(id: string): Promise<Order | undefined> {
  const r = await queryOne<OrderRow>(`SELECT ${ORDER_COLS} FROM orders WHERE id = $1`, [id]);
  if (!r) return undefined;
  const ev = await query<EventRow>("SELECT order_id, status, note, ts FROM order_events WHERE order_id = $1 ORDER BY id", [id]);
  return toOrder(r, ev);
}
/** Orders owned by a user, newest first. There is deliberately no "list all orders" helper. */
export async function listOrders(userId: string, limit = 50): Promise<Order[]> {
  const rows = await query<OrderRow>(`SELECT ${ORDER_COLS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  if (!rows.length) return [];
  const ev = await query<EventRow>("SELECT order_id, status, note, ts FROM order_events WHERE order_id = ANY($1) ORDER BY id", [rows.map((r) => r.id)]);
  return rows.map((r) => toOrder(r, ev.filter((e) => e.order_id === r.id)));
}
export async function advanceOrder(id: string, status: OrderStatus, note?: string): Promise<Order> {
  const n = await query("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING id", [id, status]);
  if (!n.length) throw new Error(`orders/${id} not found`);
  await query("INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)", [id, status, note ?? null]);
  return (await getOrder(id))!;
}

// ---- users ----

export interface User {
  id: string;
  phone: string;
  name: string;
  businessName: string;
  language: LangCode;
  createdAt: string;
}

interface UserRow {
  id: string; phone: string; name: string; business_name: string; language: string; created_at: Date;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    businessName: r.business_name,
    language: (r.language as LangCode) || "en",
    createdAt: iso(r.created_at)!,
  };
}

const newUserId = () => `U-${randomBase32(10)}`;

export async function getUserById(id: string): Promise<User | undefined> {
  const r = await queryOne<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return r ? toUser(r) : undefined;
}

export async function getUserByPhone(phone: string): Promise<User | undefined> {
  const r = await queryOne<UserRow>("SELECT * FROM users WHERE phone = $1", [phone]);
  return r ? toUser(r) : undefined;
}

export async function createUser(input: { phone: string; name: string; businessName: string; language?: LangCode }): Promise<User> {
  try {
    const r = await queryOne<UserRow>(
      `INSERT INTO users (id, phone, name, business_name, language) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newUserId(), input.phone, input.name.trim(), input.businessName.trim(), input.language ?? "en"],
    );
    return toUser(r!);
  } catch (e) {
    const again = await getUserByPhone(input.phone);
    if (again) return again;
    throw e;
  }
}

// ---- otp (hashed codes only) ----

export interface OtpRow {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
}

interface OtpDb {
  id: string | number; phone: string; code_hash: string; expires_at: Date; attempts: number;
}

export async function saveOtp(phone: string, codeHash: string, ttlSec = 600): Promise<void> {
  await query("UPDATE otp_codes SET consumed_at = now() WHERE phone = $1 AND consumed_at IS NULL", [phone]);
  await query(
    "INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))",
    [phone, codeHash, ttlSec],
  );
}

export async function latestOpenOtp(phone: string): Promise<OtpRow | undefined> {
  const r = await queryOne<OtpDb>(
    `SELECT id, phone, code_hash, expires_at, attempts FROM otp_codes
     WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (!r) return undefined;
  return { id: String(r.id), phone: r.phone, codeHash: r.code_hash, expiresAt: iso(r.expires_at)!, attempts: Number(r.attempts) };
}

export async function bumpOtpAttempts(id: string): Promise<number> {
  const r = await queryOne<{ attempts: number }>("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts", [id]);
  return Number(r?.attempts ?? 0);
}

export async function consumeOtp(id: string): Promise<void> {
  await query("UPDATE otp_codes SET consumed_at = now() WHERE id = $1", [id]);
}

// ---- staff ----

export type StaffRole = "sales" | "partner" | "admin";

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  partnerId?: string;
  passwordHash: string;
}

interface StaffDb {
  id: string; email: string; name: string; password_hash: string; role: string; partner_id: string | null;
}

export async function getStaffByEmail(email: string): Promise<StaffUser | undefined> {
  const r = await queryOne<StaffDb>(
    "SELECT id, email, name, password_hash, role, partner_id FROM staff_users WHERE lower(email) = lower($1)",
    [email.trim()],
  );
  if (!r) return undefined;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as StaffRole,
    partnerId: r.partner_id ?? undefined,
    passwordHash: r.password_hash,
  };
}

// ---- assignments (back-office) ----

export interface AssignmentRecord {
  leadId: string;
  ownerType: string;
  assignee?: string;
  note?: string;
  partnerId?: string;
  assignedBy?: string;
  assignedAt: string;
}

interface AssignDb {
  lead_id: string; owner_type: string; assignee: string | null; note: string | null;
  partner_id: string | null; assigned_by: string | null; assigned_at: Date;
}

function toAssignment(r: AssignDb): AssignmentRecord {
  return {
    leadId: r.lead_id,
    ownerType: r.owner_type,
    assignee: r.assignee ?? undefined,
    note: r.note ?? undefined,
    partnerId: r.partner_id ?? undefined,
    assignedBy: r.assigned_by ?? undefined,
    assignedAt: iso(r.assigned_at)!,
  };
}

export async function listAssignments(): Promise<AssignmentRecord[]> {
  const rows = await query<AssignDb>("SELECT lead_id, owner_type, assignee, note, partner_id, assigned_by, assigned_at FROM assignments");
  return rows.map(toAssignment);
}

export async function upsertAssignment(a: Omit<AssignmentRecord, "assignedAt"> & { assignedAt?: string }): Promise<AssignmentRecord> {
  const r = await queryOne<AssignDb>(
    `INSERT INTO assignments (lead_id, owner_type, assignee, note, partner_id, assigned_by, assigned_at)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()))
     ON CONFLICT (lead_id) DO UPDATE SET
       owner_type = EXCLUDED.owner_type, assignee = EXCLUDED.assignee, note = EXCLUDED.note,
       partner_id = EXCLUDED.partner_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
     RETURNING lead_id, owner_type, assignee, note, partner_id, assigned_by, assigned_at`,
    [a.leadId, a.ownerType, a.assignee ?? null, a.note ?? null, a.partnerId ?? null, a.assignedBy ?? null, a.assignedAt ?? null],
  );
  return toAssignment(r!);
}

export async function deleteAssignment(leadId: string): Promise<void> {
  await query("DELETE FROM assignments WHERE lead_id = $1", [leadId]);
}
