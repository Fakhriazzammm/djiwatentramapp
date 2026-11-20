import { useMemo } from "react";
import { KolAnnouncementComposer, type AnnouncementApi } from "../../../../packages/djiwaapps-web-shared/src/components/kol-announcement-composer";
import { api, ApiError } from "../lib/api";

/** Pengumuman KOL untuk Manager: sama dengan Admin (form, pratinjau portal KOL, riwayat statistik baca). */
const BASE = "/api/manager/kol-announcements";
const ERRORS: Record<string, string> = {
  INVALID_ANNOUNCEMENT: "Pengumuman belum valid. Isi judul (min. 3 huruf) dan isi (min. 5 huruf).", CAMPAIGN_REQUIRED: "Pilih kampanye tujuan.",
  RECIPIENTS_REQUIRED: "Pilih minimal satu KOL.", UNAUTHORIZED: "Sesi berakhir. Masuk ulang.", FORBIDDEN: "Hanya Manager yang bisa mengirim pengumuman KOL.",
};
const wrap = async <T,>(run: () => Promise<{ data: T }>): Promise<T> => {
  try { return (await run()).data; } catch (e) { throw new Error(e instanceof ApiError ? ERRORS[e.code] || e.code : "Permintaan belum berhasil."); }
};

export function KolAnnouncementsView() {
  const client = useMemo<AnnouncementApi>(() => ({
    load: () => wrap(() => api(BASE)),
    send: (input) => wrap(() => api(BASE, { method: "POST", body: input })),
    archive: async (id) => { await wrap(() => api(`${BASE}/${id}/archive`, { method: "POST", body: {} })); },
  }), []);
  return <div style={{ padding: 4 }}><KolAnnouncementComposer api={client} /></div>;
}
