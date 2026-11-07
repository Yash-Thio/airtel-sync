-- Udyam Digital initial schema. Applied via `npm run db:migrate` (direct, non-pooled connection).

CREATE TABLE users (
  id            text PRIMARY KEY,
  phone         text NOT NULL UNIQUE,
  name          text NOT NULL,
  business_name text NOT NULL,
  language      text NOT NULL DEFAULT 'en',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

-- Fixed-window counters used for rate limiting (OTP send/verify, order lookups, staff login).
CREATE TABLE rate_limits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Advisor sessions. user_id is NULL until the visitor logs in.
CREATE TABLE sessions (
  id            text PRIMARY KEY,
  user_id       text REFERENCES users(id) ON DELETE SET NULL,
  language      text NOT NULL DEFAULT 'en',
  unclosed      boolean NOT NULL DEFAULT true,
  last_stage    text,
  quote_id      text,
  kyc_id        text,
  order_id      text,
  -- profile, messages, recommendedProductIds, recommendedLines, recommendation, advisor state
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE quotes (
  id                text PRIMARY KEY,
  session_id        text REFERENCES sessions(id) ON DELETE SET NULL,
  user_id           text REFERENCES users(id) ON DELETE SET NULL,
  lines             jsonb NOT NULL DEFAULT '[]'::jsonb,
  monthly_total_inr numeric NOT NULL DEFAULT 0,
  setup_total_inr   numeric NOT NULL DEFAULT 0,
  contract_months   int NOT NULL DEFAULT 12,
  status            text NOT NULL DEFAULT 'draft',
  accepted_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_user_idx ON quotes (user_id);

-- Masked fields only: no raw identifiers and no document images are ever stored.
CREATE TABLE kyc_records (
  id                text PRIMARY KEY,
  session_id        text REFERENCES sessions(id) ON DELETE SET NULL,
  quote_id          text REFERENCES quotes(id) ON DELETE SET NULL,
  user_id           text REFERENCES users(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'not_started',
  verdict           text,
  consent_given_at  timestamptz,
  consent           jsonb,
  checks            jsonb,
  summary           jsonb,
  documents         jsonb NOT NULL DEFAULT '[]'::jsonb,
  issues            jsonb NOT NULL DEFAULT '[]'::jsonb,
  e_signed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- id is the public tracking ID (ACC- + 10 random base32 chars).
CREATE TABLE orders (
  id                         text PRIMARY KEY,
  user_id                    text REFERENCES users(id) ON DELETE SET NULL,
  session_id                 text REFERENCES sessions(id) ON DELETE SET NULL,
  quote_id                   text REFERENCES quotes(id) ON DELETE SET NULL,
  kyc_id                     text REFERENCES kyc_records(id) ON DELETE SET NULL,
  status                     text NOT NULL,
  expected_activation_date   date,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);

CREATE TABLE order_events (
  id        bigserial PRIMARY KEY,
  order_id  text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status    text NOT NULL,
  note      text,
  ts        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

CREATE TABLE staff_users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('sales', 'partner', 'admin')),
  partner_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Back-office lead assignments (lead_id is a CSV lead id or an in-app session id).
CREATE TABLE assignments (
  lead_id     text PRIMARY KEY,
  owner_type  text NOT NULL,
  assignee    text,
  note        text,
  partner_id  text,
  assigned_by text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_partner_idx ON assignments (partner_id);
