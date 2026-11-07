import type { SegmentCode } from "@/lib/data/types";

/**
 * Business-type catalogue for the advisor.
 * Each profile picks a right-sized connection, then core / optional / never products,
 * with a quantity rule and a business-specific adv.why.* suffix.
 * Fibre 300 (P02) is only a candidate when size, sites, spend or footfall justify it.
 * Eligibility (tier, employees, sites, GSTIN) and requires_one_of are applied later.
 */

export type ProfileKey =
  | "salon"
  | "kirana"
  | "pharmacy"
  | "restaurant"
  | "clinic"
  | "coaching"
  | "professional"
  | "retail"
  | "hotel"
  | "manufacturer"
  | "logistics"
  | "fallback_micro"
  | "fallback_prof"
  | "fallback_multi"
  | "fallback_mfg";

export const PROFILE_KEYS: ProfileKey[] = [
  "salon",
  "kirana",
  "pharmacy",
  "restaurant",
  "clinic",
  "coaching",
  "professional",
  "retail",
  "hotel",
  "manufacturer",
  "logistics",
  "fallback_micro",
  "fallback_prof",
  "fallback_multi",
  "fallback_mfg",
];

export const PROFILE_LABEL: Record<ProfileKey, string> = {
  salon: "Salon / parlour",
  kirana: "Kirana / grocery",
  pharmacy: "Pharmacy",
  restaurant: "Restaurant / cafe",
  clinic: "Clinic / dental",
  coaching: "Coaching",
  professional: "CA / law / consulting",
  retail: "Retail shop",
  hotel: "Hotel / guesthouse",
  manufacturer: "Manufacturer / workshop",
  logistics: "Logistics / fleet",
  fallback_micro: "Small shop (general)",
  fallback_prof: "Professional office (general)",
  fallback_multi: "Multi-site (general)",
  fallback_mfg: "Manufacturer (general)",
};

const PROFILE_SEGMENT: Record<ProfileKey, SegmentCode> = {
  salon: "micro",
  kirana: "micro",
  pharmacy: "micro",
  restaurant: "micro",
  clinic: "prof",
  coaching: "prof",
  professional: "prof",
  retail: "micro",
  hotel: "micro",
  manufacturer: "mfg",
  logistics: "micro",
  fallback_micro: "micro",
  fallback_prof: "prof",
  fallback_multi: "multi",
  fallback_mfg: "mfg",
};

export function isProfileKey(v: string): v is ProfileKey {
  return (PROFILE_KEYS as string[]).includes(v);
}

export function isSpecificProfile(key: ProfileKey): boolean {
  return !key.startsWith("fallback_");
}

/** Label shown on the quote (multi-site when a non-factory runs 3+ locations). */
export function segmentFor(key: ProfileKey, numSites: number): SegmentCode {
  const base = PROFILE_SEGMENT[key];
  if (base === "mfg") return "mfg";
  if (base === "multi") return "multi";
  if (numSites >= 3) return "multi";
  return base;
}

export interface SizeContext {
  businessType?: string;
  employees: number;
  numSites: number;
  hasGstin: boolean;
  currentInternet?: string;
  monthlySpend?: number;
}

export interface PlannedItem {
  ids: string[];
  qty: number;
  /** adv.why.<why> suffix used for the chosen product. */
  why: string;
  whyById?: Record<string, string>;
}

export interface ProfilePlan {
  key: ProfileKey;
  segment: SegmentCode;
  core: PlannedItem[];
  optional: PlannedItem[];
  /** Never offered, even if a model review asks for them. */
  never: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n)));
const sitesOf = (r: SizeContext) => Math.max(1, Math.floor(r.numSites || 1));
const seats = (r: SizeContext) => clamp(r.employees || 1, 1, 6);
const devices = (r: SizeContext) => clamp(r.employees || 1, 1, 6);

/** Busy-shop language, used only to prefer a stable line over plug-and-play 5G. */
export function footfallHint(text?: string): boolean {
  return /high\s*footfall|heavy\s*footfall|busy\s*(shop|salon|store|hour|street)|crowded|lots of customers|heavy rush|बहुत भीड़|भारी भीड़|கூட்டம் அதிகம்|गर्दी जास्त/i.test(
    text ?? "",
  );
}

/**
 * 300 Mbps only when headcount, site count, current spend or footfall would make 100 Mbps tight.
 * Callers that pass allow300: false (salon) never see P02.
 */
export function fibre300Justified(r: SizeContext): boolean {
  if ((r.employees || 0) >= 15) return true;
  if ((r.numSites || 1) >= 3 && (r.employees || 0) >= 8) return true;
  if ((r.monthlySpend ?? 0) >= 4000 && (r.employees || 0) >= 8) return true;
  if (footfallHint(r.businessType) && (r.employees || 0) >= 10) return true;
  return false;
}

function noWiredLine(r: SizeContext): boolean {
  const net = (r.currentInternet ?? "").trim().toLowerCase();
  return !net || net === "none" || net === "mobile hotspot";
}

export function connectivityIds(r: SizeContext, opts: { allow300?: boolean; preferFibre?: boolean }): string[] {
  const airFirst = noWiredLine(r) && !opts.preferFibre && !footfallHint(r.businessType);
  if (opts.allow300 && fibre300Justified(r) && !airFirst) return ["P02", "P01", "P04"];
  return airFirst ? ["P04", "P01"] : ["P01", "P04"];
}

function item(ids: string[], qty: number, why: string, whyById?: Record<string, string>): PlannedItem {
  return whyById ? { ids, qty: Math.max(1, qty), why, whyById } : { ids, qty: Math.max(1, qty), why };
}

function link(r: SizeContext, why: string, airWhy: string, opts: { allow300?: boolean; preferFibre?: boolean }): PlannedItem {
  return item(connectivityIds(r, opts), sitesOf(r), why, { P04: airWhy, P02: why });
}

/** Leased line for a real plant; fibre only when the leased products are not eligible. */
function mfgLink(r: SizeContext): PlannedItem {
  const ids =
    r.employees >= 60
      ? ["P06", "P05", "P02", "P01"]
      : r.employees >= 10
        ? fibre300Justified(r)
          ? ["P05", "P02", "P01", "P04"]
          : ["P05", "P01", "P04"]
        : connectivityIds(r, { allow300: true, preferFibre: true });
  return item(ids, sitesOf(r), "mfg.connectivity", { P04: "mfg.air", P05: "mfg.leased", P06: "mfg.leased", P02: "mfg.connectivity" });
}

/** Gigabit, leased lines, SD-WAN, managed firewall, machine IoT. */
const HEAVY = ["P03", "P05", "P06", "P10", "P21", "P24"];

function shopNever(extra: string[] = []): string[] {
  return [...HEAVY, "P25", ...extra];
}

function salon(): (r: SizeContext) => ProfilePlan {
  return (r) => ({
    key: "salon",
    segment: segmentFor("salon", r.numSites),
    // Fibre 100 or AirFiber only. Never 300/1G, firewall, SD-WAN, leased lines, IoT, fleet.
    never: ["P02", "P03", "P05", "P06", "P10", "P21", "P24", "P25"],
    core: [
      link(r, "salon.connectivity", "salon.air", { allow300: false }),
      item(["P07"], 1, "salon.mobile"),
      item(["P15"], 1, "salon.whatsapp"),
    ],
    optional: [
      item(["P22"], sitesOf(r), "salon.wifi"),
      item(["P19"], sitesOf(r), "salon.pos"),
      item(["P23"], clamp(2 * sitesOf(r), 1, 4), "salon.cctv"),
    ],
  });
}

function kirana(r: SizeContext): ProfilePlan {
  return {
    key: "kirana",
    segment: segmentFor("kirana", r.numSites),
    never: shopNever(),
    core: [
      link(r, "kirana.connectivity", "kirana.air", { allow300: true }),
      item(["P19"], sitesOf(r), "kirana.pos"),
      item(["P07"], 1, "kirana.mobile"),
    ],
    optional: [
      item(["P23"], clamp(2 * sitesOf(r), 1, 4), "kirana.cctv"),
      item(["P15"], 1, "kirana.whatsapp"),
      item(["P22"], sitesOf(r), "kirana.wifi"),
    ],
  };
}

function pharmacy(r: SizeContext): ProfilePlan {
  const opt: PlannedItem[] = [
    item(["P23"], clamp(2 * sitesOf(r), 1, 4), "pharmacy.cctv"),
    item(["P15"], 1, "pharmacy.whatsapp"),
    item(["P17"], 1, "pharmacy.cloudbackup"),
  ];
  if (r.numSites >= 2) opt.push(item(["P09"], sitesOf(r), "backup"));
  return {
    key: "pharmacy",
    segment: segmentFor("pharmacy", r.numSites),
    never: shopNever(),
    core: [
      link(r, "pharmacy.connectivity", "pharmacy.air", { allow300: true, preferFibre: true }),
      item(["P19"], sitesOf(r), "pharmacy.pos"),
      item(["P07"], 1, "pharmacy.mobile"),
    ],
    optional: opt,
  };
}

function restaurant(r: SizeContext): ProfilePlan {
  return {
    key: "restaurant",
    segment: segmentFor("restaurant", r.numSites),
    never: shopNever(),
    core: [
      link(r, "restaurant.connectivity", "restaurant.air", { allow300: true, preferFibre: true }),
      item(["P22"], sitesOf(r), "restaurant.wifi"),
      item(["P19"], sitesOf(r), "restaurant.pos"),
      item(["P07"], 1, "restaurant.mobile"),
    ],
    optional: [
      item(["P23"], clamp(2 * sitesOf(r), 1, 6), "restaurant.cctv"),
      item(["P09"], sitesOf(r), "restaurant.failover"),
      item(["P15"], 1, "restaurant.whatsapp"),
    ],
  };
}

function clinic(r: SizeContext): ProfilePlan {
  return {
    key: "clinic",
    segment: segmentFor("clinic", r.numSites),
    never: shopNever(),
    core: [
      link(r, "clinic.connectivity", "clinic.air", { allow300: true, preferFibre: true }),
      item(["P16"], seats(r), "clinic.email"),
      item(["P17"], 1, "clinic.cloudbackup"),
      item(["P20"], devices(r), "clinic.security"),
      item(["P15"], 1, "clinic.whatsapp"),
      item(["P07"], 1, "clinic.mobile"),
    ],
    optional: [
      item(["P12"], 1, "clinic.telephony"),
      item(["P22"], sitesOf(r), "clinic.wifi"),
      item(["P23"], clamp(2 * sitesOf(r), 1, 4), "clinic.cctv"),
    ],
  };
}

function coaching(r: SizeContext): ProfilePlan {
  return {
    key: "coaching",
    segment: segmentFor("coaching", r.numSites),
    never: shopNever(),
    core: [
      link(r, "coaching.connectivity", "coaching.air", { allow300: true, preferFibre: true }),
      item(["P22"], sitesOf(r), "coaching.wifi"),
      item(["P16"], seats(r), "coaching.email"),
      item(["P15"], 1, "coaching.whatsapp"),
      item(["P07"], 1, "coaching.mobile"),
      item(["P20"], devices(r), "coaching.security"),
    ],
    optional: [
      item(["P18"], 1, "coaching.website"),
      item(["P17"], 1, "coaching.cloudbackup"),
      item(["P23"], clamp(sitesOf(r), 1, 4), "coaching.cctv"),
    ],
  };
}

function professional(r: SizeContext, key: ProfileKey = "professional"): ProfilePlan {
  const opt: PlannedItem[] = [
    item(["P11"], 1, "prof.static"),
    item(["P15"], 1, "prof.whatsapp"),
    item(["P22"], sitesOf(r), "prof.wifi"),
    item(["P18"], 1, "prof.website"),
  ];
  if (r.numSites >= 3 && r.employees >= 10) opt.push(item(["P10"], sitesOf(r), "prof.sdwan"));
  return {
    key,
    segment: segmentFor(key, r.numSites),
    never: ["P03", "P05", "P06", "P21", "P24", "P25"],
    core: [
      link(r, "prof.connectivity", "prof.air", { allow300: true, preferFibre: true }),
      item(["P16"], seats(r), "prof.email"),
      item(["P12"], clamp(Math.ceil((r.employees || 1) / 25), 1, 2), "prof.telephony"),
      item(["P20"], devices(r), "prof.security"),
      item(["P17"], 1, "prof.cloudbackup"),
      item(["P07"], 1, "prof.mobile"),
    ],
    optional: opt,
  };
}

function retail(r: SizeContext): ProfilePlan {
  const opt: PlannedItem[] = [
    item(["P15"], 1, "retail.whatsapp"),
    item(["P23"], clamp(2 * sitesOf(r), 1, 6), "retail.cctv"),
    item(["P22"], sitesOf(r), "retail.wifi"),
  ];
  if (r.numSites >= 2) opt.push(item(["P09"], sitesOf(r), "backup"));
  return {
    key: "retail",
    segment: segmentFor("retail", r.numSites),
    never: shopNever(),
    core: [
      link(r, "retail.connectivity", "retail.air", { allow300: true }),
      item(["P19"], sitesOf(r), "retail.pos"),
      item(["P07"], 1, "retail.mobile"),
    ],
    optional: opt,
  };
}

function hotel(r: SizeContext): ProfilePlan {
  return {
    key: "hotel",
    segment: segmentFor("hotel", r.numSites),
    never: shopNever(),
    core: [
      link(r, "hotel.connectivity", "hotel.air", { allow300: true, preferFibre: true }),
      item(["P22"], sitesOf(r), "hotel.wifi"),
      item(["P23"], clamp(2 * sitesOf(r), 2, 6), "hotel.cctv"),
      item(["P07"], 1, "hotel.mobile"),
    ],
    optional: [
      item(["P12"], 1, "hotel.telephony"),
      item(["P09"], sitesOf(r), "hotel.failover"),
      item(["P19"], sitesOf(r), "hotel.pos"),
      item(["P15"], 1, "hotel.whatsapp"),
    ],
  };
}

function manufacturer(r: SizeContext, key: ProfileKey = "manufacturer"): ProfilePlan {
  const opt: PlannedItem[] = [
    item(["P17"], 1, "mfg.cloudbackup"),
    item(["P20"], clamp(Math.ceil((r.employees || 1) / 5), 1, 8), "mfg.security"),
    item(["P16"], seats(r), "mfg.email"),
  ];
  if (r.numSites >= 3 && r.employees >= 10) opt.push(item(["P10"], sitesOf(r), "mfg.sdwan"));
  return {
    key,
    segment: "mfg",
    never: ["P03"],
    core: [
      mfgLink(r),
      item(["P24"], clamp(Math.ceil((r.employees || 1) / 15), 2, 6), "mfg.iot"),
      item(["P21"], sitesOf(r), "mfg.firewall"),
      item(["P07"], clamp(Math.ceil((r.employees || 1) / 15), 1, 4), "mfg.mobile"),
    ],
    optional: opt,
  };
}

function logistics(r: SizeContext): ProfilePlan {
  const units = clamp(Math.max(1, Math.ceil((r.employees || 1) / 6)), 1, 4);
  return {
    key: "logistics",
    segment: segmentFor("logistics", r.numSites),
    never: [...HEAVY],
    core: [
      link(r, "logistics.connectivity", "logistics.air", { allow300: true, preferFibre: true }),
      item(["P25"], units, "logistics.tracker"),
      item(["P07"], units, "logistics.mobile"),
    ],
    optional: [
      item(["P15"], 1, "logistics.whatsapp"),
      item(["P23"], clamp(2 * sitesOf(r), 1, 4), "logistics.cctv"),
    ],
  };
}

function fallbackMicro(r: SizeContext): ProfilePlan {
  return {
    key: "fallback_micro",
    segment: segmentFor("fallback_micro", r.numSites),
    never: shopNever(),
    core: [
      link(r, "connectivity", "connectivityAir", { allow300: true }),
      item(["P07"], 1, "mobile"),
      item(["P19"], sitesOf(r), "pos"),
    ],
    optional: [
      item(["P15"], 1, "whatsapp"),
      item(["P22"], sitesOf(r), "wifi"),
      item(["P23"], clamp(2 * sitesOf(r), 1, 4), "cctv"),
    ],
  };
}

function fallbackMulti(r: SizeContext): ProfilePlan {
  const opt: PlannedItem[] = [
    item(["P22"], sitesOf(r), "wifi"),
    item(["P23"], clamp(sitesOf(r), 1, 6), "cctv"),
    item(["P20"], devices(r), "security"),
  ];
  if (r.numSites >= 3 && r.employees >= 10) opt.push(item(["P10"], sitesOf(r), "sdwan"));
  if (r.employees >= 10) opt.push(item(["P21"], sitesOf(r), "firewall"));
  return {
    key: "fallback_multi",
    segment: "multi",
    never: ["P03", "P06", "P24", "P25"],
    core: [
      link(r, "connectivity", "connectivityAir", { allow300: true, preferFibre: true }),
      item(["P09"], sitesOf(r), "backup"),
      item(["P19"], sitesOf(r), "pos"),
      item(["P07"], clamp(Math.max(sitesOf(r), Math.ceil((r.employees || 1) / 8)), 1, 4), "mobile"),
    ],
    optional: opt,
  };
}

const BUILDERS: Record<ProfileKey, (r: SizeContext) => ProfilePlan> = {
  salon: salon(),
  kirana,
  pharmacy,
  restaurant,
  clinic,
  coaching,
  professional: (r) => professional(r, "professional"),
  retail,
  hotel,
  manufacturer: (r) => manufacturer(r, "manufacturer"),
  logistics,
  fallback_micro: fallbackMicro,
  fallback_prof: (r) => professional(r, "fallback_prof"),
  fallback_multi: fallbackMulti,
  fallback_mfg: (r) => manufacturer(r, "fallback_mfg"),
};

export function buildProfilePlan(key: ProfileKey, r: SizeContext): ProfilePlan {
  return BUILDERS[key](r);
}

// More specific types win. "beauty parlor" must not fall through to a generic shop.
const MATCHERS: { key: ProfileKey; re: RegExp }[] = [
  {
    key: "salon",
    re: /(salon|parlour|parlor|beauty|barber|\bspa\b|nail\s*(studio|bar)|hair\s*studio|सैलून|पार्लर|सैलन|सலூன்|பார்லர்|பியூட்டி)/i,
  },
  {
    key: "pharmacy",
    re: /(pharmac|chemist|drug\s*store|medical\s*store|dispensary|औषध|फार्मेसी|मेडिकल\s*स्टोर|மருந்தக|மருந்து)/i,
  },
  {
    key: "kirana",
    re: /(kirana|kiryana|grocery|general\s*store|provision\s*store|किराना|किराणा|மளிகை)/i,
  },
  {
    key: "clinic",
    re: /(clinic|dental|dentist|diagnostic|patholog|physio|hospital|nursing|optician|optical|\blab\b|doctor|eye\s*care|क्लिनिक|दंत|डायग्नो|கிளினிக்|பல்)/i,
  },
  {
    key: "coaching",
    re: /(coach|tuition|tutor|classes|academy|edtech|pre-?\s*school|school|कोचिंग|ट्यूशन|பயிற்சி|கோச்சிங்|பள்ளி)/i,
  },
  {
    key: "restaurant",
    re: /(restaurant|cafe|café|dhaba|bakery|sweet\s*shop|cloud\s*kitchen|coffee|qsr|eatery|catering|रेस्टोर|कैफे|ढाबा|बेकरी|உணவகம்|பேக்கரி)/i,
  },
  {
    key: "hotel",
    re: /(hotel|guest\s*house|guesthouse|lodge|homestay|resort|\binn\b|होटल|लॉज|ஹோட்டல்|விடுதி)/i,
  },
  {
    key: "logistics",
    re: /(logistic|fleet|courier|transport|trucking|tempo\s*service|truck(ing|er)?|लोजिस्टिक|ट्रांसपोर्ट|ஃப்ளீட்|போக்குவரத்து|குரியர்)/i,
  },
  {
    key: "manufacturer",
    re: /(manufactur|factory|workshop|mill|foundry|mould|mold|packaging|textile|auto-?parts|printing|furniture|food\s*processing|fabrication|\bunit\b|press\b|कारखान|फैक्ट|वर्कशॉप|தொழிற்சாலை|பட்டறை)/i,
  },
  {
    key: "retail",
    re: /(retail|boutique|apparel|garment|footwear|hardware|stationery|showroom|\bshop\b|\bstore\b|दुकान|கடை)/i,
  },
  {
    key: "professional",
    re: /(chartered|\bca\b|c\.a\.|accountant|\blaw\b|lawyer|advocate|attorney|consult|architect|\bstudio\b|\bagency\b|insurance|real\s*estate|\boffice\b|वकील|अकाउंट|सलाहकार|ஆலோசகர்|வழக்கறிஞர்|அலுவலக)/i,
  },
];

/**
 * Rule classifier. `detected` is the segment fallback when no type matches
 * (multi-site wording, professional keywords the list missed, factories).
 */
export function classifyProfileRule(text: string, detected: SegmentCode = "micro"): ProfileKey {
  const t = text.normalize("NFKC");
  for (const m of MATCHERS) if (m.re.test(t)) return m.key;
  if (detected === "mfg") return "fallback_mfg";
  if (detected === "multi") return "fallback_multi";
  if (detected === "prof") return "fallback_prof";
  return "fallback_micro";
}

/** Short prompt catalogue so the model can only return a known key. */
export function profileKeyList(): string {
  return PROFILE_KEYS.map((k) => `${k}: ${PROFILE_LABEL[k]}`).join("; ");
}
