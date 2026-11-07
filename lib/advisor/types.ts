import type { AiSource } from "@/lib/ai/provider";

export interface Chip {
  label: string;
  /** Sent to the API as the user's text. */
  value: string;
}

export interface ViewLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceInr: number;
  monthlyInr: number;
  setupInr: number;
  why: string;
}

export interface RecommendationView {
  segment: string;
  segmentLabel: string;
  lines: ViewLine[];
  optional: ViewLine[];
  excluded: { productId: string; name: string; reason: string }[];
  monthlyTotalInr: number;
  monthlyMinInr: number;
  monthlyMaxInr: number;
  setupTotalInr: number;
  contractMonths: number;
}

export interface AdvisorResponse {
  sessionId: string;
  reply: string;
  stage: string;
  chips: Chip[];
  done: boolean;
  ai: AiSource;
  recommendation?: RecommendationView;
  quoteUrl?: string;
  /** Present only on resume (init with an existing sessionId). */
  history?: { role: "user" | "assistant"; content: string }[];
}

