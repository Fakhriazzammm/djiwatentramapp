-- Struk pesanan lewat email + link ulasan Google (otomasi transaksional). Dibuat nonaktif; admin mengaktifkannya dari Email Marketing > Otomasi.
INSERT INTO pos.email_automations (key, name, description, kind, delay_hours, daily_limit) VALUES
  ('order_receipt', 'Struk pesanan + ulasan Google', 'Pesanan yang sudah dibayar dikirimi struk lewat email beserta ajakan ulasan Google (khusus pembayaran QRIS dan Djiwa Pay).', 'transactional', 0, 300)
ON CONFLICT (key) DO NOTHING;
