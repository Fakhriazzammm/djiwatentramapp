begin;

-- Kontrak lama masih menyimpan URL Supabase self-hosted di domain lama
-- (supabase.yumme.id) yang sertifikat/domainnya sudah tidak dipakai.
-- Samakan ke domain aktif supaya tombol "Buka PDF" di Admin/Manager/Karyawan berfungsi.
update public.employee_onboarding_applications
set contract_pdf_url = replace(
      contract_pdf_url,
      'https://supabase.yumme.id',
      'https://supabase.djiwatentram.web.id'
    ),
    raw = case
      when raw->>'legacyContractPdfUrl' like 'https://supabase.yumme.id/%'
        then jsonb_set(
          raw,
          '{legacyContractPdfUrl}',
          to_jsonb(replace(
            raw->>'legacyContractPdfUrl',
            'https://supabase.yumme.id',
            'https://supabase.djiwatentram.web.id'
          ))
        )
      else raw
    end
where contract_pdf_url like 'https://supabase.yumme.id/%'
   or raw->>'legacyContractPdfUrl' like 'https://supabase.yumme.id/%';

commit;
