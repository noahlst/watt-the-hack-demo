CREATE TABLE IF NOT EXISTS bill_ingestions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  customer_email TEXT NOT NULL,
  provider TEXT,
  plan_name TEXT,
  service_address TEXT,
  postcode TEXT,
  bill_period_start DATE,
  bill_period_end DATE,
  usage_kwh NUMERIC(10, 2) NOT NULL DEFAULT 0,
  daily_average_kwh NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supply_charge_cents NUMERIC(10, 2),
  usage_charge_cents NUMERIC(10, 2),
  total_cents NUMERIC(12, 2),
  source_file_name TEXT,
  raw_text TEXT,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  coaching_notifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bill_ingestions_customer_email_idx
  ON bill_ingestions (customer_email);

CREATE INDEX IF NOT EXISTS bill_ingestions_created_at_idx
  ON bill_ingestions (created_at DESC);

CREATE TABLE IF NOT EXISTS savings_actions (
  id UUID PRIMARY KEY,
  customer_email TEXT NOT NULL,
  move_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'banked', 'dismissed')) DEFAULT 'pending',
  annual_delta_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_email, move_id)
);

CREATE INDEX IF NOT EXISTS savings_actions_customer_email_idx
  ON savings_actions (customer_email);

