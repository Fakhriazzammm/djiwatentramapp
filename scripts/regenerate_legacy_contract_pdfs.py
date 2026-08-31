#!/usr/bin/env python3
"""Regenerate legacy signed contract PDFs from the current V2 template.

Intentionally updates only signed records whose stored contract text still has
legacy placeholders/clauses. Old URLs are retained in raw.legacyContractPdfUrl.
"""
from __future__ import annotations

import io
import json
import os
import re
import subprocess
import textwrap
import uuid
from datetime import date, datetime
from pathlib import Path

import requests
from fpdf import FPDF
from PIL import Image

ROOT = Path('/opt/djiwatentramapp')
ENV_FILE = ROOT / 'apps/pos/.env'
STORAGE_ROOT = Path('/opt/supabase-selfhost/volumes/storage')
FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
FONT_BOLD = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'


def load_env():
    result = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def get(obj, *keys, default=''):
    for key in keys:
        if isinstance(obj, dict) and obj.get(key) not in (None, ''):
            return obj[key]
    return default


def fmt_date(value):
    if not value:
        return '-'
    try:
        d = datetime.fromisoformat(str(value).replace('Z', '+00:00')).date()
        months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
        return f'{d.day} {months[d.month-1]} {d.year}'
    except Exception:
        return str(value)


def money(value):
    try:
        n = int(float(value or 0))
        return f'Rp {n:,}'.replace(',', '.')
    except Exception:
        return 'Rp 0'


def normalize_text(text):
    text = text.replace('\\n', '\n').replace('\\r', '')
    text = text.replace('[ALAMAT_KARYAWAN]', '{{alamat}}')
    text = text.replace('[NAMA_LENGKAP_KARYAWAN]', '{{nama_karyawan}}')
    text = re.sub(r'(?i)bertempat tinggal di\s*-,', 'beralamat sesuai data administrasi karyawan,', text)
    text = text.replace('[Jabatan]', '{{jabatan}}')
    text = re.sub(r'(?i)masa\s+percobaan', 'masa orientasi dan evaluasi kerja', text)
    text = re.sub(
        r'(?is)Perjanjian ini dapat diperpanjang.*?peraturan perundang-undangan\.',
        'Perpanjangan Perjanjian hanya dapat dilakukan berdasarkan kesepakatan tertulis Para Pihak sebelum berakhirnya jangka waktu Perjanjian dan dituangkan dalam perjanjian baru atau addendum sesuai ketentuan peraturan perundang-undangan.',
        text,
    )
    text = re.sub(
        r'(?is)PIHAK PERTAMA berhak mengakhiri hubungan kerja tanpa kewajiban memberikan pesangon apabila PIHAK KEDUA tidak memenuhi standar kinerja yang ditetapkan selama masa orientasi dan evaluasi kerja, sesuai dengan ketentuan peraturan perundang-undangan\.',
        'Evaluasi kinerja selama masa orientasi dan evaluasi kerja dilakukan secara objektif berdasarkan standar kerja yang telah disampaikan kepada PIHAK KEDUA. Setiap tindakan terhadap hubungan kerja dilakukan sesuai kesepakatan Para Pihak dan ketentuan peraturan perundang-undangan.',
        text,
    )
    return text


def make_text(template, app, settings):
    personal = app.get('personal') or {}
    employment = app.get('employment') or {}
    company = settings.get('company') or {}
    onboarding = settings.get('employeeOnboarding') or {}
    signatory = onboarding
    full_name = get(app, 'full_name', default=get(personal, 'fullName', default='Karyawan'))
    address = get(app, 'address', default=get(personal, 'address', default=''))
    if str(address).strip() in ('', '-'):
        address = 'sesuai data administrasi karyawan'
    role = get(employment, 'roleName', 'role_name', default='Karyawan')
    location = get(employment, 'location', default='Djiwa Tentram Centrik')
    start = get(employment, 'startDate', 'start_date', default='')
    end = get(employment, 'endDate', 'end_date', default='')
    monthly = get(employment, 'monthlySalary', 'monthly_salary', default=0)
    daily = get(employment, 'dailyAllowance', 'daily_allowance', default=0)
    shift = get(employment, 'shiftRate', 'shift_rate', default=0)
    company_name = get(company, 'name', default='Djiwa Tentram Centrik Cafe & Resto')
    signatory_name = get(signatory, 'signatoryPersonName', 'signatoryName', default='Mochammad Fakhri Azzam')
    signatory_title = get(signatory, 'signatoryPersonTitle', default='Owner')
    signatory_location = get(signatory, 'signatoryLocation', default='Kota Tasikmalaya')
    vars = {
        '{{nama_karyawan}}': full_name,
        '{{nik}}': get(app, 'identity_number', default=get(personal, 'identityNumber', default='')) or 'sesuai data administrasi karyawan',
        '{{alamat}}': address or 'sesuai data administrasi karyawan',
        '{{tempat_lahir}}': get(app, 'birth_place', default=get(personal, 'placeOfBirth', default='')) or 'sesuai data administrasi karyawan',
        '{{tanggal_lahir}}': fmt_date(get(app, 'birth_date', default=get(personal, 'birthDate', default=''))),
        '{{telepon}}': get(app, 'phone', default=get(personal, 'phone', default='-')),
        '{{nama_perusahaan}}': company_name,
        '{{alamat_perusahaan}}': get(signatory, 'signatoryCompanyAddress', default='-'),
        '{{nib_perusahaan}}': get(signatory, 'signatoryCompanyNIB', default='-'),
        '{{penandatangan}}': signatory_name,
        '{{jabatan_penandatangan}}': signatory_title,
        '{{lokasi_ttd}}': signatory_location,
        '{{jabatan}}': role,
        '{{tanggal_mulai}}': fmt_date(start),
        '{{tanggal_akhir}}': fmt_date(end),
        '{{tipe_kontrak}}': 'PKWT (Perjanjian Kerja Waktu Tertentu)',
        '{{lokasi_kerja}}': location or 'Djiwa Tentram Centrik',
        '{{gaji_pokok}}': money(monthly),
        '{{tunjangan_harian}}': money(daily),
        '{{rate_shift}}': money(shift),
        '{{estimasi_total}}': money(float(monthly or 0) + float(daily or 0) * 22 + float(shift or 0) * 22),
        '{{nomor_dokumen}}': f"PKWT/{get(employment, 'slug', 'username', default='KARYAWAN')}/{str(start)[:4] or date.today().year}",
        '{{versi_dokumen}}': '2.0',
        '{{tanggal_dokumen}}': fmt_date(date.today().isoformat()),
    }
    text = normalize_text(template)
    for key, value in vars.items():
        text = text.replace(key, str(value or '-'))
    text = re.sub(r'\{\{[^}]+\}\}', '-', text)
    text = re.sub(r'\[[A-Z_]+\]', '-', text)
    # The canonical template may already contain a textual signing block. The
    # PDF renderer owns the single final signing block so digital signatures
    # are not duplicated.
    text = re.sub(r'\nMochammad Fakhri Azzam\n(?=[A-Z].*,)', '\n', text, count=1)
    text = re.sub(r'\nPIHAK PERTAMA\s+PIHAK KEDUA.*$', '', text, flags=re.S)
    if 'Lampiran 1' not in text:
        text += (
            '\n\nLampiran 1 — Rincian Kompensasi\n'
            f'Jabatan: {role}\n'
            f'Gaji pokok: {money(monthly)} per bulan\n'
            f'Tunjangan harian/transportasi: {money(daily)} per hari kerja\n'
            f'Rate shift: {money(shift)} per shift\n'
            f'Estimasi total penghasilan bulanan: {money(float(monthly or 0) + float(daily or 0) * 22 + float(shift or 0) * 22)}\n'
            'Pembayaran dilakukan sesuai jadwal penggajian dan ketentuan internal Perusahaan.\n\n'
            'Lampiran 2 — Uraian Tugas dan Standar Evaluasi\n'
            f'Jabatan: {role}\n'
            f'Lokasi kerja: {location or "Djiwa Tentram Centrik"}\n'
            'Uraian tugas, target kerja, standar pelayanan, kedisiplinan, keselamatan kerja, dan indikator evaluasi disampaikan oleh atasan langsung sesuai kebutuhan operasional Perusahaan.\n'
        )
    return text, vars


class ContractPDF(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font('DejaVu', '', 8)
        self.set_text_color(110, 110, 110)
        self.cell(0, 5, f'Halaman {self.page_no()}', align='C')


def make_pdf(text, title, employee_name, employee_sig_url, company_sig_url):
    pdf = ContractPDF(format='A4')
    pdf.add_font('DejaVu', '', FONT)
    pdf.add_font('DejaVu', 'B', FONT_BOLD)
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(18, 16, 18)
    pdf.add_page()
    pdf.set_text_color(28, 28, 28)
    lines = text.splitlines()
    for idx, raw in enumerate(lines):
        line = raw.strip()
        if not line:
            pdf.ln(2)
            continue
        if idx == 0:
            pdf.set_font('DejaVu', 'B', 15)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 8, line.upper(), align='C')
            pdf.ln(1)
            continue
        if idx == 1 and not re.match(r'^(Pasal|Lampiran|BAB)\s', line, re.I):
            pdf.set_font('DejaVu', '', 11)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 6, line.upper(), align='C')
            pdf.ln(5)
            continue
        if re.match(r'^(Pasal|Lampiran|BAB)\s', line, re.I):
            pdf.set_font('DejaVu', 'B', 11.5)
            pdf.ln(4)
            for wrapped in textwrap.wrap(line, width=72, break_long_words=True, break_on_hyphens=False) or ['']:
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 6.5, wrapped)
            pdf.ln(2)
        else:
            pdf.set_font('DejaVu', '', 10.5)
            indent = 4 if re.match(r'^\(?\d+\)', line) or re.match(r'^[a-z]\)', line, re.I) else 0
            for wrapped in textwrap.wrap(line, width=88, break_long_words=True, break_on_hyphens=False) or ['']:
                pdf.set_x(pdf.l_margin)
                pdf.set_left_margin(pdf.l_margin + indent)
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 5.6, wrapped, align='J')
            pdf.set_left_margin(18)
            pdf.ln(1)
    pdf.ln(8)
    pdf.set_font('DejaVu', 'B', 11.5)
    pdf.cell(0, 6, 'TANDA TANGAN PARA PIHAK', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(4)
    pdf.set_font('DejaVu', '', 9.5)
    pdf.cell(0, 5, 'KOTA TASIKMALAYA, sesuai tanggal pada bagian pembukaan', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(4)
    left_x = pdf.l_margin
    right_x = pdf.w - pdf.r_margin - 75
    y = pdf.get_y()
    pdf.set_xy(left_x, y)
    pdf.cell(75, 5, 'Pihak Perusahaan', align='L')
    pdf.set_xy(right_x, y)
    pdf.cell(75, 5, 'Karyawan', align='L')
    y += 7
    for x, url in [(left_x, company_sig_url), (right_x, employee_sig_url)]:
        if url:
            try:
                data = requests.get(url, timeout=5).content
                image = Image.open(io.BytesIO(data)).convert('RGBA')
                buf = io.BytesIO()
                image.save(buf, format='PNG')
                buf.seek(0)
                pdf.image(buf, x=x, y=y, w=45, h=24, keep_aspect_ratio=True)
            except Exception:
                pass
    pdf.set_y(y + 30)
    pdf.set_font('DejaVu', 'B', 10)
    pdf.set_x(left_x)
    pdf.cell(75, 5, 'Mochammad Fakhri Azzam')
    pdf.set_x(right_x)
    pdf.cell(75, 5, employee_name)
    return bytes(pdf.output())


def psql_json(query):
    import subprocess
    result = subprocess.run(
        ['docker', 'exec', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', query],
        check=True, capture_output=True, text=True,
    )
    value = result.stdout.strip()
    return json.loads(value) if value else []


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def psql_exec(query):
    import subprocess
    subprocess.run(
        ['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input=query, check=True, text=True, capture_output=True,
    )


def main():
    env = load_env()
    base_url = env.get('VITE_SUPABASE_URL') or env.get('SUPABASE_URL')
    if not base_url:
        raise SystemExit('Supabase URL not available in apps/pos/.env')
    rows = psql_json("""SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) FROM (
      SELECT raw->'employeeOnboarding'->'contractTemplatesByRoleId'->>'__default__' AS template,
        raw, id, full_name, email, phone, identity_number, address, birth_date, birth_place,
        employment, contract, signature_url, contract_pdf_url, status
      FROM public.employee_onboarding_applications
      WHERE status='approved' AND contract_pdf_url IS NOT NULL AND raw->>'contractPdfVersion'='2.0' ORDER BY updated_at
    ) q;""")
    settings_rows = psql_json("SELECT COALESCE((SELECT raw::text::json FROM public.pos_site_settings LIMIT 1), '{}'::json);")
    settings = settings_rows or {}
    targets = []
    backup = []
    for row in rows:
        template = row.get('template')
        raw, app_id, name, email, phone, identity_number, address = row.get('raw') or {}, row.get('id'), row.get('full_name'), row.get('email'), row.get('phone'), row.get('identity_number'), row.get('address')
        birth_date, birth_place, employment, contract = row.get('birth_date'), row.get('birth_place'), row.get('employment'), row.get('contract')
        signature_url, old_url, status = row.get('signature_url'), row.get('contract_pdf_url'), row.get('status')
        contract_obj = contract or {}
        old_text = contract_obj.get('plainText') or ''
        print(f'generating: {name}', flush=True)
        app = {'id': str(app_id), 'full_name': name, 'email': email, 'phone': phone, 'identity_number': identity_number, 'address': address, 'birth_date': str(birth_date or ''), 'birth_place': birth_place, 'employment': employment or {}, 'contract': contract_obj}
        text, vars = make_text(template or old_text, app, settings)
        employee_url = signature_url
        company_url = (settings.get('employeeOnboarding') or {}).get('signatorySignatureUrl')
        pdf_bytes = make_pdf(text, 'Perjanjian Kerja Waktu Tertentu', name, employee_url, company_url)
        slug = re.sub(r'[^a-z0-9]+', '-', (name or str(app_id)).lower()).strip('-')
        path = f'contracts/v2/{slug}-{str(app_id)[:8]}.pdf'
        object_path = STORAGE_ROOT / 'employee-contracts' / path
        version = str(uuid.uuid4())
        versioned_path = STORAGE_ROOT / 'undefined' / 'self' / 'employee-contracts' / path / version
        temp_path = Path('/tmp') / 'contract-pdf-batch' / path
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.write_bytes(pdf_bytes)
        subprocess.run(['sudo', 'install', '-D', '-m', '0644', str(temp_path), str(versioned_path)], check=True)
        xattr_code = f"import os; p={str(versioned_path)!r}; os.setxattr(p, 'user.supabase.cache-control', b'no-cache'); os.setxattr(p, 'user.supabase.content-type', b'application/pdf')"
        subprocess.run(['sudo', 'python3', '-c', xattr_code], check=True)
        metadata = json.dumps({'eTag': f'"{uuid.uuid4().hex}"', 'size': len(pdf_bytes), 'mimetype': 'application/pdf', 'cacheControl': 'no-cache', 'contentLength': len(pdf_bytes), 'httpStatusCode': 200})
        psql_exec(
            'INSERT INTO storage.objects (bucket_id, name, metadata, version) VALUES '
            f"('employee-contracts', {sql_quote(path)}, {sql_quote(metadata)}::jsonb, {sql_quote(version)}) "
            'ON CONFLICT (bucket_id, name) DO UPDATE SET metadata=EXCLUDED.metadata, version=EXCLUDED.version, updated_at=now();'
        )
        new_url = f'{base_url}/storage/v1/object/public/employee-contracts/{path}'
        new_raw = dict(raw or {})
        new_raw['legacyContractPdfUrl'] = old_url
        new_raw['contractPdfVersion'] = '2.0'
        new_contract = dict(contract_obj)
        new_contract['plainText'] = text
        new_contract['title'] = 'Perjanjian Kerja Waktu Tertentu (PKWT)'
        psql_exec(
            'UPDATE public.employee_onboarding_applications SET '
            f'contract_pdf_url={sql_quote(new_url)}, contract={sql_quote(json.dumps(new_contract))}::jsonb, '
            f'raw={sql_quote(json.dumps(new_raw))}::jsonb, updated_at=now() WHERE id={sql_quote(app_id)};'
        )
        backup.append({'id': str(app_id), 'name': name, 'old_url': old_url, 'new_url': new_url})
        targets.append((name, len(text), new_url))

    Path('/opt/djiwatentramapp/.contract-pdf-regeneration-backup.json').write_text(json.dumps(backup, indent=2))
    print(json.dumps({'regenerated': len(targets), 'targets': targets, 'backup': '/opt/djiwatentramapp/.contract-pdf-regeneration-backup.json'}, indent=2))


if __name__ == '__main__':
    main()
