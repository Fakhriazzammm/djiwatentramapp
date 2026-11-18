-- KOL visit: SOW (Scope of Work) berversi + email transaksional + notifikasi portal.
-- Satu pemicu di database menangani semua jalur konfirmasi (admin, manager, endpoint lama): saat status booking menjadi
-- 'confirmed' SOW aktif disalin ke booking, email masuk antrean, dan creator mendapat notifikasi. Idempoten dan additive.

/* ---------- Pengaturan kunjungan ---------- */
create table if not exists pos.kol_visit_settings (
  id integer primary key default 1 check (id = 1),
  cafe_name text not null default 'Djiwa Tentram Cafe & Resto - Tasikmalaya',
  address text not null default '',
  maps_url text not null default '',
  wa_admin text not null default '',
  wa_manager text not null default '',
  reply_to text not null default '',
  post_deadline_days integer not null default 7 check (post_deadline_days between 1 and 60),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into pos.kol_visit_settings(id, address, maps_url, wa_admin, reply_to)
values (1, 'Jalan Bojong Tengah No. 34, Tasikmalaya', 'https://maps.app.goo.gl/UhvbAfqZ7fcTUgfD6', '085156399831', 'hello@mail.djiwatentram.web.id')
on conflict (id) do nothing;

/* ---------- SOW berversi ---------- */
create table if not exists pos.kol_sow_versions (
  id bigserial primary key,
  version integer not null unique,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 12),
  closing text not null default '' check (char_length(closing) <= 1000),
  note text check (note is null or char_length(note) <= 500),
  is_active boolean not null default false,
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);
create unique index if not exists idx_kol_sow_one_active on pos.kol_sow_versions ((true)) where is_active;

alter table pos.kol_visit_bookings
  add column if not exists sow_version integer,
  add column if not exists sow_snapshot jsonb,
  add column if not exists sow_customized boolean not null default false,
  add column if not exists post_deadline date;

/* ---------- Antrean email ---------- */
create table if not exists pos.kol_email_outbox (
  id bigserial primary key,
  kind text not null check (kind in ('visit_confirmed', 'visit_cancelled', 'visit_reminder', 'sow_updated')),
  booking_id bigint references pos.kol_visit_bookings(id) on delete cascade,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  to_email text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kol_email_outbox_due on pos.kol_email_outbox(status, scheduled_at);
create index if not exists idx_kol_email_outbox_booking on pos.kol_email_outbox(booking_id, kind, created_at desc);

/* ---------- Isi email: ringkasan booking untuk template ---------- */
create or replace function pos.kol_visit_payload(b pos.kol_visit_bookings)
returns jsonb language sql stable security definer set search_path = pos, public, pg_catalog as $$
  select jsonb_build_object(
    'bookingId', b.id,
    'name', coalesce(nullif(btrim(p.display_name), ''), c.name),
    'date', b.booking_date,
    'time', to_char(b.booking_time, 'HH24:MI'),
    'note', b.admin_note,
    'sow', b.sow_snapshot,
    'sowVersion', b.sow_version,
    'postDeadline', b.post_deadline,
    'cafeName', s.cafe_name,
    'address', s.address,
    'mapsUrl', s.maps_url,
    'waAdmin', s.wa_admin,
    'waManager', s.wa_manager,
    'portalUrl', 'https://kol.djiwatentram.web.id/visit'
  )
  from pos.kol_creators c
  left join pos.kol_profiles p on p.kol_id = c.source_id
  cross join pos.kol_visit_settings s
  where c.source_id = b.kol_id and s.id = 1
$$;

/* Antrean satu email dengan penanganan email kosong/tidak valid. */
create or replace function pos.kol_enqueue_email(p_kind text, p_booking pos.kol_visit_bookings, p_dedupe text, p_delay interval default interval '30 seconds')
returns bigint language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare v_email text; v_status text := 'pending'; v_error text; v_id bigint;
begin
  select nullif(btrim(email), '') into v_email from pos.kol_private_contacts where kol_id = p_booking.kol_id;
  if v_email is null then v_status := 'skipped'; v_error := 'EMAIL_TIDAK_ADA';
  elsif v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_status := 'skipped'; v_error := 'EMAIL_TIDAK_VALID';
  end if;
  insert into pos.kol_email_outbox(kind, booking_id, kol_id, to_email, payload, dedupe_key, status, last_error, scheduled_at)
  values (p_kind, p_booking.id, p_booking.kol_id, v_email, pos.kol_visit_payload(p_booking), p_dedupe, v_status, v_error, now() + p_delay)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

/* ---------- Pemicu status booking ---------- */
create or replace function pos.kol_visit_before_status() returns trigger
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare v_sow pos.kol_sow_versions%rowtype; v_days integer;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    select post_deadline_days into v_days from pos.kol_visit_settings where id = 1;
    v_days := coalesce(v_days, 7);
    if new.sow_snapshot is null or not new.sow_customized then
      select * into v_sow from pos.kol_sow_versions where is_active limit 1;
      if found then
        new.sow_version := v_sow.version;
        new.sow_snapshot := jsonb_build_object('title', v_sow.title, 'sections', v_sow.sections, 'closing', v_sow.closing, 'days', v_days);
      end if;
    end if;
    new.post_deadline := new.booking_date + v_days;
  end if;
  return new;
end $$;
drop trigger if exists trg_kol_visit_before_status on pos.kol_visit_bookings;
create trigger trg_kol_visit_before_status before update of status on pos.kol_visit_bookings
  for each row execute function pos.kol_visit_before_status();

create or replace function pos.kol_visit_after_status() returns trigger
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare v_when text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_when := to_char(new.booking_date, 'DD-MM-YYYY') || ' pukul ' || to_char(new.booking_time, 'HH24.MI') || ' WIB';
  if new.status = 'confirmed' then
    perform pos.kol_enqueue_email('visit_confirmed', new, 'visit_confirmed:' || new.id);
    insert into pos.kol_notifications(kol_id, type, title, body, entity_type, entity_id, dedupe_key)
    values (new.kol_id, 'visit_confirmed', 'Visit terkonfirmasi', 'Jadwal visit kamu ' || v_when || ' sudah dikonfirmasi. Lihat Scope of Work di halaman Visit.', 'visit_booking', new.id::text, 'visit_confirmed:' || new.id)
    on conflict (dedupe_key) do nothing;
  elsif new.status = 'cancelled' then
    update pos.kol_email_outbox set status = 'skipped', last_error = 'BOOKING_DIBATALKAN', updated_at = now()
     where booking_id = new.id and kind in ('visit_confirmed', 'visit_reminder', 'sow_updated') and status = 'pending';
    perform pos.kol_enqueue_email('visit_cancelled', new, 'visit_cancelled:' || new.id);
    insert into pos.kol_notifications(kol_id, type, title, body, entity_type, entity_id, dedupe_key)
    values (new.kol_id, 'visit_cancelled', 'Visit dibatalkan', 'Jadwal visit ' || v_when || ' dibatalkan. Kamu bisa memilih jadwal baru di halaman Visit.', 'visit_booking', new.id::text, 'visit_cancelled:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_kol_visit_after_status on pos.kol_visit_bookings;
create trigger trg_kol_visit_after_status after update of status on pos.kol_visit_bookings
  for each row execute function pos.kol_visit_after_status();

/* ---------- Validasi isi SOW ---------- */
create or replace function pos.kol_sow_check(p_sections jsonb) returns void language plpgsql immutable as $$
declare s jsonb; i jsonb;
begin
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) not between 1 and 12 then
    raise exception using errcode = 'P0001', message = 'SOW_SECTIONS_INVALID';
  end if;
  for s in select * from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(s) <> 'object' or char_length(btrim(coalesce(s->>'title', ''))) not between 1 and 120
       or jsonb_typeof(s->'items') <> 'array' or jsonb_array_length(s->'items') not between 1 and 40 then
      raise exception using errcode = 'P0001', message = 'SOW_SECTION_INVALID';
    end if;
    for i in select * from jsonb_array_elements(s->'items') loop
      if jsonb_typeof(i) <> 'string' or char_length(btrim(i #>> '{}')) not between 1 and 500 then
        raise exception using errcode = 'P0001', message = 'SOW_ITEM_INVALID';
      end if;
    end loop;
  end loop;
end $$;

/* Setelah SOW sebuah booking berubah: email yang masih antre dibuat ulang isinya, dan email "SOW diperbarui"
   hanya dikirim ke creator yang sudah menerima email konfirmasi (supaya tidak menerima dua email sekaligus). */
create or replace function pos.kol_after_sow_change(p_booking pos.kol_visit_bookings, p_notify boolean, p_dedupe text) returns void
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
begin
  update pos.kol_email_outbox set payload = pos.kol_visit_payload(p_booking), updated_at = now()
   where booking_id = p_booking.id and kind in ('visit_confirmed', 'visit_reminder', 'sow_updated') and status = 'pending';
  if p_notify and p_booking.status = 'confirmed'
     and exists (select 1 from pos.kol_email_outbox where booking_id = p_booking.id and kind = 'visit_confirmed' and status = 'sent') then
    perform pos.kol_enqueue_email('sow_updated', p_booking, p_dedupe);
  end if;
end $$;

/* ---------- Terbitkan versi SOW baru ---------- */
create or replace function pos.kol_sow_publish(p_title text, p_sections jsonb, p_closing text, p_note text, p_actor text, p_apply boolean)
returns table(version integer, applied integer)
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare v_next integer; v_days integer; v_applied integer := 0; b pos.kol_visit_bookings%rowtype; v_snapshot jsonb;
begin
  perform pos.kol_sow_check(p_sections);
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 160 then
    raise exception using errcode = 'P0001', message = 'SOW_TITLE_INVALID';
  end if;
  lock table pos.kol_sow_versions in share row exclusive mode;
  select coalesce(max(v.version), 0) + 1 into v_next from pos.kol_sow_versions v;
  update pos.kol_sow_versions set is_active = false where is_active;
  insert into pos.kol_sow_versions(version, title, sections, closing, note, is_active, created_by)
  values (v_next, btrim(p_title), p_sections, coalesce(p_closing, ''), nullif(btrim(coalesce(p_note, '')), ''), true, coalesce(nullif(btrim(p_actor), ''), 'admin'));
  if p_apply then
    select post_deadline_days into v_days from pos.kol_visit_settings where id = 1;
    v_snapshot := jsonb_build_object('title', btrim(p_title), 'sections', p_sections, 'closing', coalesce(p_closing, ''), 'days', coalesce(v_days, 7));
    for b in select * from pos.kol_visit_bookings
              where status = 'confirmed' and not sow_customized and booking_date >= (now() at time zone 'Asia/Jakarta')::date for update loop
      update pos.kol_visit_bookings set sow_version = v_next, sow_snapshot = v_snapshot where id = b.id returning * into b;
      perform pos.kol_after_sow_change(b, true, 'sow_updated:' || b.id || ':v' || v_next);
      v_applied := v_applied + 1;
    end loop;
  end if;
  return query select v_next, v_applied;
end $$;

/* ---------- SOW per booking ---------- */
create or replace function pos.kol_booking_sow_set(p_booking_id bigint, p_title text, p_sections jsonb, p_closing text, p_notify boolean)
returns void language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare b pos.kol_visit_bookings%rowtype; v_days integer;
begin
  perform pos.kol_sow_check(p_sections);
  select * into b from pos.kol_visit_bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'BOOKING_NOT_FOUND'; end if;
  select post_deadline_days into v_days from pos.kol_visit_settings where id = 1;
  update pos.kol_visit_bookings
     set sow_snapshot = jsonb_build_object('title', btrim(p_title), 'sections', p_sections, 'closing', coalesce(p_closing, ''), 'days', coalesce(v_days, 7)), sow_customized = true
   where id = p_booking_id returning * into b;
  perform pos.kol_after_sow_change(b, p_notify, 'sow_updated:' || b.id || ':c' || floor(extract(epoch from clock_timestamp()))::bigint);
end $$;

create or replace function pos.kol_booking_sow_sync(p_booking_id bigint, p_notify boolean)
returns void language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare b pos.kol_visit_bookings%rowtype; v_sow pos.kol_sow_versions%rowtype; v_days integer;
begin
  select * into v_sow from pos.kol_sow_versions where is_active limit 1;
  if not found then raise exception using errcode = 'P0001', message = 'SOW_NOT_FOUND'; end if;
  select post_deadline_days into v_days from pos.kol_visit_settings where id = 1;
  update pos.kol_visit_bookings
     set sow_version = v_sow.version, sow_customized = false,
         sow_snapshot = jsonb_build_object('title', v_sow.title, 'sections', v_sow.sections, 'closing', v_sow.closing, 'days', coalesce(v_days, 7))
   where id = p_booking_id returning * into b;
  if not found then raise exception using errcode = 'P0001', message = 'BOOKING_NOT_FOUND'; end if;
  perform pos.kol_after_sow_change(b, p_notify, 'sow_updated:' || b.id || ':s' || floor(extract(epoch from clock_timestamp()))::bigint);
end $$;

/* ---------- Kirim ulang / batalkan email ---------- */
create or replace function pos.kol_email_resend(p_booking_id bigint, p_kind text default 'visit_confirmed')
returns bigint language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare b pos.kol_visit_bookings%rowtype;
begin
  if p_kind not in ('visit_confirmed', 'visit_cancelled', 'visit_reminder', 'sow_updated') then
    raise exception using errcode = 'P0001', message = 'EMAIL_KIND_INVALID';
  end if;
  select * into b from pos.kol_visit_bookings where id = p_booking_id;
  if not found then raise exception using errcode = 'P0001', message = 'BOOKING_NOT_FOUND'; end if;
  return pos.kol_enqueue_email(p_kind, b, p_kind || ':' || b.id || ':r' || floor(extract(epoch from clock_timestamp()))::bigint, interval '0 seconds');
end $$;

create or replace function pos.kol_email_skip(p_outbox_id bigint) returns boolean
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
begin
  update pos.kol_email_outbox set status = 'skipped', last_error = 'DIBATALKAN_ADMIN', updated_at = now() where id = p_outbox_id and status = 'pending';
  return found;
end $$;

/* ---------- Pengingat H-1 (dipanggil worker; hanya setelah pukul 09.00 WIB) ---------- */
create or replace function pos.kol_enqueue_visit_reminders() returns integer
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare b pos.kol_visit_bookings%rowtype; n integer := 0;
begin
  if extract(hour from (now() at time zone 'Asia/Jakarta')) < 9 then return 0; end if;
  for b in select * from pos.kol_visit_bookings
            where status = 'confirmed' and booking_date = (now() at time zone 'Asia/Jakarta')::date + 1 loop
    if pos.kol_enqueue_email('visit_reminder', b, 'visit_reminder:' || b.id, interval '0 seconds') is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

/* ---------- Worker mengambil antrean ---------- */
create or replace function pos.kol_outbox_claim(p_limit integer default 15) returns setof pos.kol_email_outbox
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
begin
  update pos.kol_email_outbox set status = 'pending', updated_at = now() where status = 'sending' and updated_at < now() - interval '5 minutes' and attempts < 5;
  return query
  with picked as (
    select id from pos.kol_email_outbox where status = 'pending' and scheduled_at <= now() order by scheduled_at, id limit greatest(1, least(p_limit, 50)) for update skip locked)
  update pos.kol_email_outbox o set status = 'sending', attempts = o.attempts + 1, updated_at = now()
    from picked where o.id = picked.id returning o.*;
end $$;

/* ---------- SOW versi 1 (SOW terbaru 18 Nov 2026) ---------- */
insert into pos.kol_sow_versions(version, title, sections, closing, note, is_active, created_by)
select 1, 'Scope of Work',
  jsonb_build_array(
    jsonb_build_object('title', 'Scope of Work', 'items', jsonb_build_array(
      '1x visit ke Djiwa Tentram',
      '1x video TikTok, lalu video yang sama di-mirror ke Instagram Reels',
      'Tag/mention akun Djiwa Tentram dan lokasi Djiwa Tentram Cafe & Resto - Tasikmalaya',
      'Highlight pengalaman menggunakan Djiwa App, mulai dari login/member, self-order, pilih menu/meja, sampai checkout',
      'Highlight value harga secara natural, seperti benefit diskon hingga 50% melalui Djiwa App sesuai program yang sedang aktif, atau All Menu Rp15.000 pada jam Happy Hour yang berlaku')),
    jsonb_build_object('title', 'Complimentary untuk Kakak', 'items', jsonb_build_array('2 makanan', '2 minuman')),
    jsonb_build_object('title', 'Catatan', 'items', jsonb_build_array(
      'Untuk konsep dan gaya konten, bebas mengikuti ciri khas Kakak sebagai kreator supaya hasilnya tetap natural dan autentik.',
      'Konten diharapkan tayang maksimal {{hari_tayang}} hari setelah visit.'))),
  'Kalau ada bagian SOW yang ingin didiskusikan, boleh banget disampaikan ya, Kak.',
  'SOW awal (update 18 Nov 2026)', true, 'system'
where not exists (select 1 from pos.kol_sow_versions);

/* ---------- Hak akses: hanya service_role ---------- */
revoke all on pos.kol_visit_settings, pos.kol_sow_versions, pos.kol_email_outbox from public, anon, authenticated;
grant all on pos.kol_visit_settings, pos.kol_sow_versions, pos.kol_email_outbox to service_role;
grant usage, select on sequence pos.kol_sow_versions_id_seq, pos.kol_email_outbox_id_seq to service_role;
revoke all on function pos.kol_after_sow_change(pos.kol_visit_bookings, boolean, text), pos.kol_visit_payload(pos.kol_visit_bookings), pos.kol_enqueue_email(text, pos.kol_visit_bookings, text, interval),
  pos.kol_sow_check(jsonb), pos.kol_sow_publish(text, jsonb, text, text, text, boolean), pos.kol_booking_sow_set(bigint, text, jsonb, text, boolean),
  pos.kol_booking_sow_sync(bigint, boolean), pos.kol_email_resend(bigint, text), pos.kol_email_skip(bigint), pos.kol_enqueue_visit_reminders(),
  pos.kol_outbox_claim(integer) from public, anon, authenticated;
grant execute on function pos.kol_after_sow_change(pos.kol_visit_bookings, boolean, text), pos.kol_visit_payload(pos.kol_visit_bookings), pos.kol_enqueue_email(text, pos.kol_visit_bookings, text, interval),
  pos.kol_sow_check(jsonb), pos.kol_sow_publish(text, jsonb, text, text, text, boolean), pos.kol_booking_sow_set(bigint, text, jsonb, text, boolean),
  pos.kol_booking_sow_sync(bigint, boolean), pos.kol_email_resend(bigint, text), pos.kol_email_skip(bigint), pos.kol_enqueue_visit_reminders(),
  pos.kol_outbox_claim(integer) to service_role;
notify pgrst, 'reload schema';
