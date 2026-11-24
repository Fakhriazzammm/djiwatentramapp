-- Struk pesanan lewat email + link ulasan Google (otomasi transaksional). Dibuat nonaktif; admin mengaktifkannya dari Email Marketing > Otomasi.
INSERT INTO pos.email_automations (key, name, description, kind, delay_hours, daily_limit) VALUES
  ('order_receipt', 'Struk pesanan + ulasan Google', 'Pesanan yang sudah dibayar dikirimi struk lewat email beserta ajakan ulasan Google (khusus pembayaran QRIS dan Djiwa Pay).', 'transactional', 0, 300)
ON CONFLICT (key) DO NOTHING;

-- Ajakan ulasan Google untuk pelanggan berizin yang pernah memesan (sekali per orang, bertahap).
INSERT INTO pos.email_automations (key, name, description, kind, delay_hours, daily_limit) VALUES
  ('review_invite', 'Ajakan ulasan Google', 'Pelanggan berizin pemasaran yang pernah memesan diajak menulis ulasan di Google. Sekali per orang, dikirim bertahap.', 'marketing', 0, 100)
ON CONFLICT (key) DO NOTHING;
