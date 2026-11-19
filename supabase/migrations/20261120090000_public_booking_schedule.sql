-- Jadwal booking publik per tanggal: siapa sudah booking, kebutuhannya, jam, dan jumlah tamu.
-- Hanya dibaca lewat Edge Function public-booking (service_role); tidak membuka tabel ke anon.
-- Tidak menampilkan telepon, email, catatan, atau token. Nama berasal dari akun login (Google/Better Auth).

create or replace function public.get_public_booking_schedule(
  p_slug text,
  p_from text,
  p_to text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_now double precision := extract(epoch from now()) * 1000;
  v_rows jsonb;
begin
  if nullif(trim(p_slug), '') is null or p_from !~ '^\d{4}-\d{2}-\d{2}$' or p_to !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'slug, from, and to are required';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.date, t."arrivalTime" nulls last), '[]'::jsonb)
    into v_rows
  from (
    select
      bo.booking_date as date,
      bo.arrival_time as "arrivalTime",
      coalesce(bo.guest_count, 0) as "guestCount",
      coalesce(bo.table_count, 0) as "tableCount",
      bo.customer_name as "customerName",
      coalesce(
        nullif(trim(bo.custom_answers ->> 'Jenis acara lainnya'), ''),
        nullif(trim(bo.custom_answers ->> 'Jenis acara label'), ''),
        nullif(trim(bo.custom_answers ->> 'Tipe booking label'), ''),
        'Booking'
      ) as purpose,
      case when bo.booking_status = 'pending' then 'pending' else 'confirmed' end as status
    from pos.booking_orders bo
    where bo.slug = trim(p_slug)
      and bo.booking_date between p_from and p_to
      and bo.booking_status not in ('cancelled', 'expired', 'no_show')
      and (bo.booking_status <> 'pending' or bo.guest_expires_at is null or bo.guest_expires_at > v_now)
    order by bo.booking_date, bo.arrival_time
    limit 1000
  ) t;

  return v_rows;
end;
$$;

revoke all on function public.get_public_booking_schedule(text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_booking_schedule(text, text, text) to service_role;
