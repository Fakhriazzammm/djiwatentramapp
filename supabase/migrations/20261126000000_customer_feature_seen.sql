-- Per-person "first seen" timestamps for new-feature ("Baru") badges in the customer app.
-- A feature's badge clock (2 days) starts the moment this person first sees the feature, and
-- the earliest timestamp wins across devices (on conflict do nothing). Mirrors Djiwa Pay's
-- finance.discovery_decisions (key `seen:<id>`), but scoped to `pos.customers(source_id)`.

CREATE TABLE IF NOT EXISTS pos.customer_feature_seen (
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  feature_id text NOT NULL CHECK (feature_id ~ '^[a-z0-9][a-z0-9_-]{1,60}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_feature_seen_customer
  ON pos.customer_feature_seen (customer_id);
