-- Login ulang setelah kehilangan data auth: pakai ulang pos.customers yang sudah ada.
--
-- Konteks: public."user" pernah terhapus massal (2026-11-02..03). Pelanggan yang login Google
-- lagi mendapat user baru dengan ID acak, sehingga pos.customers baru yang kosong dibuat dan
-- data lama (pesanan, saldo, poin, kunjungan) tidak terbaca.
--
-- Perbaikan: sebelum user baru disimpan, bila ada pos.customers dengan email sama yang
-- source_id-nya belum dipegang user mana pun, user baru memakai source_id tersebut.
-- Hanya untuk email yang sudah TERVERIFIKASI (mis. Google) agar pendaftaran email/password
-- dengan email orang lain tidak bisa mengambil alih data pelanggan.
CREATE OR REPLACE FUNCTION public.betterauth_adopt_existing_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pos, pg_temp
AS $$
DECLARE
  v_source_id text;
BEGIN
  IF NEW.user_type IS DISTINCT FROM 'customer'
     OR NEW."emailVerified" IS NOT TRUE
     OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.source_id INTO v_source_id
  FROM pos.customers c
  WHERE lower(c.email) = lower(NEW.email)
    AND c.source_id <> NEW.id
    AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = c.source_id)
  ORDER BY c.total_orders DESC NULLS LAST, c.created_at ASC
  LIMIT 1;

  IF v_source_id IS NOT NULL THEN
    NEW.id := v_source_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_betterauth_adopt_existing_customer ON public."user";
CREATE TRIGGER trg_betterauth_adopt_existing_customer
  BEFORE INSERT ON public."user"
  FOR EACH ROW EXECUTE FUNCTION public.betterauth_adopt_existing_customer();
