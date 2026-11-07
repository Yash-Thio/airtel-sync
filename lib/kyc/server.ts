import { lookupGstin, lookupUdyam } from "@/lib/data/registries";
import { validateKyc } from "./validate";
import type { ValidateInput, ValidateResult } from "./types";

/** Server-side validation wired to the mock registries (CSV-backed). */
export const validateWithRegistries = (input: ValidateInput): ValidateResult =>
  validateKyc(input, { lookupGstin, lookupUdyam });
