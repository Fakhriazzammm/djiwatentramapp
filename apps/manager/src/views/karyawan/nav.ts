import { createContext, useContext } from "react";
import { toast } from "sonner";

export const SUBPAGES = ["ringkasan", "data", "kehadiran", "jadwal", "payroll", "dokumen", "cuti", "laporan"] as const;
export type SubPage = (typeof SUBPAGES)[number];

export const KaryawanNavContext = createContext<(sub: SubPage) => void>(() => undefined);

const MAP: Record<string, SubPage> = {
	"/admin/karyawan": "ringkasan",
	"/admin/karyawan/data": "data",
	"/admin/karyawan/kehadiran": "kehadiran",
	"/admin/karyawan/kehadiran/jadwal": "jadwal",
	"/admin/karyawan/payroll": "payroll",
	"/admin/karyawan/onboarding/kontrak": "dokumen",
	"/admin/karyawan/cuti-izin": "cuti",
	"/admin/karyawan/laporan": "laporan",
};

/** Pengganti useNavigate: tautan antar halaman Karyawan tetap bekerja; tujuan khusus Admin memberi petunjuk. */
export function useNavigate() {
	const go = useContext(KaryawanNavContext);
	return ({ to }: { to: string }) => {
		const sub = MAP[to.replace(/\/$/, "")];
		if (sub) go(sub);
		else toast.info("Fitur ini tersedia di Admin (admin.djiwatentram.web.id).");
	};
}
