-- Serah terima uang tunai antar shift.
-- Saat tutup shift kasir mencatat uang yang dipisah/disetor dan uang yang ditinggal di laci sebagai modal shift berikutnya.
-- Bentuk: {"counted": n, "separated": n, "kept": n, "recordedAt": ms}
ALTER TABLE pos.shifts ADD COLUMN IF NOT EXISTS cash_handover jsonb;
COMMENT ON COLUMN pos.shifts.cash_handover IS 'Serah terima tunai saat tutup shift: counted, separated (disetor/dipisah), kept (modal shift berikutnya).';
NOTIFY pgrst, 'reload schema';
