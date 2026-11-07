/**
 * Runs the KYC validator over the expected extracted fields of all 12 specimen applicants (K01-K12)
 * and prints verdicts, proving the planted problems are caught.
 *
 *   npx tsx scripts/kyc-validate-specimens.ts          # summary table
 *   npx tsx scripts/kyc-validate-specimens.ts --verbose # every failing/warning check
 *
 * Exits non-zero if a verdict differs from the expected one.
 */
import { SPECIMEN_IDS, SPECIMENS, getSpecimenDocs } from "../lib/kyc/specimens";
import { validateWithRegistries } from "../lib/kyc/server";

const EXPECTED: Record<string, string> = {
  K01: "rejected", // GSTIN cancelled + Udyam number blank
  K02: "verified", // tilted GST scan but fully readable
  K03: "verified",
  K04: "needs_attention", // blurred GST certificate
  K05: "needs_attention", // no Udyam certificate
  K06: "rejected", // GSTIN fails checksum / not in registry
  K07: "needs_attention", // legal name on GST cert differs from trade name everywhere else
  K08: "verified",
  K09: "verified",
  K10: "verified",
  K11: "needs_attention", // address proof 257 days old
  K12: "verified",
};

const verbose = process.argv.includes("--verbose");
let bad = 0;
console.log("ID   Business                      Verdict          P/W/F  Problems");
for (const id of SPECIMEN_IDS) {
  const sp = getSpecimenDocs(id)!;
  const label = SPECIMENS.find((x) => x.id === id)!.label;
  const r = validateWithRegistries({ docs: sp.docs, quality: sp.quality });
  const problems = r.checks.filter((c) => c.status !== "pass");
  const ok = r.verdict === EXPECTED[id];
  if (!ok) bad++;
  console.log(
    `${id}  ${label.padEnd(28)}  ${r.verdict.padEnd(15)}  ${r.counts.pass}/${r.counts.warn}/${r.counts.fail}    ${problems.map((c) => `${c.status}:${c.id}`).join(", ") || "-"}${ok ? "" : `   <-- expected ${EXPECTED[id]}`}`,
  );
  if (verbose) for (const c of problems) console.log(`       [${c.status}] ${c.label}: ${c.message}\n              fix: ${c.fix}`);
}
if (bad) {
  console.error(`\n${bad} verdict(s) differ from expectations`);
  process.exit(1);
}
