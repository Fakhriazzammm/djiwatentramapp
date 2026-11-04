// Pesan Telegram khusus Jumat Berkah. Teks polos (tanpa parse_mode) supaya doa donatur tidak bisa menyisipkan markup.

export type OutboxEvent = { event_type: string; payload: Record<string, unknown> };
export type TelegramTarget = "transaction" | "kitchen";
export type TelegramMessage = { targets: TelegramTarget[]; text: string };

const rupiah = (value: unknown) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const num = (value: unknown) => Number(value || 0);
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function formatFridayDate(value: unknown): string {
  const raw = str(value);
  if (!raw) return "-";
  const date = new Date(`${raw.slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

function progress(paid: unknown, target: unknown) {
  const t = Math.max(1, num(target));
  return `${num(paid)}/${num(target)} porsi (${Math.min(100, Math.floor((num(paid) * 100) / t))}%)`;
}

export function buildTelegramMessage(event: OutboxEvent): TelegramMessage | null {
  const p = event.payload ?? {};
  const header = "JUMAT BERKAH";
  switch (event.event_type) {
    case "donation_paid": {
      const lines = [
        `${header} · Sedekah masuk`,
        `Donatur: ${str(p.donorName) || "-"}${p.showName === false ? " (tampil sebagai Hamba Allah)" : ""}`,
        `${num(p.portions)} porsi · ${rupiah(p.amount)}`,
        `Dibagikan: ${formatFridayDate(p.distributionDate)}`,
        `Progres: ${progress(p.paidPortions, p.target)}`,
      ];
      if (str(p.prayer)) lines.push(`Doa: "${str(p.prayer)}"`);
      return { targets: ["transaction"], text: lines.join("\n") };
    }
    case "milestone":
      return {
        targets: ["transaction", "kitchen"],
        text: `${header} · ${num(p.percent) >= 100 ? "Kuota penuh" : `${num(p.percent)}% terkumpul`}\n${progress(p.paidPortions, p.target)}\nDibagikan: ${formatFridayDate(p.distributionDate)}`,
      };
    case "closing_recap":
      return {
        targets: ["kitchen", "transaction"],
        text: [
          `${header} · Pesanan ditutup`,
          `MASAK ${num(p.paidPortions)} porsi untuk ${formatFridayDate(p.distributionDate)}`,
          `Donatur: ${num(p.donors)} orang · target ${num(p.target)} porsi`,
          "Program khusus: bukan antrean kasir biasa.",
        ].join("\n"),
      };
    case "friday_reminder":
      return {
        targets: ["kitchen"],
        text: `${header} · Pengingat hari ini\nSiapkan ${num(p.paidPortions)} porsi untuk dibagikan hari ini (${formatFridayDate(p.distributionDate)}).`,
      };
    case "distribution_done": {
      const lines = [
        `${header} · Laporan pembagian`,
        `${num(p.portionsGiven)} dari ${num(p.paidPortions)} porsi sudah dibagikan`,
        `Donatur: ${num(p.donors)} orang`,
      ];
      if (str(p.location)) lines.push(`Lokasi: ${str(p.location)}`);
      if (num(p.photos) > 0) lines.push(`Foto di galeri: ${num(p.photos)}`);
      return { targets: ["transaction", "kitchen"], text: lines.join("\n") };
    }
    case "test":
      return { targets: ["transaction", "kitchen"], text: `${header} · Tes notifikasi\nJika pesan ini terbaca, grup sudah terhubung.` };
    default:
      return null;
  }
}
