/**
 * Lead propensity score (0-100): "how much does this lead look like the ones that activate?"
 *
 * Transparent, additive log-odds model. Weights were fit with a lightly regularised logistic
 * regression on all 5,000 leads in smb_leads.csv (target: outcome == Activated, base rate 7.4%)
 * via scripts/fit_propensity.py, then rounded to 0.05 so a sales manager can read them.
 * Validation (in-sample, AUC ~0.73): see `scoreDeciles()`; top decile activates ~5x the bottom.
 *
 * ANALYSIS FINDINGS (scripts/analyse_leads.py) - activation rate by signal:
 *   has_gstin          Y 9.6% (n=3534)   N 2.0% (n=1466)   <- strongest signal (also needed for many products)
 *   lead_source        Referral 14.8% | Inbound call 9.5% | Channel partner 8.0% | Field sales 7.3%
 *                      | Website form 4.3% | WhatsApp campaign 2.8%  (WhatsApp/Web leads rarely get contacted: 41%/55% vs 73%)
 *   segment            Mfg 12.8% | Prof offices 11.1% | Multi-site 11.0% | Micro retail 4.1%
 *   city_tier          Tier 1 8.6%  vs  Tier 2 6.1%
 *   has_udyam          Y 8.9%  vs  N 5.6% (partly confounded with GSTIN)
 *   current_internet   Leased line 15.0% | Mixed per site 12.7% | Business BB 9.3% | Home BB 7.6% | Mobile hotspot 4.5%
 *   current_provider   Local ISP 5.4% (lowest) vs Accel / Accel mobile-only 9.1-9.2%
 *   employees          <=5: 4.6% | 6-10: 6.5% | 11-25: 10.7% | 26-50: 14.1% | 50+: 11.0%   (mostly explained by segment)
 *   turnover           <40L 3.9% | 40L-1.5cr 7.0% | 1.5-5cr 8.3% | 5-25cr 13.0% | 25-100cr 10.3%   (explained by segment/GSTIN)
 *   monthly spend      lowest half 4.3% vs top half 10-11% (explained by segment; adds no weight once segment is in)
 * Signals with NO usable lift (given the above), deliberately left out of the score:
 *   preferred_language (Hindi/English 6-8%, regional 4-9%, small n, no stable pattern), num_sites (1: 6.4%, 2+: ~11%
 *   but ~= segment), number of products_of_interest (1: 8.1%, 2: 7.2%, 3: 6.8%), created month, days-to-stage
 *   (contacted/assessed/quote timing is identical for activated and dropped leads: ~2.0 / 4.9 / 9.0 days).
 *
 * FUNNEL (stage_reached): Lead 1594 dropped | Contacted 1432 | Needs assessed 1113 | Quote accepted 273 | KYC complete 220 | Activated 368.
 * Drop reasons by stage are used for the *recommended action*, not the score (every non-activated CSV lead is by
 * definition dropped, so the score ranks which dropped leads are worth re-working):
 *   Lead:           Unreachable after 3 attempts 805, Not interested 470, Wrong/invalid number 319
 *   Contacted:      Owner had no time for a visit 531, Locked in with provider 325, Visit not scheduled by sales 296, Only wanted mobile 280
 *   Needs assessed: Price too high 414, Competitor cheaper 207, Quote too complex 206, Quote took too long 179, Decided to wait 107
 *   Quote accepted: Missing GST/Udyam doc 94, Paperwork too long 79, Signatory not available 53, Document mismatch 47
 *   KYC complete:   Installation delayed >21 days 98, Cancelled before install 53, Site not feasible 41, First payment failed 28
 */

export type OwnerType = "field_sales" | "channel_partner" | "digital_nurture";

export const OWNER_LABEL: Record<OwnerType, string> = {
  field_sales: "Field sales",
  channel_partner: "Channel partner",
  digital_nurture: "Digital nurture",
};

/** Subset of lead attributes the score understands. Anything undefined is treated as neutral ("unknown"). */
export interface ScoreInput {
  hasGstin?: boolean;
  hasUdyam?: boolean;
  cityTier?: number;
  /** Segment code or CSV label; anything other than micro is "non-micro". */
  segment?: string;
  leadSource?: string;
  currentInternet?: string;
  currentProvider?: string;
}

export interface Factor {
  key: string;
  label: string;
  /** Contribution to the 0-100 score versus an average lead (can be negative). */
  points: number;
  /** Observed activation rate for leads with this attribute (from the CSV), for explainability. */
  observed: string;
}

export interface ScoreResult {
  score: number;
  /** Expected probability this lead would have activated (logistic, ~7% average). */
  probability: number;
  factors: Factor[];
  positives: Factor[];
  negatives: Factor[];
}

const INTERCEPT = -4.2;
/** logit range reachable by the weights below: [min, max]; maps linearly to 0..100. */
const MIN_LOGIT = INTERCEPT - 1.0 - 0.35; // WhatsApp lead + local ISP
const MAX_LOGIT = INTERCEPT + 1.3 + 0.15 + 0.4 + 0.6 + 0.8 + 0.25; // GSTIN+Udyam+tier1+non-micro+referral+leased line
const PTS = 100 / (MAX_LOGIT - MIN_LOGIT);

interface Rule {
  key: string;
  label: string;
  /** Label shown when the attribute is known and false (omit to hide). */
  labelFalse?: string;
  weight: number;
  /** Share of the 5,000 CSV leads with the attribute; factor points are centred on this (vs an average lead). */
  prevalence: number;
  observed: string;
  test: (i: ScoreInput) => boolean | undefined;
}

const isMicro = (s?: string) => s === "micro" || s === "Micro retail & services";
const src = (name: string) => (i: ScoreInput) => (i.leadSource ? i.leadSource === name : undefined);

export const RULES: Rule[] = [
  { key: "gstin", label: "Holds a GSTIN", labelFalse: "No GSTIN (blocks several products)", weight: 1.3, prevalence: 0.707, observed: "9.6% activate vs 2.0% without", test: (i) => i.hasGstin },
  { key: "udyam", label: "Udyam registered", labelFalse: "Not Udyam registered", weight: 0.15, prevalence: 0.545, observed: "8.9% vs 5.6%", test: (i) => i.hasUdyam },
  { key: "tier1", label: "Tier 1 city", labelFalse: "Tier 2 city", weight: 0.4, prevalence: 0.516, observed: "8.6% vs 6.1% in tier 2", test: (i) => (i.cityTier == null ? undefined : i.cityTier === 1) },
  {
    key: "nonmicro",
    label: "Professional / multi-site / manufacturer segment",
    labelFalse: "Micro retail & services segment",
    weight: 0.6,
    prevalence: 0.458,
    observed: "11-13% vs 4.1% for micro retail",
    test: (i) => (i.segment ? !isMicro(i.segment) : undefined),
  },
  { key: "referral", label: "Referral lead", weight: 0.8, prevalence: 0.083, observed: "14.8% activate", test: src("Referral") },
  { key: "inbound", label: "Inbound call lead", weight: 0.25, prevalence: 0.101, observed: "9.5% activate", test: src("Inbound call") },
  { key: "web", label: "Website form lead", weight: -0.6, prevalence: 0.199, observed: "4.3% activate; only 55% get contacted", test: src("Website form") },
  { key: "whatsapp", label: "WhatsApp campaign lead", weight: -1.0, prevalence: 0.072, observed: "2.8% activate; only 41% get contacted", test: src("WhatsApp campaign") },
  {
    key: "leased",
    label: "Already on leased line / multi-site setup",
    weight: 0.25,
    prevalence: 0.079,
    observed: "12.7-15.0% vs 7.4% overall",
    test: (i) => (i.currentInternet ? i.currentInternet === "Leased line" || i.currentInternet === "Mixed per site" : undefined),
  },
  { key: "localisp", label: "Currently on a local ISP", weight: -0.35, prevalence: 0.208, observed: "5.4% vs 9.1% for Accel customers", test: (i) => (i.currentProvider ? i.currentProvider === "Local ISP" : undefined) },
];

export function scoreLead(input: ScoreInput): ScoreResult {
  let logit = INTERCEPT;
  const factors: Factor[] = [];
  for (const r of RULES) {
    const v = r.test(input);
    if (v === undefined) continue; // unknown: neutral, contributes nothing
    if (v) logit += r.weight;
    const points = round1(r.weight * ((v ? 1 : 0) - r.prevalence) * PTS);
    const label = v ? r.label : r.labelFalse;
    if (label && Math.abs(points) >= 0.5) factors.push({ key: r.key, label, points, observed: r.observed });
  }
  const score = Math.max(0, Math.min(100, Math.round(((logit - MIN_LOGIT) / (MAX_LOGIT - MIN_LOGIT)) * 100)));
  factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return {
    score,
    probability: 1 / (1 + Math.exp(-logit)),
    factors,
    positives: factors.filter((f) => f.points > 0).slice(0, 3),
    negatives: factors.filter((f) => f.points < 0).slice(0, 3),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Recommended next action + suggested owner
// ---------------------------------------------------------------------------------------------

export interface ActionContext {
  stage: string;
  dropReason?: string;
  score: number;
  input: ScoreInput;
  /** Days since the lead was created / last touched, if known. */
  idleDays?: number;
}

export interface Recommendation {
  action: string;
  owner: OwnerType;
  urgency: "today" | "this_week" | "nurture";
  rationale: string;
}

const HIGH = 55;
const MID = 35;

/**
 * Principles: (1) field sales get the high-value, high-propensity, tier-1 / GSTIN leads and anything where a
 * visit or signature is the blocker; (2) channel partners cover tier-2 and lower-propensity leads that still
 * need a human; (3) low-propensity or "not now" leads go to digital nurture (WhatsApp / advisor link) so
 * sales capacity is not wasted. The digital view feeds the field force, it does not replace it.
 */
export function recommend(c: ActionContext): Recommendation {
  const gst = c.input.hasGstin === true;
  const tier1 = c.input.cityTier === 1;
  const tierTxt = tier1 ? "tier 1" : c.input.cityTier === 2 ? "tier 2" : "";
  const profile = [gst ? "GSTIN holder" : c.input.hasGstin === false ? "no GSTIN" : "", tierTxt].filter(Boolean).join(" in ") || "lead";
  const where = c.dropReason ? `dropped at ${c.stage.toLowerCase()} (${c.dropReason.toLowerCase()})` : `at ${c.stage.toLowerCase()}`;
  const why = `${cap(profile)}, ${where}; propensity ${c.score}/100.`;
  const humanOwner: OwnerType = tier1 && c.score >= MID ? "field_sales" : "channel_partner";
  const r = (action: string, owner: OwnerType, urgency: Recommendation["urgency"]): Recommendation => ({ action, owner, urgency, rationale: why });
  const hi = c.score >= HIGH;
  const mid = c.score >= MID;

  switch (c.dropReason) {
    // --- dropped at Lead
    case "Unreachable after 3 attempts":
      return hi ? r("Try a different channel: WhatsApp message plus a visit drop-in", humanOwner, "this_week") : r("Nurture via WhatsApp with an advisor link; stop cold calling", "digital_nurture", "nurture");
    case "Wrong or invalid number":
      return gst ? r("Look up the number via GSTIN registry / ask referrer, then re-contact", humanOwner, "this_week") : r("Park; re-capture contact via website form or partner", "digital_nurture", "nurture");
    case "Not interested on first call":
      return hi ? r(`Call today: ${profile}, pitch a bundle rather than a single product`, humanOwner, "today") : r("Nurture via WhatsApp (case studies, short offer)", "digital_nurture", "nurture");
    // --- dropped at Contacted
    case "Visit not scheduled by sales":
      return r(`Call today and book the visit: ${profile}, lost to our own follow-up gap`, c.input.cityTier === 2 && !hi ? "channel_partner" : "field_sales", "today");
    case "Owner had no time for a visit":
      return mid ? r("Offer a 10-minute digital advisor session on WhatsApp, then a short visit only if needed", "digital_nurture", "this_week") : r("Nurture via WhatsApp with the self-serve advisor link", "digital_nurture", "nurture");
    case "Only wanted a mobile plan":
      return r("Nurture via WhatsApp: mobile plan upsell to broadband bundle at renewal", "digital_nurture", "nurture");
    case "Locked in with current provider":
      return mid ? r("Calendar a contract-end reminder; route to channel partner for local follow-up", "channel_partner", "nurture") : r("Nurture via WhatsApp; revisit at contract end", "digital_nurture", "nurture");
    // --- dropped at Needs assessed
    case "Price too high":
    case "Competitor offered cheaper plan":
      return hi ? r(`Call today: ${profile}; re-quote a leaner bundle / match competitor`, humanOwner, "today") : mid ? r("Send a right-sized cheaper bundle; partner to follow up", "channel_partner", "this_week") : r("Nurture via WhatsApp with entry-level bundle", "digital_nurture", "nurture");
    case "Quote too complex to understand":
      return r("Re-send a one-page quote in the owner's language via the advisor; walk through on a call if score is high", hi ? humanOwner : "digital_nurture", hi ? "today" : "this_week");
    case "Quote took too long to arrive":
      return r(`Call today with an instant quote from the advisor: ${profile}`, hi ? humanOwner : "channel_partner", "today");
    case "Decided to wait":
      return r("Nurture via WhatsApp; check back in 30 days", "digital_nurture", "nurture");
    // --- dropped at Quote accepted
    case "Missing GST or Udyam document":
      return r("Assist KYC: help the owner find / obtain the document and upload via Smart KYC", c.input.cityTier === 2 ? "channel_partner" : "field_sales", "today");
    case "Document details did not match":
      return r("Call today: fix name / address mismatch with the owner and re-run Smart KYC", humanOwner, "today");
    case "Found paperwork too long":
      return r("Offer assisted KYC (partner collects documents on site, owner only signs)", "channel_partner", "this_week");
    case "Authorised signatory not available":
      return r("Schedule a visit when the signatory is present", humanOwner, "this_week");
    // --- dropped at KYC complete
    case "Installation delayed beyond 21 days":
      return r("Escalate to operations; give the customer a firm install date and call them back", "field_sales", "today");
    case "Customer cancelled before install":
      return hi ? r(`Call today: ${profile}, win back with install-date commitment`, "field_sales", "today") : r("Call this week to understand the cancellation; partner win-back", "channel_partner", "this_week");
    case "Site not feasible for fibre":
      return r("Offer wireless / 5G fixed alternative; partner to survey", "channel_partner", "this_week");
    case "First payment failed":
      return r("Send a fresh payment link on WhatsApp and confirm by call", "digital_nurture", "today");
  }

  // --- No drop reason: in-app / open lead
  if (c.stage === "Advisor in progress") {
    return hi ? r("Call today: customer is mid-advice in the app; help them to a quote", humanOwner, "today") : r("Send a WhatsApp reminder to resume the advisor", "digital_nurture", "this_week");
  }
  if (c.stage === "Quote shared") {
    return hi ? r("Call today: quote drafted but not accepted", humanOwner, "today") : r("Nudge via WhatsApp to review the quote; offer a call", "digital_nurture", "this_week");
  }
  return mid ? r("Follow up this week", humanOwner, "this_week") : r("Nurture via WhatsApp", "digital_nurture", "nurture");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------
// Validation helper: deciles of score vs actual activation (all 5,000 CSV leads)
// ---------------------------------------------------------------------------------------------

export interface DecileRow {
  decile: number; // 1 = lowest scores, 10 = highest
  n: number;
  minScore: number;
  maxScore: number;
  activated: number;
  activationRate: number;
  avgPredicted: number;
}

/** Rank-based deciles (ties broken by stable order) so each bucket has ~equal size. */
export function scoreDeciles(rows: { score: number; probability: number; activated: boolean }[]): DecileRow[] {
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const out: DecileRow[] = [];
  for (let d = 0; d < 10; d++) {
    const chunk = sorted.slice(Math.floor((d * sorted.length) / 10), Math.floor(((d + 1) * sorted.length) / 10));
    if (!chunk.length) continue;
    const act = chunk.filter((c) => c.activated).length;
    out.push({
      decile: d + 1,
      n: chunk.length,
      minScore: chunk[0].score,
      maxScore: chunk[chunk.length - 1].score,
      activated: act,
      activationRate: act / chunk.length,
      avgPredicted: chunk.reduce((s, c) => s + c.probability, 0) / chunk.length,
    });
  }
  return out;
}
