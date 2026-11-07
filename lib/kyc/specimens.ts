import type { DocSlot, ExtractedDocs, Fields, ScanQuality } from "./types";

/**
 * Hand-built table of what is printed on the 47 specimen images (K01-K12), transcribed by viewing
 * each image. Used as the deterministic extraction fallback for files named K##_<doc_type>.png.
 * Addresses wrap across two lines on the images; they are joined here. Values are exactly as printed
 * (including planted problems: K01 blank Udyam number, K04 blurred scan, K06 mistyped GSTIN,
 * K07 legal name differs from trade name, K11 old bill; K05 has no Udyam certificate).
 */

type GstRow = [gstin: string, legal: string, trade: string, constitution: string, address: string, dol: string];
type UdyamRow = [num: string, name: string, activity: string, city: string, state: string, date: string];
type IdRow = [name: string, designation: string, business: string, idNo: string, validTill: string];
type AddrRow = [consumer: string, billedTo: string, address: string, billDate: string, units: string, amount: string];

interface Applicant {
  id: string;
  /** What the applicant would be, for the demo picker. */
  label: string;
  gst: GstRow;
  udyam: UdyamRow | null;
  idDoc: IdRow;
  addr: AddrRow;
  quality?: Partial<Record<DocSlot, ScanQuality>>;
}

const A: Applicant[] = [
  {
    id: "K01", label: "Vindhya Tours & Travels",
    gst: ["37IHKXV5167L1ZS", "Neha Kaur (Prop. Vindhya Tours & Travels)", "Vindhya Tours & Travels", "Proprietorship", "Shop/Unit 1, Tech Park Road, Visakhapatnam, Andhra Pradesh - 118383", "2025-06-07"],
    udyam: ["", "Vindhya Tours & Travels", "Services", "Visakhapatnam", "Andhra Pradesh", "2024-03-24"],
    idDoc: ["Neha Kaur", "Office admin", "Vindhya Tours & Travels", "SYN-ID-346190", "2028-03-26"],
    addr: ["9485717625", "Vindhya Tours & Travels", "Shop/Unit 1, Tech Park Road, Visakhapatnam, Andhra Pradesh - 118383", "2026-06-26", "2203", "27071"],
  },
  {
    id: "K02", label: "Harmony Dental Care",
    gst: ["19EOGXH4115Y1ZL", "Joseph Shah (Prop. Harmony Dental Care)", "Harmony Dental Care", "Proprietorship", "Shop/Unit 199, Station Road, Kolkata, West Bengal - 347550", "2022-04-17"],
    udyam: ["UDYAM-WB-00-5053330", "Harmony Dental Care", "Services", "Kolkata", "West Bengal", "2023-01-11"],
    idDoc: ["Joseph Shah", "Manager", "Harmony Dental Care", "SYN-ID-816907", "2028-09-10"],
    addr: ["9790713533", "Harmony Dental Care", "Shop/Unit 199, Station Road, Kolkata, West Bengal - 347550", "2026-05-22", "992", "7077"],
    quality: { gst_certificate: "skewed" },
  },
  {
    id: "K03", label: "Ganesh Woodcraft",
    gst: ["27XUIXG0767D1ZP", "Joseph Singh (Prop. Ganesh Woodcraft)", "Ganesh Woodcraft", "Proprietorship", "Shop/Unit 80, Civil Lines, Nagpur, Maharashtra - 411231", "2020-02-10"],
    udyam: ["UDYAM-MH-00-9516696", "Ganesh Woodcraft", "Manufacturing", "Nagpur", "Maharashtra", "2024-11-21"],
    idDoc: ["Joseph Singh", "Owner", "Ganesh Woodcraft", "SYN-ID-447889", "2028-07-04"],
    addr: ["3438517928", "Ganesh Woodcraft", "Shop/Unit 80, Civil Lines, Nagpur, Maharashtra - 411231", "2026-05-30", "231", "33615"],
  },
  {
    id: "K04", label: "Saffron Dental Care LLP",
    gst: ["27PZSXS1936O1ZH", "Saffron Dental Care LLP", "Saffron Dental Care LLP", "Limited Liability Partnership", "Shop/Unit 75, Lake View Colony, Nagpur, Maharashtra - 137452", "2020-05-12"],
    udyam: ["UDYAM-MH-00-6131836", "Saffron Dental Care LLP", "Services", "Nagpur", "Maharashtra", "2025-05-17"],
    idDoc: ["Fatima Pillai", "Partner", "Saffron Dental Care LLP", "SYN-ID-609396", "2028-08-03"],
    addr: ["7397844759", "Saffron Dental Care LLP", "Shop/Unit 75, Lake View Colony, Nagpur, Maharashtra - 137452", "2026-05-28", "2295", "20713"],
    quality: { gst_certificate: "blurry" },
  },
  {
    id: "K05", label: "Balaji Realty LLP",
    gst: ["32TZAXB5481U1Z1", "Balaji Realty LLP", "Balaji Realty LLP", "Limited Liability Partnership", "Shop/Unit 38, Civil Lines, Kochi, Kerala - 752083", "2020-07-26"],
    udyam: null,
    idDoc: ["Anita Shah", "Owner", "Balaji Realty LLP", "SYN-ID-587234", "2029-09-11"],
    addr: ["4294969054", "Balaji Realty LLP", "Shop/Unit 38, Civil Lines, Kochi, Kerala - 752083", "2026-06-11", "996", "22425"],
  },
  {
    id: "K06", label: "Saffron Unisex Salon",
    gst: ["08YKZXS8189L1Z0", "Pooja Shah (Prop. Saffron Unisex Salon)", "Saffron Unisex Salon", "Proprietorship", "Shop/Unit 71, Market Yard, Jaipur, Rajasthan - 194057", "2019-09-25"],
    udyam: ["UDYAM-RJ-00-6577157", "Saffron Unisex Salon", "Services", "Jaipur", "Rajasthan", "2023-01-24"],
    idDoc: ["Pooja Shah", "Owner", "Saffron Unisex Salon", "SYN-ID-118354", "2028-09-15"],
    addr: ["9566781101", "Saffron Unisex Salon", "Shop/Unit 71, Market Yard, Jaipur, Rajasthan - 194057", "2026-06-11", "1280", "27352"],
  },
  {
    id: "K07", label: "Neelgiri Physio Clinic",
    gst: ["07CPCXN0398P1ZT", "Neha Banerjee (Prop. Shri Physio Clinic)", "Neelgiri Physio Clinic", "Proprietorship", "Shop/Unit 52, Transport Nagar, Delhi, Delhi - 334596", "2024-01-13"],
    udyam: ["UDYAM-DL-00-9565547", "Neelgiri Physio Clinic", "Services", "Delhi", "Delhi", "2024-07-14"],
    idDoc: ["Neha Banerjee", "Manager", "Neelgiri Physio Clinic", "SYN-ID-178237", "2030-05-05"],
    addr: ["7545812405", "Neelgiri Physio Clinic", "Shop/Unit 52, Transport Nagar, Delhi, Delhi - 334596", "2026-07-05", "1652", "10690"],
  },
  {
    id: "K08", label: "Green Leaf Legal Associates",
    gst: ["24XORXG9365M1Z3", "Joseph Rao (Prop. Green Leaf Legal Associates)", "Green Leaf Legal Associates", "Proprietorship", "Shop/Unit 238, Ring Road, Vadodara, Gujarat - 348176", "2018-12-01"],
    udyam: ["UDYAM-GJ-00-8477445", "Green Leaf Legal Associates", "Services", "Vadodara", "Gujarat", "2022-11-12"],
    idDoc: ["Joseph Rao", "Office admin", "Green Leaf Legal Associates", "SYN-ID-393148", "2027-09-18"],
    addr: ["2568472785", "Green Leaf Legal Associates", "Shop/Unit 238, Ring Road, Vadodara, Gujarat - 348176", "2026-05-26", "2219", "33859"],
  },
  {
    id: "K09", label: "Kaveri Insurance Advisors",
    gst: ["37LDYXK0296F1ZB", "Anita Kulkarni (Prop. Kaveri Insurance Advisors)", "Kaveri Insurance Advisors", "Proprietorship", "Shop/Unit 217, Civil Lines, Visakhapatnam, Andhra Pradesh - 405337", "2023-09-20"],
    udyam: ["UDYAM-AP-00-9751562", "Kaveri Insurance Advisors", "Services", "Visakhapatnam", "Andhra Pradesh", "2023-07-04"],
    idDoc: ["Anita Kulkarni", "Office admin", "Kaveri Insurance Advisors", "SYN-ID-126040", "2027-12-22"],
    addr: ["9375012581", "Kaveri Insurance Advisors", "Shop/Unit 217, Civil Lines, Visakhapatnam, Andhra Pradesh - 405337", "2026-07-10", "2026", "28569"],
  },
  {
    id: "K10", label: "Kaveri Stays LLP",
    gst: ["27QHJXK0658U1ZL", "Kaveri Stays LLP", "Kaveri Stays LLP", "Limited Liability Partnership", "Shop/Unit 21, Sector 14, Mumbai, Maharashtra - 570043", "2022-07-13"],
    udyam: ["UDYAM-MH-00-7183141", "Kaveri Stays LLP", "Services", "Mumbai", "Maharashtra", "2024-01-09"],
    idDoc: ["Nisha Arora", "Owner", "Kaveri Stays LLP", "SYN-ID-247542", "2029-06-01"],
    addr: ["6910330901", "Kaveri Stays LLP", "Shop/Unit 21, Sector 14, Mumbai, Maharashtra - 570043", "2026-06-18", "675", "23713"],
  },
  {
    id: "K11", label: "Trinity Bake House Pvt Ltd",
    gst: ["03KGZXT1320R1ZZ", "Trinity Bake House Pvt Ltd", "Trinity Bake House Pvt Ltd", "Private Limited Company", "Shop/Unit 188, Industrial Area Phase 2, Ludhiana, Punjab - 541498", "2019-08-19"],
    udyam: ["UDYAM-PB-00-9719478", "Trinity Bake House Pvt Ltd", "Services", "Ludhiana", "Punjab", "2025-09-15"],
    idDoc: ["Vikram Pillai", "Owner", "Trinity Bake House Pvt Ltd", "SYN-ID-440312", "2028-12-23"],
    addr: ["2710511786", "Trinity Bake House Pvt Ltd", "Shop/Unit 188, Industrial Area Phase 2, Ludhiana, Punjab - 541498", "2025-10-31", "981", "2768"],
  },
  {
    id: "K12", label: "Star Electronics",
    gst: ["37NBLXS1145E1ZU", "Pooja Agarwal (Prop. Star Electronics)", "Star Electronics", "Proprietorship", "Shop/Unit 216, Nehru Nagar, Visakhapatnam, Andhra Pradesh - 762071", "2017-01-08"],
    udyam: ["UDYAM-AP-00-5186772", "Star Electronics", "Services", "Visakhapatnam", "Andhra Pradesh", "2024-02-03"],
    idDoc: ["Pooja Agarwal", "Owner", "Star Electronics", "SYN-ID-365512", "2029-03-03"],
    addr: ["6982457282", "Star Electronics", "Shop/Unit 216, Nehru Nagar, Visakhapatnam, Andhra Pradesh - 762071", "2026-07-06", "492", "25639"],
  },
];

function toDocs(a: Applicant): ExtractedDocs {
  const docs: ExtractedDocs = {
    gst_certificate: {
      gstin: a.gst[0], legal_name: a.gst[1], trade_name: a.gst[2], constitution: a.gst[3], address: a.gst[4],
      date_of_liability: a.gst[5], registration_type: "Regular",
    },
    signatory_id: { name: a.idDoc[0], designation: a.idDoc[1], business: a.idDoc[2], id_number: a.idDoc[3], valid_till: a.idDoc[4] },
    address_proof: {
      consumer_no: a.addr[0], billed_to: a.addr[1], address: a.addr[2], bill_date: a.addr[3], units: a.addr[4], amount: a.addr[5],
    },
  };
  if (a.udyam) {
    docs.udyam_certificate = {
      udyam_number: a.udyam[0] || null, enterprise_name: a.udyam[1], major_activity: a.udyam[2], city: a.udyam[3],
      state: a.udyam[4], date_of_registration: a.udyam[5],
    };
  }
  return docs;
}

export const SPECIMEN_IDS = A.map((a) => a.id);

export interface SpecimenInfo {
  id: string;
  label: string;
  /** Slots for which an image exists (K05 has no Udyam certificate). */
  slots: DocSlot[];
}

export const SPECIMENS: SpecimenInfo[] = A.map((a) => ({
  id: a.id,
  label: a.label,
  slots: (["gst_certificate", ...(a.udyam ? ["udyam_certificate"] : []), "signatory_id", "address_proof"] as DocSlot[]),
}));

export const specimenUrl = (id: string, slot: DocSlot) => `/kyc_specimens/${id}_${slot}.png`;

export function getSpecimenDocs(id: string): { docs: ExtractedDocs; quality: Partial<Record<DocSlot, ScanQuality>> } | null {
  const a = A.find((x) => x.id === id.toUpperCase());
  return a ? { docs: toDocs(a), quality: a.quality ?? {} } : null;
}

/** Parse "K03_gst_certificate.png" -> { id: "K03", slot }. */
export function parseSpecimenFileName(name: string): { id: string; slot: DocSlot } | null {
  const m = /^(K(?:0[1-9]|1[0-2]))_(gst_certificate|udyam_certificate|signatory_id|address_proof)\.(?:png|jpe?g|webp)$/i.exec(name.trim());
  return m ? { id: m[1].toUpperCase(), slot: m[2].toLowerCase() as DocSlot } : null;
}

/** Expected extracted fields for a specimen file, or null when not a known specimen/slot. */
export function specimenFields(name: string): { fields: Fields; quality: ScanQuality } | null {
  const p = parseSpecimenFileName(name);
  if (!p) return null;
  const s = getSpecimenDocs(p.id);
  const fields = s?.docs[p.slot];
  if (!s || !fields) return null;
  return { fields, quality: s.quality[p.slot] ?? "ok" };
}
