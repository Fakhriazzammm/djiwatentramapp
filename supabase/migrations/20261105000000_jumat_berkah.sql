-- Jumat Berkah: sedekah makanan setiap Jumat (Rp15.000/porsi, harga Happy Hour semua menu).
-- Program khusus: tidak masuk pos.orders / shift / kasir. Dicatat sebagai penjualan khusus
-- "Penjualan Jumat Berkah" (pendapatan) di pos.financial_transactions. Tanpa HPP/stok.
-- Additive dan idempoten. Semua tulis lewat RPC SECURITY DEFINER (service_role only).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ───────────────────────────── settings ─────────────────────────────
CREATE TABLE IF NOT EXISTS pos.jumat_berkah_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  price_per_portion bigint NOT NULL DEFAULT 15000 CHECK (price_per_portion > 0),
  target_portions int NOT NULL DEFAULT 100 CHECK (target_portions > 0),
  max_portions_per_donation int NOT NULL DEFAULT 100 CHECK (max_portions_per_donation > 0),
  reservation_minutes int NOT NULL DEFAULT 30 CHECK (reservation_minutes BETWEEN 5 AND 240),
  telegram_transaction_chat_id text,
  telegram_kitchen_chat_id text,
  cron_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Grup Telegram [Transaksi] dan [Kitchen] Djiwa Tentram (bot supervisor sudah administrator di keduanya).
INSERT INTO pos.jumat_berkah_settings (id, telegram_transaction_chat_id, telegram_kitchen_chat_id)
VALUES (1, '-1003927364523', '-1003953908854') ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────── campaigns ─────────────────────────────
CREATE TABLE IF NOT EXISTS pos.jumat_berkah_campaigns (
  campaign_id text PRIMARY KEY,
  distribution_date date NOT NULL UNIQUE,
  price_per_portion bigint NOT NULL CHECK (price_per_portion > 0),
  target_portions int NOT NULL CHECK (target_portions > 0),
  closes_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'distributed', 'cancelled')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── donations ─────────────────────────────
CREATE TABLE IF NOT EXISTS pos.jumat_berkah_donations (
  donation_id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES pos.jumat_berkah_campaigns(campaign_id),
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  portions int NOT NULL CHECK (portions BETWEEN 1 AND 1000),
  unit_price bigint NOT NULL CHECK (unit_price > 0),
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  show_name boolean NOT NULL DEFAULT true,
  display_name text NOT NULL,
  donor_name text,
  prayer_text text,
  invoice_id text,
  invoice_url text,
  transaction_id text UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  reserved_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_jb_donations_campaign_status ON pos.jumat_berkah_donations(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_jb_donations_customer ON pos.jumat_berkah_donations(customer_id, created_at DESC);

-- ───────────────────────────── prayers ─────────────────────────────
CREATE TABLE IF NOT EXISTS pos.jumat_berkah_prayers (
  prayer_id text PRIMARY KEY,
  donation_id text UNIQUE REFERENCES pos.jumat_berkah_donations(donation_id) ON DELETE SET NULL,
  campaign_id text REFERENCES pos.jumat_berkah_campaigns(campaign_id),
  display_name text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  portions int,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'hidden')),
  is_seed boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  amin_count int NOT NULL DEFAULT 0 CHECK (amin_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jb_prayers_feed ON pos.jumat_berkah_prayers(status, is_pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS pos.jumat_berkah_amins (
  prayer_id text NOT NULL REFERENCES pos.jumat_berkah_prayers(prayer_id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prayer_id, customer_id)
);

-- ───────────────────────────── distribution + gallery ─────────────────────────────
CREATE TABLE IF NOT EXISTS pos.jumat_berkah_distributions (
  distribution_id text PRIMARY KEY,
  campaign_id text NOT NULL UNIQUE REFERENCES pos.jumat_berkah_campaigns(campaign_id),
  portions_given int NOT NULL CHECK (portions_given >= 0),
  location text,
  notes text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.jumat_berkah_gallery (
  photo_id text PRIMARY KEY,
  campaign_id text REFERENCES pos.jumat_berkah_campaigns(campaign_id),
  image_url text NOT NULL, -- path objek di bucket jumat-berkah (klien membangun URL publik)
  caption text,
  is_published boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jb_gallery_published ON pos.jumat_berkah_gallery(is_published, created_at DESC);

-- ───────────────────────────── outbox (Telegram) ─────────────────────────────
CREATE TABLE IF NOT EXISTS pos.jumat_berkah_outbox (
  outbox_id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_jb_outbox_due ON pos.jumat_berkah_outbox(status, next_attempt_at);

ALTER TABLE pos.jumat_berkah_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_prayers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_amins ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.jumat_berkah_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.jumat_berkah_settings, pos.jumat_berkah_campaigns, pos.jumat_berkah_donations,
  pos.jumat_berkah_prayers, pos.jumat_berkah_amins, pos.jumat_berkah_distributions,
  pos.jumat_berkah_gallery, pos.jumat_berkah_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON pos.jumat_berkah_settings, pos.jumat_berkah_campaigns, pos.jumat_berkah_donations,
  pos.jumat_berkah_prayers, pos.jumat_berkah_amins, pos.jumat_berkah_distributions,
  pos.jumat_berkah_gallery, pos.jumat_berkah_outbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pos.jumat_berkah_outbox_outbox_id_seq TO service_role;

-- ───────────────────────────── notification types ─────────────────────────────
ALTER TABLE public.pos_notifications DROP CONSTRAINT IF EXISTS pos_notifications_notification_type_check;
ALTER TABLE public.pos_notifications ADD CONSTRAINT pos_notifications_notification_type_check CHECK (
  notification_type = ANY (ARRAY[
    'order_cashier_pending', 'order_mayar_pending', 'order_paid', 'order_payment_failed', 'order_cancelled',
    'admin_info', 'admin_briefing', 'wallet_transfer_sent', 'wallet_transfer_received',
    'jumat_berkah_paid', 'jumat_berkah_admin', 'jumat_berkah_report'
  ])
);

-- ───────────────────────────── helpers ─────────────────────────────
-- Prayer is auto-approved only when clean: no link, no phone number, no obvious abuse.
CREATE OR REPLACE FUNCTION pos.jumat_berkah_prayer_is_clean(p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_text IS NOT NULL
    AND p_text !~* '(https?:|www\.|\.(com|id|net|org|co|xyz|me|link)\M|@[a-z0-9_]{3,}|t\.me/|wa\.me/)'
    AND p_text !~ '[0-9][0-9 .\-]{7,}[0-9]'
    AND p_text !~* '(anjing|babi|bangsat|bajingan|kontol|memek|goblok|tolol|asu\M|judi|slot|togel|pinjol)'
$$;

-- Distribution Friday of the campaign that accepts donations right now (WIB).
-- Closes Thursday 21:00 WIB; afterwards donations roll to next Friday.
CREATE OR REPLACE FUNCTION pos.jumat_berkah_ensure_campaign()
RETURNS pos.jumat_berkah_campaigns LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_settings pos.jumat_berkah_settings;
  v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_friday date;
  v_closes timestamptz;
  v_row pos.jumat_berkah_campaigns;
BEGIN
  SELECT * INTO v_settings FROM pos.jumat_berkah_settings WHERE id = 1;
  v_friday := v_today + ((5 - extract(dow FROM v_today)::int + 7) % 7);
  v_closes := ((v_friday - 1)::timestamp + interval '21 hours') AT TIME ZONE 'Asia/Jakarta';
  IF now() >= v_closes THEN
    v_friday := v_friday + 7;
    v_closes := ((v_friday - 1)::timestamp + interval '21 hours') AT TIME ZONE 'Asia/Jakarta';
  END IF;
  INSERT INTO pos.jumat_berkah_campaigns (campaign_id, distribution_date, price_per_portion, target_portions, closes_at)
  VALUES ('jb_' || to_char(v_friday, 'YYYYMMDD'), v_friday, v_settings.price_per_portion, v_settings.target_portions, v_closes)
  ON CONFLICT (distribution_date) DO NOTHING;
  SELECT * INTO v_row FROM pos.jumat_berkah_campaigns WHERE distribution_date = v_friday;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION pos.jumat_berkah_committed(p_campaign_id text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pos, public AS $$
  SELECT coalesce(sum(portions), 0)::int FROM pos.jumat_berkah_donations
  WHERE campaign_id = p_campaign_id AND (status = 'paid' OR (status = 'pending' AND reserved_until > now()))
$$;

CREATE OR REPLACE FUNCTION pos.jumat_berkah_paid_portions(p_campaign_id text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pos, public AS $$
  SELECT coalesce(sum(portions), 0)::int FROM pos.jumat_berkah_donations WHERE campaign_id = p_campaign_id AND status = 'paid'
$$;

-- ───────────────────────────── overview (public data only) ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_overview(p_customer_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_settings pos.jumat_berkah_settings;
  v_c pos.jumat_berkah_campaigns;
  v_prayers jsonb; v_gallery jsonb; v_report jsonb; v_mine jsonb;
BEGIN
  SELECT * INTO v_settings FROM pos.jumat_berkah_settings WHERE id = 1;
  IF NOT v_settings.enabled THEN RETURN jsonb_build_object('enabled', false); END IF;
  v_c := pos.jumat_berkah_ensure_campaign();

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_prayers FROM (
    SELECT p.prayer_id AS "prayerId", p.display_name AS "displayName", p.body, p.portions,
           p.amin_count AS "aminCount", p.is_pinned AS "isPinned", p.created_at AS "createdAt",
           (p_customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM pos.jumat_berkah_amins a WHERE a.prayer_id = p.prayer_id AND a.customer_id = p_customer_id)) AS "aminByMe"
    FROM pos.jumat_berkah_prayers p
    WHERE p.status = 'approved'
    ORDER BY p.is_pinned DESC, p.created_at DESC
    LIMIT 40
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(g)), '[]'::jsonb) INTO v_gallery FROM (
    SELECT photo_id AS "photoId", image_url AS "imageUrl", caption, created_at AS "createdAt"
    FROM pos.jumat_berkah_gallery WHERE is_published ORDER BY created_at DESC LIMIT 24
  ) g;

  SELECT row_to_json(r)::jsonb INTO v_report FROM (
    SELECT c.distribution_date AS "distributionDate", d.portions_given AS "portionsGiven", d.location, d.notes
    FROM pos.jumat_berkah_distributions d JOIN pos.jumat_berkah_campaigns c USING (campaign_id)
    ORDER BY c.distribution_date DESC LIMIT 1
  ) r;

  IF p_customer_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) INTO v_mine FROM (
      SELECT d.donation_id AS "donationId", d.portions, d.amount, d.status, d.created_at AS "createdAt", c.distribution_date AS "distributionDate"
      FROM pos.jumat_berkah_donations d JOIN pos.jumat_berkah_campaigns c USING (campaign_id)
      WHERE d.customer_id = p_customer_id AND d.status = 'paid' ORDER BY d.created_at DESC LIMIT 10
    ) m;
  END IF;

  RETURN jsonb_build_object(
    'enabled', true,
    'campaign', jsonb_build_object(
      'campaignId', v_c.campaign_id, 'distributionDate', v_c.distribution_date, 'closesAt', v_c.closes_at,
      'pricePerPortion', v_c.price_per_portion, 'targetPortions', v_c.target_portions,
      'paidPortions', pos.jumat_berkah_paid_portions(v_c.campaign_id),
      'remainingPortions', greatest(0, v_c.target_portions - pos.jumat_berkah_committed(v_c.campaign_id)),
      'donors', (SELECT count(DISTINCT customer_id) FROM pos.jumat_berkah_donations WHERE campaign_id = v_c.campaign_id AND status = 'paid'),
      'status', v_c.status),
    'maxPortionsPerDonation', v_settings.max_portions_per_donation,
    'totalPortionsAllTime', (SELECT coalesce(sum(portions), 0) FROM pos.jumat_berkah_donations WHERE status = 'paid'),
    'prayers', v_prayers, 'gallery', v_gallery, 'lastReport', v_report, 'mine', coalesce(v_mine, '[]'::jsonb)
  );
END $$;

-- ───────────────────────────── create donation ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_create_donation(
  p_customer_id text, p_portions int, p_show_name boolean, p_prayer text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_settings pos.jumat_berkah_settings; v_c pos.jumat_berkah_campaigns; v_customer pos.customers;
  v_existing pos.jumat_berkah_donations; v_id text; v_prayer text; v_name text; v_row pos.jumat_berkah_donations;
BEGIN
  SELECT * INTO v_settings FROM pos.jumat_berkah_settings WHERE id = 1;
  IF NOT v_settings.enabled THEN RAISE EXCEPTION 'Jumat Berkah belum dibuka'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN RAISE EXCEPTION 'Kunci permintaan wajib'; END IF;
  SELECT * INTO v_existing FROM pos.jumat_berkah_donations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.customer_id <> p_customer_id THEN RAISE EXCEPTION 'Kunci permintaan sudah dipakai'; END IF;
    RETURN to_jsonb(v_existing);
  END IF;
  IF p_portions IS NULL OR p_portions < 1 OR p_portions > v_settings.max_portions_per_donation THEN
    RAISE EXCEPTION 'Jumlah porsi harus 1 sampai %', v_settings.max_portions_per_donation;
  END IF;
  SELECT * INTO v_customer FROM pos.customers WHERE source_id = p_customer_id AND coalesce(is_active, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan'; END IF;

  v_c := pos.jumat_berkah_ensure_campaign();
  SELECT * INTO v_c FROM pos.jumat_berkah_campaigns WHERE campaign_id = v_c.campaign_id FOR UPDATE;
  IF v_c.status <> 'open' OR now() >= v_c.closes_at THEN RAISE EXCEPTION 'Pesanan Jumat Berkah sudah ditutup'; END IF;
  UPDATE pos.jumat_berkah_donations SET status = 'expired' WHERE campaign_id = v_c.campaign_id AND status = 'pending' AND reserved_until <= now();
  IF pos.jumat_berkah_committed(v_c.campaign_id) + p_portions > v_c.target_portions THEN
    RAISE EXCEPTION 'Kuota Jumat ini tersisa % porsi', greatest(0, v_c.target_portions - pos.jumat_berkah_committed(v_c.campaign_id));
  END IF;

  v_prayer := nullif(btrim(regexp_replace(coalesce(p_prayer, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  IF v_prayer IS NOT NULL AND char_length(v_prayer) > 140 THEN RAISE EXCEPTION 'Doa maksimal 140 karakter'; END IF;
  v_name := coalesce(nullif(btrim(v_customer.name), ''), 'Sahabat Djiwa');
  v_id := 'jbd_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO pos.jumat_berkah_donations (donation_id, campaign_id, customer_id, portions, unit_price, amount, show_name,
    display_name, donor_name, prayer_text, idempotency_key, reserved_until)
  VALUES (v_id, v_c.campaign_id, p_customer_id, p_portions, v_c.price_per_portion, p_portions::bigint * v_c.price_per_portion,
    coalesce(p_show_name, true), CASE WHEN coalesce(p_show_name, true) THEN split_part(v_name, ' ', 1) ELSE 'Hamba Allah' END,
    v_name, v_prayer, p_idempotency_key, now() + make_interval(mins => v_settings.reservation_minutes))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION pos.jumat_berkah_attach_invoice(p_donation_id text, p_invoice_id text, p_transaction_id text, p_invoice_url text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pos, public AS $$
  UPDATE pos.jumat_berkah_donations SET invoice_id = p_invoice_id, transaction_id = nullif(p_transaction_id, ''), invoice_url = p_invoice_url
  WHERE donation_id = p_donation_id AND status = 'pending'
$$;

-- ───────────────────────────── settle (idempotent) ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_settle_donation(p_donation_id text, p_transaction_id text, p_provider_amount bigint, p_paid_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_d pos.jumat_berkah_donations; v_c pos.jumat_berkah_campaigns; v_paid_before int; v_paid_after int;
  v_status text; v_now_ms double precision := extract(epoch FROM now()) * 1000; v_pct_before int; v_pct_after int; v_pct int;
BEGIN
  SELECT * INTO v_d FROM pos.jumat_berkah_donations WHERE donation_id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donasi tidak ditemukan'; END IF;
  IF v_d.status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', 'paid'); END IF;
  IF v_d.status IN ('cancelled', 'refunded') THEN RAISE EXCEPTION 'Donasi tidak dapat disettle'; END IF;
  IF p_provider_amount IS NULL OR p_provider_amount <> v_d.amount THEN RAISE EXCEPTION 'Nominal pembayaran tidak sesuai'; END IF;
  IF EXISTS (SELECT 1 FROM pos.jumat_berkah_donations WHERE transaction_id = p_transaction_id AND donation_id <> p_donation_id) THEN
    RAISE EXCEPTION 'Transaksi Mayar sudah dipakai';
  END IF;

  SELECT * INTO v_c FROM pos.jumat_berkah_campaigns WHERE campaign_id = v_d.campaign_id FOR UPDATE;
  -- Late payment after the campaign closed still counts: roll it into the next Friday.
  IF v_c.status <> 'open' OR now() >= v_c.closes_at THEN
    v_c := pos.jumat_berkah_ensure_campaign();
    SELECT * INTO v_c FROM pos.jumat_berkah_campaigns WHERE campaign_id = v_c.campaign_id FOR UPDATE;
    UPDATE pos.jumat_berkah_donations SET campaign_id = v_c.campaign_id WHERE donation_id = p_donation_id;
    v_d.campaign_id := v_c.campaign_id;
  END IF;

  v_paid_before := pos.jumat_berkah_paid_portions(v_c.campaign_id);
  UPDATE pos.jumat_berkah_donations SET status = 'paid', transaction_id = p_transaction_id, paid_at = p_paid_at WHERE donation_id = p_donation_id;
  v_paid_after := v_paid_before + v_d.portions;

  -- Prayer: appears right away when clean, otherwise waits for admin review.
  IF v_d.prayer_text IS NOT NULL THEN
    v_status := CASE WHEN pos.jumat_berkah_prayer_is_clean(v_d.prayer_text) THEN 'approved' ELSE 'pending' END;
    INSERT INTO pos.jumat_berkah_prayers (prayer_id, donation_id, campaign_id, display_name, body, portions, status)
    VALUES ('jbp_' || replace(gen_random_uuid()::text, '-', ''), p_donation_id, v_c.campaign_id, v_d.display_name, v_d.prayer_text, v_d.portions, v_status)
    ON CONFLICT (donation_id) DO NOTHING;
  END IF;

  -- Penjualan khusus Jumat Berkah (tanpa HPP: sistem HPP/stok belum dipakai untuk program ini).
  INSERT INTO pos.financial_transactions (source_id, tx_type, amount, category, description, tx_date, payment_method, status, metadata, creation_time, raw)
  VALUES ('fin_jb_' || p_donation_id, 'income', v_d.amount, 'Penjualan Jumat Berkah',
          'Jumat Berkah ' || to_char(v_c.distribution_date, 'DD/MM/YYYY') || ' · ' || v_d.portions || ' porsi', v_now_ms, 'mayar', 'completed',
          jsonb_build_object('kind', 'jumat_berkah', 'donationId', p_donation_id, 'campaignId', v_c.campaign_id, 'portions', v_d.portions),
          v_now_ms, jsonb_build_object('kind', 'jumat_berkah_settlement', 'donationId', p_donation_id))
  ON CONFLICT (source_id) DO NOTHING;

  -- In-app notifications: donor + admin.
  INSERT INTO public.pos_notifications (notification_type, priority, title, message, source, target_user_id, dedupe_key, action_type, action_payload, source_app, source_module, entity_type, entity_id)
  VALUES ('jumat_berkah_paid', 'normal', 'Sedekah Jumat Berkah diterima',
          v_d.portions || ' porsi atas nama ' || v_d.display_name || ' akan dibagikan Jumat ' || to_char(v_c.distribution_date, 'DD/MM/YYYY') || '. Jazakumullahu khairan.',
          'jumat_berkah', v_d.customer_id, 'jb_paid_' || p_donation_id, 'open_jumat_berkah', jsonb_build_object('donationId', p_donation_id),
          'customer', 'jumat_berkah', 'jumat_berkah_donation', p_donation_id)
  ON CONFLICT (dedupe_key) DO NOTHING;
  INSERT INTO public.pos_notifications (notification_type, priority, title, message, source, target_role, dedupe_key, action_type, action_payload, source_app, source_module, entity_type, entity_id)
  VALUES ('jumat_berkah_admin', 'normal', 'Jumat Berkah: sedekah masuk',
          coalesce(v_d.donor_name, v_d.display_name) || ' · ' || v_d.portions || ' porsi · Rp' || v_d.amount || ' (' || v_paid_after || '/' || v_c.target_portions || ')',
          'jumat_berkah', 'admin', 'jb_admin_' || p_donation_id, 'open_jumat_berkah', jsonb_build_object('donationId', p_donation_id),
          'customer', 'jumat_berkah', 'jumat_berkah_donation', p_donation_id)
  ON CONFLICT (dedupe_key) DO NOTHING;

  -- Telegram: grup transaksi (every donation) and milestones (transaksi + kitchen).
  INSERT INTO pos.jumat_berkah_outbox (event_type, dedupe_key, payload)
  VALUES ('donation_paid', 'donation_paid:' || p_donation_id, jsonb_build_object(
    'donationId', p_donation_id, 'campaignId', v_c.campaign_id, 'distributionDate', v_c.distribution_date,
    'donorName', coalesce(v_d.donor_name, v_d.display_name), 'displayName', v_d.display_name, 'showName', v_d.show_name,
    'portions', v_d.portions, 'amount', v_d.amount, 'prayer', v_d.prayer_text, 'paidPortions', v_paid_after, 'target', v_c.target_portions))
  ON CONFLICT (dedupe_key) DO NOTHING;
  v_pct_before := floor(v_paid_before * 100.0 / v_c.target_portions);
  v_pct_after := floor(v_paid_after * 100.0 / v_c.target_portions);
  FOREACH v_pct IN ARRAY ARRAY[50, 100] LOOP
    IF v_pct_before < v_pct AND v_pct_after >= v_pct THEN
      INSERT INTO pos.jumat_berkah_outbox (event_type, dedupe_key, payload)
      VALUES ('milestone', 'milestone:' || v_c.campaign_id || ':' || v_pct, jsonb_build_object(
        'campaignId', v_c.campaign_id, 'distributionDate', v_c.distribution_date, 'percent', v_pct, 'paidPortions', v_paid_after, 'target', v_c.target_portions))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'paid', 'campaignId', v_c.campaign_id);
END $$;

-- ───────────────────────────── amin ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_toggle_amin(p_prayer_id text, p_customer_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_count int; v_mine boolean;
BEGIN
  PERFORM 1 FROM pos.jumat_berkah_prayers WHERE prayer_id = p_prayer_id AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doa tidak ditemukan'; END IF;
  IF EXISTS (SELECT 1 FROM pos.jumat_berkah_amins WHERE prayer_id = p_prayer_id AND customer_id = p_customer_id) THEN
    DELETE FROM pos.jumat_berkah_amins WHERE prayer_id = p_prayer_id AND customer_id = p_customer_id; v_mine := false;
  ELSE
    INSERT INTO pos.jumat_berkah_amins (prayer_id, customer_id) VALUES (p_prayer_id, p_customer_id); v_mine := true;
  END IF;
  UPDATE pos.jumat_berkah_prayers SET amin_count = (SELECT count(*) FROM pos.jumat_berkah_amins WHERE prayer_id = p_prayer_id) WHERE prayer_id = p_prayer_id
  RETURNING amin_count INTO v_count;
  RETURN jsonb_build_object('prayerId', p_prayer_id, 'aminCount', v_count, 'aminByMe', v_mine);
END $$;

-- ───────────────────────────── donation status (for return page) ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_donation_status(p_donation_id text, p_customer_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pos, public AS $$
  SELECT coalesce((SELECT jsonb_build_object('donationId', d.donation_id, 'status', d.status, 'portions', d.portions, 'amount', d.amount,
    'displayName', d.display_name, 'prayer', d.prayer_text, 'distributionDate', c.distribution_date, 'invoiceUrl', d.invoice_url,
    'prayerStatus', (SELECT status FROM pos.jumat_berkah_prayers WHERE donation_id = d.donation_id))
    FROM pos.jumat_berkah_donations d JOIN pos.jumat_berkah_campaigns c USING (campaign_id)
    WHERE d.donation_id = p_donation_id AND d.customer_id = p_customer_id), '{}'::jsonb)
$$;

-- ───────────────────────────── scheduler tick ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_c pos.jumat_berkah_campaigns; v_closed int := 0; v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_paid int; v_donors int;
BEGIN
  IF NOT (SELECT enabled FROM pos.jumat_berkah_settings WHERE id = 1) THEN RETURN jsonb_build_object('enabled', false); END IF;
  PERFORM pos.jumat_berkah_ensure_campaign();
  UPDATE pos.jumat_berkah_donations SET status = 'expired' WHERE status = 'pending' AND reserved_until <= now() - interval '1 day';
  FOR v_c IN SELECT * FROM pos.jumat_berkah_campaigns WHERE status = 'open' AND closes_at <= now() FOR UPDATE LOOP
    UPDATE pos.jumat_berkah_campaigns SET status = 'closed', updated_at = now() WHERE campaign_id = v_c.campaign_id;
    v_paid := pos.jumat_berkah_paid_portions(v_c.campaign_id);
    SELECT count(DISTINCT customer_id) INTO v_donors FROM pos.jumat_berkah_donations WHERE campaign_id = v_c.campaign_id AND status = 'paid';
    INSERT INTO pos.jumat_berkah_outbox (event_type, dedupe_key, payload)
    VALUES ('closing_recap', 'closing_recap:' || v_c.campaign_id, jsonb_build_object(
      'campaignId', v_c.campaign_id, 'distributionDate', v_c.distribution_date, 'paidPortions', v_paid, 'donors', v_donors, 'target', v_c.target_portions))
    ON CONFLICT (dedupe_key) DO NOTHING;
    v_closed := v_closed + 1;
  END LOOP;
  -- Friday 07:00 WIB reminder for the kitchen.
  FOR v_c IN SELECT * FROM pos.jumat_berkah_campaigns WHERE status = 'closed' AND distribution_date = v_today
             AND extract(hour FROM now() AT TIME ZONE 'Asia/Jakarta') >= 7 LOOP
    INSERT INTO pos.jumat_berkah_outbox (event_type, dedupe_key, payload)
    VALUES ('friday_reminder', 'friday_reminder:' || v_c.campaign_id, jsonb_build_object(
      'campaignId', v_c.campaign_id, 'distributionDate', v_c.distribution_date, 'paidPortions', pos.jumat_berkah_paid_portions(v_c.campaign_id)))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('enabled', true, 'closed', v_closed);
END $$;

-- ───────────────────────────── admin: distribution ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_record_distribution(p_campaign_id text, p_portions_given int, p_location text, p_notes text, p_recorded_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_c pos.jumat_berkah_campaigns; v_paid int; v_donors int; v_photos int;
BEGIN
  SELECT * INTO v_c FROM pos.jumat_berkah_campaigns WHERE campaign_id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kampanye tidak ditemukan'; END IF;
  IF p_portions_given IS NULL OR p_portions_given < 0 THEN RAISE EXCEPTION 'Jumlah porsi dibagikan tidak valid'; END IF;
  INSERT INTO pos.jumat_berkah_distributions (distribution_id, campaign_id, portions_given, location, notes, recorded_by)
  VALUES ('jbx_' || replace(gen_random_uuid()::text, '-', ''), p_campaign_id, p_portions_given, nullif(btrim(p_location), ''), nullif(btrim(p_notes), ''), p_recorded_by)
  ON CONFLICT (campaign_id) DO UPDATE SET portions_given = excluded.portions_given, location = excluded.location, notes = excluded.notes, recorded_by = excluded.recorded_by;
  UPDATE pos.jumat_berkah_campaigns SET status = 'distributed', updated_at = now() WHERE campaign_id = p_campaign_id;
  v_paid := pos.jumat_berkah_paid_portions(p_campaign_id);
  SELECT count(DISTINCT customer_id) INTO v_donors FROM pos.jumat_berkah_donations WHERE campaign_id = p_campaign_id AND status = 'paid';
  SELECT count(*) INTO v_photos FROM pos.jumat_berkah_gallery WHERE campaign_id = p_campaign_id AND is_published;

  INSERT INTO public.pos_notifications (notification_type, priority, title, message, source, target_user_id, dedupe_key, action_type, action_payload, source_app, source_module, entity_type, entity_id)
  SELECT 'jumat_berkah_report', 'normal', 'Laporan Jumat Berkah',
         'Alhamdulillah, ' || p_portions_given || ' porsi sudah dibagikan Jumat ' || to_char(v_c.distribution_date, 'DD/MM/YYYY') || '. Lihat foto dan laporannya.',
         'jumat_berkah', d.customer_id, 'jb_report_' || p_campaign_id || '_' || d.customer_id, 'open_jumat_berkah', jsonb_build_object('campaignId', p_campaign_id),
         'customer', 'jumat_berkah', 'jumat_berkah_campaign', p_campaign_id
  FROM (SELECT DISTINCT customer_id FROM pos.jumat_berkah_donations WHERE campaign_id = p_campaign_id AND status = 'paid') d
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO pos.jumat_berkah_outbox (event_type, dedupe_key, payload)
  VALUES ('distribution_done', 'distribution_done:' || p_campaign_id, jsonb_build_object(
    'campaignId', p_campaign_id, 'distributionDate', v_c.distribution_date, 'portionsGiven', p_portions_given, 'paidPortions', v_paid,
    'donors', v_donors, 'location', nullif(btrim(p_location), ''), 'photos', v_photos))
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'donorsNotified', v_donors);
END $$;

-- ───────────────────────────── outbox claim / ack ─────────────────────────────
CREATE OR REPLACE FUNCTION pos.jumat_berkah_outbox_claim(p_limit int DEFAULT 20)
RETURNS SETOF pos.jumat_berkah_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT outbox_id FROM pos.jumat_berkah_outbox
    WHERE status = 'pending' AND next_attempt_at <= now() AND attempts < 8
    ORDER BY outbox_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE pos.jumat_berkah_outbox o
  SET attempts = o.attempts + 1, next_attempt_at = now() + make_interval(mins => least(60, power(2, o.attempts)::int))
  FROM due WHERE o.outbox_id = due.outbox_id
  RETURNING o.*;
END $$;

CREATE OR REPLACE FUNCTION pos.jumat_berkah_outbox_ack(p_outbox_id bigint, p_ok boolean, p_error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pos, public AS $$
  UPDATE pos.jumat_berkah_outbox
  SET status = CASE WHEN p_ok THEN 'sent' WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END,
      sent_at = CASE WHEN p_ok THEN now() ELSE sent_at END, last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 300) END
  WHERE outbox_id = p_outbox_id
$$;

-- Pending Mayar invoices whose webhook was missed (for reconcile in mayar-payment-processor).
CREATE OR REPLACE FUNCTION pos.jumat_berkah_pending_payments()
RETURNS TABLE(donation_id text, invoice_id text, transaction_id text, amount bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pos, public AS $$
  SELECT donation_id, invoice_id, transaction_id, amount FROM pos.jumat_berkah_donations
  WHERE status IN ('pending', 'expired') AND invoice_id IS NOT NULL AND created_at > now() - interval '3 days'
  ORDER BY created_at LIMIT 100
$$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'jumat_berkah_prayer_is_clean(text)', 'jumat_berkah_ensure_campaign()', 'jumat_berkah_committed(text)', 'jumat_berkah_paid_portions(text)',
    'jumat_berkah_overview(text)', 'jumat_berkah_create_donation(text,int,boolean,text,text)', 'jumat_berkah_attach_invoice(text,text,text,text)',
    'jumat_berkah_settle_donation(text,text,bigint,timestamptz)', 'jumat_berkah_toggle_amin(text,text)', 'jumat_berkah_donation_status(text,text)',
    'jumat_berkah_tick()', 'jumat_berkah_record_distribution(text,int,text,text,text)', 'jumat_berkah_outbox_claim(int)',
    'jumat_berkah_outbox_ack(bigint,boolean,text)', 'jumat_berkah_pending_payments()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION pos.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION pos.%s TO service_role', f);
  END LOOP;
END $grants$;

-- ───────────────────────────── seed prayers (doa pembuka) ─────────────────────────────
INSERT INTO pos.jumat_berkah_prayers (prayer_id, display_name, body, status, is_seed, created_at) VALUES
  ('jbp_seed_01', 'Hamba Allah', 'Semoga setiap suapnya jadi penguat langkah bapak-bapak yang bekerja hari ini.', 'approved', true, now() - interval '20 days'),
  ('jbp_seed_02', 'Hamba Allah', 'Ya Allah, mudahkan rezeki mereka yang menunggu penumpang sejak subuh.', 'approved', true, now() - interval '19 days'),
  ('jbp_seed_03', 'Hamba Allah', 'Semoga makanan ini jadi sebab senyum dan syukur di rumah mereka.', 'approved', true, now() - interval '18 days'),
  ('jbp_seed_04', 'Hamba Allah', 'Untuk kedua orang tua yang sudah tiada, Al-Fatihah.', 'approved', true, now() - interval '17 days'),
  ('jbp_seed_05', 'Hamba Allah', 'Semoga para pedagang kecil diberi dagangan yang laris dan berkah.', 'approved', true, now() - interval '16 days'),
  ('jbp_seed_06', 'Hamba Allah', 'Ya Allah, lindungi mereka yang mencari nafkah di jalan setiap hari.', 'approved', true, now() - interval '15 days'),
  ('jbp_seed_07', 'Hamba Allah', 'Semoga Djiwa Tentram dan semua yang berbagi hari ini diberkahi.', 'approved', true, now() - interval '14 days'),
  ('jbp_seed_08', 'Hamba Allah', 'Semoga yang kenyang hari ini diberi kekuatan untuk esok yang lebih baik.', 'approved', true, now() - interval '13 days'),
  ('jbp_seed_09', 'Hamba Allah', 'Untuk keluarga kecil yang sedang berjuang, semoga dilapangkan jalannya.', 'approved', true, now() - interval '12 days'),
  ('jbp_seed_10', 'Hamba Allah', 'Ya Rabb, balaslah kebaikan ini dengan yang lebih baik bagi semua yang berbagi.', 'approved', true, now() - interval '11 days'),
  ('jbp_seed_11', 'Hamba Allah', 'Semoga para pengamen jalanan selalu dalam penjagaan-Mu.', 'approved', true, now() - interval '10 days'),
  ('jbp_seed_12', 'Hamba Allah', 'Alhamdulillah bisa berbagi di hari Jumat. Semoga menjadi amal jariyah.', 'approved', true, now() - interval '9 days')
ON CONFLICT (prayer_id) DO NOTHING;

-- ───────────────────────────── storage (foto galeri) ─────────────────────────────
-- Publik hanya baca. Unggah hanya lewat edge function jumat-berkah (service_role), tidak ada policy tulis untuk anon.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('jumat-berkah', 'jumat-berkah', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 3145728, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
DROP POLICY IF EXISTS "jumat_berkah_public_select" ON storage.objects;
CREATE POLICY "jumat_berkah_public_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'jumat-berkah');

-- ───────────────────────────── cron ─────────────────────────────
DO $cron$
DECLARE v_job bigint;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname IN ('jumat-berkah-tick', 'jumat-berkah-drain') LOOP
    PERFORM cron.unschedule(v_job);
  END LOOP;
  PERFORM cron.schedule('jumat-berkah-tick', '*/5 * * * *', $job$select pos.jumat_berkah_tick();$job$);
  -- Drain the Telegram outbox every minute through the edge function (token lives in settings, not in git).
  PERFORM cron.schedule('jumat-berkah-drain', '* * * * *', $job$
    select net.http_post(
      url := 'http://kong:8000/functions/v1/jumat-berkah',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-jb-cron', (select cron_token from pos.jumat_berkah_settings where id = 1)),
      body := '{"action":"drain"}'::jsonb)
    where exists (select 1 from pos.jumat_berkah_outbox where status = 'pending' and next_attempt_at <= now())
      and (select enabled from pos.jumat_berkah_settings where id = 1);
  $job$);
END $cron$;

NOTIFY pgrst, 'reload schema';
