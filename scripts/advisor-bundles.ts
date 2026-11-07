/**
 * Prints advisor bundles for the business-type catalogue and checks the rules.
 *
 *   npx tsx scripts/advisor-bundles.ts
 *
 * Exits non-zero if a salon is offered a firewall / 300 Mbps / SD-WAN, if a
 * manufacturer loses leased line + IoT + firewall, or if a price band is missed.
 * The Groq call is forced onto the no-key fallback so the check stays deterministic.
 */
import { translate } from "../lib/i18n";
import "../lib/advisor/strings";
import { getProduct } from "../lib/data/products";
import { computeQuote } from "../lib/eligibility";
import { buildProfilePlan, classifyProfileRule, PROFILE_KEYS, type ProfileKey, type SizeContext } from "../lib/advisor/profiles";
import { recommend, type RecInput, type RecResult } from "../lib/advisor/recommend";
import { applyReviewDecision, buildReviewedRecommendation } from "../lib/advisor/llm";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const ids = (rec: RecResult, which: "lines" | "optionalLines" | "all" = "all") => {
  const core = rec.lines.map((l) => l.productId);
  const opt = rec.optionalLines.map((l) => l.productId);
  return which === "lines" ? core : which === "optionalLines" ? opt : [...core, ...opt];
};
const has = (rec: RecResult, id: string) => ids(rec).includes(id);

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error(`FAIL  ${msg}`);
  }
}

interface Row {
  business: string;
  employees: number;
  numSites?: number;
  hasGstin?: boolean;
  currentInternet?: string;
  band?: "micro" | "prof";
}

const rows: Row[] = [
  { business: "Salon", employees: 4, band: "micro" },
  { business: "Kirana store", employees: 3, band: "micro" },
  { business: "Pharmacy", employees: 4, band: "micro" },
  { business: "Cafe", employees: 8, band: "micro" },
  { business: "Dental clinic", employees: 6, band: "prof" },
  { business: "Coaching centre", employees: 5, band: "prof" },
  { business: "CA firm", employees: 8, band: "prof" },
  { business: "Boutique", employees: 4, band: "micro" },
  { business: "Guesthouse", employees: 6, band: "micro" },
  { business: "Plastic moulding unit", employees: 40 },
  { business: "Logistics fleet", employees: 8, band: "micro" },
  { business: "xyzzy", employees: 4, band: "micro" },
];

function inputFor(row: Row, over: Partial<RecInput> = {}): RecInput {
  return {
    businessType: row.business,
    employees: row.employees,
    numSites: row.numSites ?? 1,
    cityTier: 1,
    hasGstin: row.hasGstin ?? true,
    currentInternet: row.currentInternet ?? "Business broadband",
    ...over,
  };
}

console.log("\nBusiness                  Profile            Core bundle                                     Monthly");
console.log("------------------------- ------------------ ----------------------------------------------- ----------");

const results = new Map<string, RecResult>();
for (const row of rows) {
  const rec = recommend(inputFor(row));
  results.set(row.business, rec);
  const monthly = computeQuote(rec.lines).monthlyTotalInr;
  const core = rec.lines.map((l) => `${l.productId}×${l.quantity}`).join(" ");
  const name = row.business === "xyzzy" ? "Unspecified shop" : row.business;
  console.log(
    `${name.padEnd(25)} ${rec.profileKey.padEnd(18)} ${core.padEnd(47)} ${inr(monthly).padStart(10)}`,
  );
  if (row.band === "micro") assert(monthly >= 2000 && monthly <= 2800, `${name} monthly ${monthly} outside micro ~2.0-2.8k`);
  if (row.band === "prof") assert(monthly >= 4000 && monthly <= 5500, `${name} monthly ${monthly} outside prof ~4-5.5k`);
  for (const id of ids(rec)) assert(!!getProduct(id), `${name} invented product ${id}`);
}

console.log("");

const salon = results.get("Salon")!;
for (const banned of ["P21", "P02", "P03", "P10", "P05", "P06", "P24"]) {
  assert(!has(salon, banned), `salon includes ${banned}`);
}
assert(ids(salon, "lines").includes("P15"), "salon with GSTIN missing core P15");
assert(has(salon, "P22"), "salon missing P22 guest Wi-Fi");
assert(ids(salon, "lines").includes("P01"), "salon on broadband should get Fibre 100");
assert(ids(salon, "lines").includes("P07"), "salon missing mobile");

const parlour = recommend(inputFor({ business: "beauty parlor", employees: 4 }, { currentInternet: "None" }));
assert(parlour.profileKey === "salon", `beauty parlor classified as ${parlour.profileKey}`);
assert(ids(parlour, "lines").includes("P04"), "parlour with no fibre should get AirFiber");
assert(!has(parlour, "P02") && !has(parlour, "P21"), "parlour got fibre 300 or a firewall");

const salonNoGst = recommend(inputFor({ business: "Salon", employees: 4 }, { hasGstin: false }));
const p15 = salonNoGst.excluded.find((x) => x.productId === "P15");
assert(!ids(salonNoGst, "lines").includes("P15"), "salon without GSTIN still has WhatsApp in core");
assert(!!p15 && p15.reasons.includes("gstin"), "salon without GSTIN should explain that WhatsApp needs GST");

for (const word of ["parlour", "parlor", "beauty parlor", "beauty parlour", "salon", "spa", "Salon"]) {
  assert(classifyProfileRule(word) === "salon", `"${word}" -> ${classifyProfileRule(word)}, expected salon`);
}
assert(classifyProfileRule("I run a beauty parlor in Pune") === "salon", "sentence with beauty parlor");
assert(classifyProfileRule("Dental clinic") === "clinic", "dental clinic");
assert(classifyProfileRule("Diagnostic lab") === "clinic", "diagnostic lab");
assert(classifyProfileRule("Kirana store") === "kirana", "kirana");
assert(classifyProfileRule("Pharmacy") === "pharmacy", "pharmacy");
assert(classifyProfileRule("Restaurant chain") === "restaurant", "restaurant chain");
assert(classifyProfileRule("CA firm") === "professional", "CA firm");
assert(classifyProfileRule("Law office") === "professional", "law office");
assert(classifyProfileRule("Furniture workshop") === "manufacturer", "workshop");
assert(classifyProfileRule("Budget hotel group") === "hotel", "hotel group");
assert(classifyProfileRule("xyzzy", "micro") === "fallback_micro", "unknown -> fallback_micro");

const bigSalon = recommend(inputFor({ business: "busy salon", employees: 30 }));
assert(!has(bigSalon, "P02") && !has(bigSalon, "P03") && !has(bigSalon, "P21"), "large salon was offered fibre 300 or a firewall");

const mfg = results.get("Plastic moulding unit")!;
assert(mfg.profileKey === "manufacturer", `manufacturer profile is ${mfg.profileKey}`);
assert(ids(mfg, "lines").some((id) => id === "P05" || id === "P06"), "manufacturer missing leased line");
assert(ids(mfg, "lines").includes("P24"), "manufacturer missing IoT");
assert(ids(mfg, "lines").includes("P21"), "manufacturer missing firewall");

const bigOffice = recommend(inputFor({ business: "CA firm", employees: 20 }));
assert(ids(bigOffice, "lines").includes("P02"), "20-person office should step up to Fibre 300");

const poisoned = applyReviewDecision(salon, { promote: ["P21", "P99", "NOT_A_PRODUCT"], remove: ["P01"], demote: [] });
assert(ids(poisoned, "lines").join() === ids(salon, "lines").join(), "review invented or removed the only connection");
assert(!has(poisoned, "P21"), "review added a firewall to a salon");

const nudged = applyReviewDecision(salon, { promote: ["P22"], demote: ["P15"], remove: ["P07"] });
assert(ids(nudged, "lines").includes("P22"), "review did not promote allowed optional P22");
assert(ids(nudged, "optionalLines").includes("P15"), "review did not demote P15");
assert(!ids(nudged, "lines").includes("P07"), "review did not remove P07");
assert(!has(nudged, "P21"), "nudged salon gained a firewall");

const whyKeys = new Set<string>();
const sweep: SizeContext = { employees: 40, numSites: 3, hasGstin: true, currentInternet: "None", businessType: "high footfall" };
const wired: SizeContext = { ...sweep, currentInternet: "Business broadband", numSites: 1 };
for (const key of PROFILE_KEYS) {
  for (const ctx of [sweep, wired]) {
    const plan = buildProfilePlan(key as ProfileKey, ctx);
    for (const item of [...plan.core, ...plan.optional]) {
      whyKeys.add(item.why);
      for (const w of Object.values(item.whyById ?? {})) whyKeys.add(w);
    }
  }
}
for (const key of Array.from(whyKeys)) {
  const en = translate("en", `adv.why.${key}`);
  const hi = translate("hi", `adv.why.${key}`);
  const ta = translate("ta", `adv.why.${key}`);
  const mr = translate("mr", `adv.why.${key}`);
  assert(en !== `adv.why.${key}`, `missing English adv.why.${key}`);
  assert(/[\u0900-\u097F]/.test(hi), `Hindi missing for adv.why.${key}`);
  assert(/[\u0B80-\u0BFF]/.test(ta), `Tamil missing for adv.why.${key}`);
  assert(/[\u0900-\u097F]/.test(mr), `Marathi missing for adv.why.${key}`);
}

async function main() {
  const prevKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const reviewed = await buildReviewedRecommendation(inputFor(rows[0]));
    assert(
      reviewed.lines.map((l) => `${l.productId}×${l.quantity}`).join() === salon.lines.map((l) => `${l.productId}×${l.quantity}`).join(),
      "no-key Groq path changed the salon bundle",
    );
    assert(reviewed.profileKey === "salon", "no-key classifier missed salon");
  } finally {
    if (prevKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = prevKey;
  }

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log(`All checks passed (${rows.length} bundles, ${whyKeys.size} reason keys).`);
}

main();
