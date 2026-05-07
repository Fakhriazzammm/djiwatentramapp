-- ──────────────────────────────────────────────────────────────
-- Migration: Auto-generate source_fingerprint on INSERT
-- Menghitung SHA256 fingerprint dari kombinasi field transaksi
-- untuk mendeteksi duplikat secara konsisten di level DB.
-- ──────────────────────────────────────────────────────────────

-- 1) Function untuk auto-compute fingerprint
create or replace function pos.auto_compute_fingerprint()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Generate fingerprint hanya jika belum diset oleh caller
  if NEW.source_fingerprint is null then
    NEW.source_fingerprint := encode(
      sha256(
        (
          COALESCE(NEW.tx_type, '') || '|' ||
          COALESCE(round(NEW.amount::numeric, 2)::text, '0') || '|' ||
          COALESCE(NEW.category, '') || '|' ||
          COALESCE(NEW.description, '') || '|' ||
          COALESCE(NEW.merchant, '') || '|' ||
          floor(COALESCE(NEW.tx_date, extract(epoch from now())::bigint * 1000) / 60000)::text
        )::bytea
      ),
      'hex'
    );
  end if;
  return NEW;
end;
$$;

-- 2) Trigger BEFORE INSERT
drop trigger if exists trg_auto_compute_fingerprint on pos.financial_transactions;
create trigger trg_auto_compute_fingerprint
  before insert on pos.financial_transactions
  for each row
  execute function pos.auto_compute_fingerprint();

-- 3) Juga pasang trigger di tabel pos.inventory_transactions (yang punya source_fingerprint juga)
create or replace function pos.auto_compute_inventory_fingerprint()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.source_fingerprint is null then
    NEW.source_fingerprint := encode(
      sha256(
        (
          COALESCE(NEW.tx_type, '') || '|' ||
          COALESCE(round(NEW.quantity::numeric, 4)::text, '0') || '|' ||
          COALESCE(NEW.notes, '') || '|' ||
          COALESCE(NEW.inventory_source_id, '') || '|' ||
          floor(COALESCE(NEW.tx_timestamp, extract(epoch from now())::bigint * 1000) / 60000)::text
        )::bytea
      ),
      'hex'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_auto_compute_inventory_fingerprint on pos.inventory_transactions;
create trigger trg_auto_compute_inventory_fingerprint
  before insert on pos.inventory_transactions
  for each row
  execute function pos.auto_compute_inventory_fingerprint();
