-- =============================================================================
-- Fix RLS policies on contract_approvals for Better Auth compatibility
-- =============================================================================
-- Masalah: App menggunakan Better Auth (bukan Supabase Auth), jadi
-- auth.role() selalu 'anon'. Policy lama pakai auth.role() = 'authenticated'
-- yang tidak pernah match, sehingga tidak ada yang bisa akses dari frontend.
--
-- Fix: Ganti semua policy ke anon, authenticated dengan using(true) / with check(true)
-- =============================================================================

-- Drop existing policies (semua masih pakai auth.role() = 'authenticated')
drop policy if exists "Contract approvals are readable by authenticated users" on public.contract_approvals;
drop policy if exists "Contract approvals can be inserted by authenticated users" on public.contract_approvals;
drop policy if exists "Contract approvals can be updated by authenticated users" on public.contract_approvals;

-- Buat ulang dengan anon policies (sama seperti employee_onboarding_applications)

-- SELECT: allow read by anyone (anon key)
create policy "contract_approvals_anon_select"
  on public.contract_approvals for select to anon, authenticated
  using (true);

-- INSERT: allow insert from frontend (Better Auth uses anon key)
create policy "contract_approvals_anon_insert"
  on public.contract_approvals for insert to anon, authenticated
  with check (true);

-- UPDATE: allow update from frontend (Better Auth uses anon key)
create policy "contract_approvals_anon_update"
  on public.contract_approvals for update to anon, authenticated
  using (true)
  with check (true);

-- DELETE: tidak ada policy delete (pertahankan dari migration asli — tidak ada)
