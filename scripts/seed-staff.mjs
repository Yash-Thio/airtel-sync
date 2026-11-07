// Seeds demo staff accounts (idempotent upsert). Uses the direct connection.
// DEMO DEFAULTS ONLY. The shared password is Demo@12345 unless STAFF_SEED_PASSWORD is set.
// Do not use these accounts outside this prototype.
//   admin@accel.example   role admin
//   sales@accel.example   role sales
//   partner@accel.example role partner (partner_id P-ACCEL)
import bcrypt from "bcryptjs";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set");
  process.exit(1);
}
const password = process.env.STAFF_SEED_PASSWORD || "Demo@12345";

const ACCOUNTS = [
  { id: "ST-ADMIN", email: "admin@accel.example", name: "Demo Admin", role: "admin", partner_id: null },
  { id: "ST-SALES", email: "sales@accel.example", name: "Demo Sales", role: "sales", partner_id: null },
  { id: "ST-PARTNER", email: "partner@accel.example", name: "Demo Partner", role: "partner", partner_id: "P-ACCEL" },
];

const hash = await bcrypt.hash(password, 10);
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (process.env.STAFF_SEED_PASSWORD) console.log("using STAFF_SEED_PASSWORD from the environment (value not printed)");
  else console.log("demo password: Demo@12345");
  await client.query("DELETE FROM staff_users WHERE email LIKE '%@udyam.demo'");
  for (const a of ACCOUNTS) {
    await client.query(
      `INSERT INTO staff_users (id, email, name, password_hash, role, partner_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, partner_id = EXCLUDED.partner_id`,
      [a.id, a.email, a.name, hash, a.role, a.partner_id],
    );
    console.log("seeded", a.email, `(${a.role}${a.partner_id ? ", " + a.partner_id : ""})`);
  }
} finally {
  await client.end();
}
