import { TODAY } from "@/lib/eligibility";
import { GST_STATE_CODES, gstinFormatIssue, isIdNumberFormat, isUdyamFormat, normId } from "./identifiers";
import { maskGstin, maskUdyam } from "./mask";
import { addressSimilarity, daysBetween, extractPin, isIsoDate, nameSimilarity, splitLegalName } from "./match";
import type { CheckResult, DocSlot, ValidateDeps, ValidateInput, ValidateResult, Verdict } from "./types";

/** Address proof must be no older than this many days (vs TODAY). */
export const ADDRESS_PROOF_MAX_AGE_DAYS = 90;
const NAME_OK = 0.85;
const NAME_BAD = 0.5;

const has = (v?: string | null) => !!v && v.trim().length > 0;
const s = (v?: string | null) => (v ?? "").trim();
const containsState = (addr: string, state: string) => addr.toLowerCase().includes(state.toLowerCase());

/**
 * Pure cross-document KYC validation. Registry lookups are injected so this runs in the browser,
 * on the server and in tests. All messages are written for the applicant and never contain raw
 * identifiers (GSTIN / Udyam / ID numbers are masked).
 */
export function validateKyc(input: ValidateInput, deps: ValidateDeps, today: string = TODAY): ValidateResult {
  const { docs } = input;
  const gst = docs.gst_certificate;
  const udy = docs.udyam_certificate;
  const idd = docs.signatory_id;
  const adr = docs.address_proof;
  const checks: CheckResult[] = [];
  const add = (c: CheckResult) => checks.push(c);

  // ---- 1. Completeness ----
  const missing: DocSlot[] = [];
  if (!gst) missing.push("gst_certificate");
  if (!idd) missing.push("signatory_id");
  if (!adr) missing.push("address_proof");
  add(
    missing.length
      ? {
          id: "docs_complete", label: "Documents provided", status: "fail", slots: missing,
          message: "Some required documents are missing.",
          fix: "Upload the GST registration certificate, the signatory ID and a recent address proof (Udyam certificate is optional).",
        }
      : { id: "docs_complete", label: "Documents provided", status: "pass", message: "All required documents were provided." },
  );

  // ---- 2. Scan quality ----
  const blurry = (Object.keys(input.quality ?? {}) as DocSlot[]).filter((k) => input.quality?.[k] === "blurry");
  const skewed = (Object.keys(input.quality ?? {}) as DocSlot[]).filter((k) => input.quality?.[k] === "skewed");
  if (blurry.length) {
    add({
      id: "scan_quality", label: "Scan quality", status: "warn", slots: blurry,
      message: "One document is blurred, so the details could not be read with confidence.",
      fix: "Retake the photo in good light, hold the phone steady and keep the page flat, then upload it again. Or check every field below carefully.",
    });
  } else {
    add({
      id: "scan_quality", label: "Scan quality", status: "pass",
      message: skewed.length ? "A document was tilted but every field was readable." : "All documents were readable.",
    });
  }

  // ---- 3-5. GSTIN: format+checksum, registry, status ----
  const gstin = gst?.gstin ? normId(gst.gstin) : "";
  let gRec = null as ReturnType<ValidateDeps["lookupGstin"]>;
  let gstinOk = false;
  if (gst) {
    if (!gstin) {
      add({
        id: "gstin_format", label: "GSTIN format", status: "fail", slots: ["gst_certificate"],
        message: "The GSTIN on the certificate is blank or unreadable.",
        fix: "Type the 15-character GSTIN in the field above or upload a clearer GST certificate.",
      });
    } else {
      const issue = gstinFormatIssue(gstin);
      if (issue) {
        add({
          id: "gstin_format", label: "GSTIN format", status: "fail", blocking: true, slots: ["gst_certificate"],
          message:
            issue === "checksum"
              ? `GSTIN ${maskGstin(gstin)} has the right shape but fails the official check-digit test, so it contains a typo or is not genuine.`
              : `GSTIN ${maskGstin(gstin)} is not a valid 15-character GSTIN.`,
          fix: "Compare the number with your GST portal registration, correct it, or upload the certificate again. If it still fails, contact the GST helpdesk for a corrected certificate.",
        });
      } else {
        gstinOk = true;
        add({ id: "gstin_format", label: "GSTIN format", status: "pass", message: `GSTIN ${maskGstin(gstin)} has a valid structure and check digit.` });
      }
    }
    if (gstinOk) {
      gRec = deps.lookupGstin(gstin);
      if (!gRec) {
        add({
          id: "gstin_registry", label: "GSTIN in registry", status: "fail", blocking: true, slots: ["gst_certificate"],
          message: `GSTIN ${maskGstin(gstin)} was not found in the GST registry.`,
          fix: "Check the number against your GST portal login. If it is correct, ask the GST office for a fresh certificate before we can continue.",
        });
      } else {
        add({ id: "gstin_registry", label: "GSTIN in registry", status: "pass", message: `GSTIN ${maskGstin(gstin)} exists in the GST registry.` });
        if (gRec.status === "Active") {
          add({ id: "gstin_status", label: "GSTIN status", status: "pass", message: "Registration is Active." });
        } else {
          add({
            id: "gstin_status", label: "GSTIN status", status: "fail", blocking: true, slots: ["gst_certificate"],
            message: `This GST registration is ${gRec.status}, so it cannot be used for business-grade services.`,
            fix:
              gRec.status === "Cancelled"
                ? "Apply for revocation of cancellation on the GST portal, or provide a different active GSTIN. You can still take consumer plans without GSTIN."
                : "Ask your GST officer to lift the suspension, or provide a different active GSTIN. We can re-check as soon as the status is Active.",
          });
        }
      }
    } else if (gstin) {
      add({ id: "gstin_registry", label: "GSTIN in registry", status: "fail", blocking: true, slots: ["gst_certificate"], message: "Registry lookup skipped because the GSTIN is invalid.", fix: "Fix the GSTIN first." });
    }
  }

  // ---- 6. GSTIN state vs address state ----
  if (gst && gstinOk) {
    const stateName = GST_STATE_CODES[gstin.slice(0, 2)];
    const regState = gRec?.state;
    const addrText = s(gst.address);
    const problems: string[] = [];
    if (!stateName) problems.push("The state code in the GSTIN is not a known state.");
    else {
      if (regState && regState !== stateName) problems.push(`GSTIN state code says ${stateName} but the registry lists ${regState}.`);
      if (addrText && !containsState(addrText, stateName)) problems.push(`GSTIN state code says ${stateName} but the certificate address is in another state.`);
    }
    add(
      problems.length
        ? { id: "gstin_state", label: "GSTIN state matches address", status: "warn", slots: ["gst_certificate"], message: problems.join(" "), fix: "Check that the business address and GSTIN belong to the same state registration." }
        : { id: "gstin_state", label: "GSTIN state matches address", status: "pass", message: `GSTIN state code matches ${stateName}.` },
    );
  }

  // ---- 7. Udyam ----
  let uRec = null as ReturnType<ValidateDeps["lookupUdyam"]>;
  const udyamNo = udy?.udyam_number ? normId(udy.udyam_number) : "";
  if (!udy) {
    add(
      input.udyamDeclaredNone
        ? { id: "udyam_number", label: "Udyam registration", status: "pass", message: "You told us the business has no Udyam registration." }
        : {
            id: "udyam_number", label: "Udyam registration", status: "warn", slots: ["udyam_certificate"],
            message: "No Udyam certificate was provided.",
            fix: "Upload your Udyam certificate, or confirm below that the business has no Udyam registration. It is optional but speeds up approval.",
          },
    );
  } else if (!udyamNo) {
    add({
      id: "udyam_number", label: "Udyam registration", status: "fail", slots: ["udyam_certificate"],
      message: "The Udyam registration number is blank on the certificate, so it cannot be checked.",
      fix: "Type the Udyam number (format UDYAM-XX-00-0000000) from your Udyam portal, or upload a complete certificate.",
    });
  } else if (!isUdyamFormat(udyamNo)) {
    add({
      id: "udyam_number", label: "Udyam registration", status: "fail", blocking: true, slots: ["udyam_certificate"],
      message: `Udyam number ${maskUdyam(udyamNo)} does not follow the UDYAM-XX-00-0000000 format.`,
      fix: "Correct the number from your Udyam portal or upload the certificate again.",
    });
  } else {
    uRec = deps.lookupUdyam(udyamNo);
    add(
      uRec
        ? { id: "udyam_number", label: "Udyam registration", status: "pass", message: `Udyam number ${maskUdyam(udyamNo)} exists in the Udyam registry.` }
        : {
            id: "udyam_number", label: "Udyam registration", status: "fail", blocking: true, slots: ["udyam_certificate"],
            message: `Udyam number ${maskUdyam(udyamNo)} was not found in the Udyam registry.`,
            fix: "Check the number on the Udyam portal. If it is correct, download a fresh certificate; otherwise remove it and continue without Udyam.",
          },
    );
    if (uRec && udy.state && uRec.state && udy.state.trim().toLowerCase() !== uRec.state.toLowerCase()) {
      add({
        id: "udyam_state", label: "Udyam state", status: "warn", slots: ["udyam_certificate"],
        message: `Certificate says ${udy.state} but the registry lists ${uRec.state}.`,
        fix: "Confirm the state on the Udyam certificate or upload a clearer copy.",
      });
    }
  }

  // ---- 8. Business-name match across documents (fuzzy) ----
  const regBiz = gRec ? splitLegalName(gRec.legal_name).business : undefined;
  const gstLegal = splitLegalName(gst?.legal_name);
  const sources: { slot: DocSlot; label: string; value: string }[] = [];
  if (gst) {
    if (has(gstLegal.business)) sources.push({ slot: "gst_certificate", label: "GST certificate (legal name)", value: gstLegal.business });
    if (has(gst.trade_name)) sources.push({ slot: "gst_certificate", label: "GST certificate (trade name)", value: s(gst.trade_name) });
  }
  if (udy && has(udy.enterprise_name)) sources.push({ slot: "udyam_certificate", label: "Udyam certificate", value: s(udy.enterprise_name) });
  if (idd && has(idd.business)) sources.push({ slot: "signatory_id", label: "Signatory ID", value: s(idd.business) });
  if (adr && has(adr.billed_to)) sources.push({ slot: "address_proof", label: "Address proof", value: s(adr.billed_to) });
  if (sources.length >= 2) {
    const reference = regBiz ?? s(gst?.trade_name) ?? sources[0].value;
    const refLabel = regBiz ? "GST registry" : "GST certificate trade name";
    const bad: string[] = [];
    const badSlots = new Set<DocSlot>();
    let worst = 1;
    for (const src of sources) {
      const sim = nameSimilarity(reference, src.value);
      if (sim < NAME_OK) {
        worst = Math.min(worst, sim);
        bad.push(`${src.label} shows "${src.value}" but ${refLabel} shows "${reference}"`);
        badSlots.add(src.slot);
      }
    }
    if (uRec) {
      const sim = nameSimilarity(reference, uRec.enterprise_name);
      if (sim < NAME_OK) {
        worst = Math.min(worst, sim);
        bad.push(`Udyam registry shows "${uRec.enterprise_name}"`);
        badSlots.add("udyam_certificate");
      }
    }
    add(
      bad.length
        ? {
            id: "name_match", label: "Business name matches everywhere",
            status: worst < NAME_BAD ? "fail" : "warn", slots: Array.from(badSlots),
            message: bad.join("; ") + ".",
            fix: "Use the same business name on every document. Upload the document that carries the correct registered name, or a name-change / correction certificate.",
          }
        : { id: "name_match", label: "Business name matches everywhere", status: "pass", message: `The business name "${reference}" is consistent across ${sources.length} documents.` },
    );
  }

  // ---- 9. Signatory vs business ----
  if (idd && has(idd.name)) {
    const cons = s(gst?.constitution).toLowerCase();
    const isProp = cons.includes("proprietor") || !!gstLegal.person;
    if (isProp && gstLegal.person) {
      const sim = nameSimilarity(gstLegal.person, idd.name);
      add(
        sim >= NAME_OK
          ? { id: "signatory_match", label: "Signatory is the proprietor", status: "pass", message: "The ID name matches the proprietor named on the GST certificate." }
          : {
              id: "signatory_match", label: "Signatory is the proprietor", status: "warn", slots: ["signatory_id"],
              message: `The ID is in the name "${s(idd.name)}" but the proprietor on the GST certificate is "${gstLegal.person}".`,
              fix: "Provide the proprietor's own ID, or add an authorisation letter signed by the proprietor naming the signatory.",
            },
      );
    } else if (!isProp) {
      const d = s(idd.designation).toLowerCase();
      const ok = /(owner|partner|director|proprietor|authori[sz]ed signatory)/.test(d);
      add(
        ok
          ? { id: "signatory_match", label: "Signatory authority", status: "pass", message: `Signatory is listed as ${s(idd.designation)}.` }
          : {
              id: "signatory_match", label: "Signatory authority", status: "warn", slots: ["signatory_id"],
              message: `The signatory is a "${s(idd.designation) || "unknown role"}", which may not be authorised to sign for the business.`,
              fix: "Upload the ID of an owner, partner or director, or attach a board resolution / authorisation letter.",
            },
      );
    }
  }

  // ---- 10. ID validity ----
  if (idd) {
    const probs: string[] = [];
    let status: "pass" | "warn" | "fail" = "pass";
    if (!has(idd.id_number) || !isIdNumberFormat(s(idd.id_number))) {
      probs.push("The ID number is missing or in an unexpected format.");
      status = "fail";
    }
    if (!isIsoDate(idd.valid_till)) {
      probs.push("The expiry date is missing or unreadable.");
      status = "fail";
    } else {
      const left = daysBetween(today, s(idd.valid_till));
      if (left < 0) {
        probs.push(`The ID expired ${-left} days ago.`);
        status = "fail";
      } else if (left <= 30) {
        probs.push(`The ID expires in ${left} days.`);
        if (status === "pass") status = "warn";
      }
    }
    add(
      status === "pass"
        ? { id: "id_valid", label: "Signatory ID valid", status, message: "ID number format is fine and the ID has not expired." }
        : { id: "id_valid", label: "Signatory ID valid", status, slots: ["signatory_id"], message: probs.join(" "), fix: "Upload a current, unexpired ID with a clearly visible ID number and valid-till date." },
    );
  }

  // ---- 11. Address proof age ----
  if (adr) {
    if (!isIsoDate(adr.bill_date)) {
      add({
        id: "address_age", label: "Address proof is recent", status: "fail", slots: ["address_proof"],
        message: "The bill date is missing or unreadable.",
        fix: "Upload a utility bill or similar address proof with a clearly visible date.",
      });
    } else {
      const age = daysBetween(s(adr.bill_date), today);
      if (age < 0) {
        add({ id: "address_age", label: "Address proof is recent", status: "fail", slots: ["address_proof"], message: "The bill date is in the future.", fix: "Check the date or upload the correct bill." });
      } else if (age > ADDRESS_PROOF_MAX_AGE_DAYS) {
        add({
          id: "address_age", label: "Address proof is recent", status: "fail", slots: ["address_proof"],
          message: `The address proof is ${age} days old; we accept ${ADDRESS_PROOF_MAX_AGE_DAYS} days or less.`,
          fix: "Upload a utility bill, rent receipt or bank statement dated within the last 90 days.",
        });
      } else {
        add({ id: "address_age", label: "Address proof is recent", status: "pass", message: `Address proof is ${age} days old (limit ${ADDRESS_PROOF_MAX_AGE_DAYS}).` });
      }
    }
  }

  // ---- 12. Address match ----
  if (adr && has(adr.address)) {
    const refs: { label: string; addr: string }[] = [];
    if (gst && has(gst.address)) refs.push({ label: "GST certificate", addr: s(gst.address) });
    if (gRec && has(gRec.principal_place_of_business)) refs.push({ label: "GST registry", addr: gRec.principal_place_of_business });
    if (refs.length) {
      const bad: string[] = [];
      let hard = false;
      const pinA = extractPin(adr.address);
      for (const r of refs) {
        const pinR = extractPin(r.addr);
        const sim = addressSimilarity(adr.address, r.addr);
        if (pinA && pinR && pinA !== pinR) {
          bad.push(`PIN code differs from the ${r.label}`);
          hard = true;
        } else if (sim < NAME_OK) {
          bad.push(`address text differs from the ${r.label}`);
        }
      }
      const stateName = gstinOk ? GST_STATE_CODES[gstin.slice(0, 2)] : undefined;
      if (stateName && !containsState(s(adr.address), stateName)) {
        bad.push(`address proof is not in ${stateName}`);
        hard = true;
      }
      add(
        bad.length
          ? {
              id: "address_match", label: "Address matches GST registration", status: hard ? "fail" : "warn", slots: ["address_proof"],
              message: `The address proof does not match: ${bad.join("; ")}.`,
              fix: "Upload an address proof showing the same registered business address, or update the address on the GST portal first.",
            }
          : { id: "address_match", label: "Address matches GST registration", status: "pass", message: "Address proof matches the registered business address." },
      );
    }
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  checks.forEach((c) => counts[c.status]++);
  const verdict: Verdict = checks.some((c) => c.status === "fail" && c.blocking)
    ? "rejected"
    : counts.fail || counts.warn
      ? "needs_attention"
      : "verified";

  return {
    verdict,
    checks,
    counts,
    registry: {
      gstin: gRec ? { status: gRec.status, legalName: gRec.legal_name, state: gRec.state } : gstinOk ? null : undefined,
      udyam: uRec ? { enterpriseName: uRec.enterprise_name, state: uRec.state } : undefined,
    },
    checkedAgainst: today,
  };
}
