-- Backfill pengeluaran bot Telegram (yumi-finance-agent) ke public.mgr_expense_drafts.
-- Idempoten: finance_source_id unik. Rentang 180 hari mencegah tanggal OCR rusak
-- (2006/2076) ikut masuk. Jalankan dengan psql -v ON_ERROR_STOP=1 -1.
with src as (
  select
    f.source_id,
    f.merchant,
    f.description,
    f.amount,
    f.category,
    f.payment_method,
    to_timestamp(f.tx_date / 1000.0) as tx_date,
    f.metadata,
    case lower(replace(coalesce(f.category, ''), ' ', '_'))
      when 'bahan_minuman' then 'bahan_minuman'
      when 'bahan_makanan' then 'bahan_makanan'
      when 'bahan_segar' then 'bahan_segar'
      when 'packaging' then 'packaging'
      when 'cleaning' then 'cleaning'
      when 'gas_energi' then 'gas_energi'
      when 'peralatan' then 'peralatan'
      when 'gaji' then 'gaji'
      when 'transport' then 'transport'
      when 'transportasi' then 'transport'
      when 'promosi' then 'promosi'
      when 'pemasaran' then 'promosi'
      when 'sewa' then 'sewa_wifi'
      when 'sewa_wifi' then 'sewa_wifi'
      when 'utilitas' then 'sewa_wifi'
      when 'bahan_baku' then 'bahan_makanan'
      when 'belanja' then 'operasional'
      when 'operasional' then 'operasional'
      else 'lainnya'
    end as mgr_category
  from pos.financial_transactions f
  where f.tx_type = 'expense'
    and f.status = 'completed'
    and f.metadata->>'source' = 'yumi_finance_agent'
    and coalesce(f.category, '') <> 'HPP'
    and f.tx_date >= (extract(epoch from now() - interval '180 days') * 1000)::bigint
    and f.tx_date <= (extract(epoch from now() + interval '1 day') * 1000)::bigint
    and not exists (
      select 1 from public.mgr_expense_drafts d
      where d.finance_source_id = f.source_id
    )
)
insert into public.mgr_expense_drafts (
  channel, created_by, created_by_name, status, photo_url, merchant, tx_date,
  payment_method, items, total, raw_ocr, finance_source_id, created_at
)
select
  'telegram',
  coalesce(nullif(src.metadata->>'telegram_user_id', ''), 'telegram'),
  nullif(regexp_replace(coalesce(src.metadata->>'notes', ''), '^Diproses oleh:\s*', ''), ''),
  'saved',
  nullif(src.metadata->>'receipt_image_url', ''),
  nullif(src.merchant, ''),
  src.tx_date,
  coalesce(nullif(src.payment_method, ''), 'cash'),
  coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(i->>'name', ''), nullif(i->>'rawName', ''), 'Item'),
        'qty', coalesce(nullif(i->>'quantity', '')::numeric, 1),
        'unit', coalesce(nullif(i->>'unit', ''), 'pcs'),
        'price', coalesce(nullif(i->>'price', '')::numeric, 0),
        'total', coalesce(nullif(i->>'total', '')::numeric, 0),
        'category', src.mgr_category
      ))
      from jsonb_array_elements(coalesce(src.metadata->'scanItems', '[]'::jsonb)) i
      where coalesce(i->>'name', i->>'rawName', '') <> ''
    ),
    jsonb_build_array(jsonb_build_object(
      'name', coalesce(nullif(src.merchant, ''), nullif(src.description, ''), 'Pengeluaran'),
      'qty', 1,
      'unit', 'pcs',
      'price', src.amount,
      'total', src.amount,
      'category', src.mgr_category
    ))
  ),
  src.amount,
  src.metadata,
  src.source_id,
  src.tx_date
from src
on conflict (finance_source_id) do nothing;
