import type { RecruitmentCandidate } from "@/lib/recruitment-types";

type ExportRow = {
  ID: string;
  "Airtable ID": string;
  Kandidat: string;
  "Jenis kelamin": string;
  "Tanggal lahir": string;
  Email: string;
  "Nomor telepon": string;
  "Sosial media": string;
  Posisi: string;
  "Tipe kerja": string;
  Catatan: string;
  Status: string;
  "Tanggal melamar": string;
  "Dibuat pada": string;
  CV: string;
};

const text = (value: unknown) => String(value ?? "").trim() || "—";
const dateStamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

export function recruitmentExportRows(candidates: RecruitmentCandidate[]): ExportRow[] {
  return candidates.map((candidate) => ({
    ID: text(candidate.id),
    "Airtable ID": text(candidate.airtable_id),
    Kandidat: text(candidate.nama_lengkap),
    "Jenis kelamin": text(candidate.jenis_kelamin),
    "Tanggal lahir": text(candidate.tanggal_lahir),
    Email: text(candidate.email),
    "Nomor telepon": text(candidate.nomor_telepon),
    "Sosial media": text(candidate.sosial_media),
    Posisi: text(candidate.posisi_dilamar),
    "Tipe kerja": text(candidate.tipe_kerja),
    Catatan: text(candidate.notes),
    Status: text(candidate.status),
    "Tanggal melamar": text(candidate.application_date),
    "Dibuat pada": text(candidate.created_at),
    CV: candidate.cv_url ? "Tersedia" : "Tidak tersedia",
  }));
}

export function exportRecruitmentCsv(candidates: RecruitmentCandidate[]) {
  const rows = recruitmentExportRows(candidates);
  const headers = Object.keys(rows[0] ?? { Kandidat: "" });
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = `\uFEFF${[headers, ...rows.map((row) => headers.map((header) => escape(row[header as keyof ExportRow])))]
    .map((row) => row.join(";"))
    .join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `djiwa-rekrutmen-kandidat-${dateStamp()}.csv`);
}

export async function exportRecruitmentSpreadsheet(candidates: RecruitmentCandidate[]) {
  const XLSX = await import("xlsx");
  const rows = recruitmentExportRows(candidates);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 26 }, { wch: 30 }, { wch: 18 }, { wch: 20 },
    { wch: 15 }, { wch: 24 }, { wch: 18 }, { wch: 16 },
  ];
  const range = sheet["!ref"] ?? "A1";
  sheet["!autofilter"] = { ref: range };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomRight", state: "frozen" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Kandidat");
  XLSX.writeFile(workbook, `djiwa-rekrutmen-kandidat-${dateStamp()}.xlsx`);
}

export async function exportRecruitmentPdf(candidates: RecruitmentCandidate[]) {
  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
  const rows = recruitmentExportRows(candidates);
  doc.setProperties({ title: "Daftar Kandidat Rekrutmen Djiwa Tentram", subject: "Export kandidat" });
  doc.addImage("/logo-djiwa.png", "PNG", 14, 8, 24, 14);
  doc.setTextColor(26, 93, 198);
  doc.setFontSize(15);
  doc.text("Djiwa Tentram Cafe & Resto", 43, 15);
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(10);
  doc.text(`Daftar Kandidat · ${rows.length} data · ${dateStamp()}`, 43, 22);
  autoTable(doc, {
    startY: 30,
    head: [["Kandidat", "Email", "Nomor telepon", "Posisi", "Tipe kerja", "Status", "Tanggal melamar", "CV"]],
    body: rows.map((row) => [row.Kandidat, row.Email, row["Nomor telepon"], row.Posisi, row["Tipe kerja"], row.Status, row["Tanggal melamar"], row.CV]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2, textColor: [35, 43, 55], lineColor: [224, 230, 238], lineWidth: 0.15 },
    headStyles: { fillColor: [26, 93, 198], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 14, right: 14 },
    didDrawPage: ({ pageNumber }) => { doc.setFontSize(8); doc.setTextColor(100, 110, 125); doc.text(`Djiwa Tentram · Rekrutmen · Halaman ${pageNumber}`, 14, 202); },
  });
  doc.save(`djiwa-rekrutmen-kandidat-${dateStamp()}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
