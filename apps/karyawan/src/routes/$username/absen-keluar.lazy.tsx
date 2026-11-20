import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useStaffProfile } from "../$username.lazy";
import { DsButton, DsIconButton, DsPageTitle } from "@djiwaapps/web-shared/components/ds";
import { VerifyIdentity, type VerifyPayload } from "@/components/karyawan/VerifyIdentity";
import { getPosition } from "@/lib/attendance-api";
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Camera, Upload,
  Loader2, Sparkles, AlertTriangle, ArrowLeft, X, Image, Brush,
  Save, Search, Lightbulb, CookingPot, Armchair, Toilet
} from "lucide-react";
import {
  submitClosingViaEdge,
  type KebersihanSubmitArea,
  prepareKebersihanPhoto,
  type OpnameItem,
  type ClosingEdgeResponse,
} from "../../hooks/use-closing-submit";

// ─── Types ───

type KebersihanArea = {
  id: string;
  label: string;
  icon: "cooking" | "seating" | "toilet";
  status: "bersih" | "perlu_perbaikan";
  /** Object URL — hanya untuk preview di layar. */
  foto: string | null;
  /** File aslinya; ini yang dikirim saat submit. */
  fotoFile?: File | null;
  catatan: string;
};

// ─── Search Schema ───

const searchSchema = z.object({
  shift: z.string().optional(),
  ts: z.string().optional(),
});

// ─── Constants ───


const AREAS_KEBERSIHAN: KebersihanArea[] = [
  { id: "bar_kitchen", label: "Bar & Kitchen", icon: "cooking", status: "bersih", foto: null, catatan: "" },
  { id: "area_customer", label: "Area Customer", icon: "seating", status: "bersih", foto: null, catatan: "" },
  { id: "wc", label: "Toilet/WC", icon: "toilet", status: "bersih", foto: null, catatan: "" },
];

const KEBERSIHAN_ICONS = { cooking: CookingPot, seating: Armchair, toilet: Toilet };

// ─── Route ───

export const Route = createLazyFileRoute("/$username/absen-keluar")({
  component: ClosingPage,
  validateSearch: searchSchema,
});

// ═══════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════

function ClosingPage() {
  const { staff, username, authUser, today } = useStaffProfile();
  const search = useSearch({ from: Route.id as any });
  const navigate = useNavigate();

  // Determine shift name: from URL param, or from latest check-in, or fallback
  const [shiftName, setShiftName] = useState<string>((search as any)?.shift || "");
  useEffect(() => {
    if (shiftName) return; // already have it from URL
    const fetchShift = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("pos_attendance_logs")
          .select("shiftName")
          .eq("type", "check_in")
          .eq("userId", staff?._id || username)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.shiftName) setShiftName(data.shiftName);
        else setShiftName("Shift");
      } catch {
        setShiftName("Shift");
      }
    };
    fetchShift();
  }, [staff, username, shiftName]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pendingRef = useRef<{ items: OpnameItem[]; kebersihan: KebersihanSubmitArea[] } | null>(null);

  // Peran dikirim ke closing; opname bahan kini dikerjakan kasir saat tutup shift.
  const role = useMemo<"bar" | "kitchen" | null>(() => {
    const r = (staff?.roleName || "").toLowerCase();
    if (r.includes("bar")) return "bar";
    if (r.includes("kitchen") || r.includes("chef") || r.includes("cook") || r.includes("dapur")) return "kitchen";
    return null;
  }, [staff]);


  // Refs to child sections for data extraction
  const kebersihanRef = useRef<{ getAreas: () => KebersihanArea[] }>(null);

  const userId = staff?._id || username;
  const userName = staff?.name || username;
  const roleName = staff?.roleName || "";

  return (
    <div className="flex flex-col min-h-full">
      {verifying && !submitDone && (
        <div className="kx-full" role="dialog" aria-modal="true" aria-label="Verifikasi absen keluar">
          <div className="kx-full-in">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0 10px" }}>
              <button type="button" className="ds-iconbtn" aria-label="Kembali" onClick={() => setVerifying(false)}><ArrowLeft className="h-4 w-4" /></button>
              <h1 className="ds-page" style={{ margin: 0, fontSize: 26 }}>Verifikasi</h1>
            </div>
            <p className="ds-sub" style={{ margin: "0 4px 6px" }}>Absen keluar · closing sudah terisi</p>
            <VerifyIdentity hasFace={Boolean(authUser?.hasFace)} submit={finishClosing} />
          </div>
        </div>
      )}
      {submitDone && (
        <div className="kx-full" role="dialog" aria-modal="true" aria-label="Absen keluar tercatat">
          <div className="kx-full-in">
            <div className="kx-ok"><Check /></div>
            <h2 className="ds-title kx-cen" style={{ margin: "4px 0 2px" }}>Absen keluar tercatat</h2>
            <p className="ds-sub kx-cen">{new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" })} · {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":")}</p>
            <div className="ds-group" style={{ marginTop: 12 }}>
              {today.lastIn && <div className="kx-kv"><span>Masuk</span><b>{new Date(today.lastIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":")}</b></div>}
              <div className="kx-kv"><span>Shift</span><b>{shiftName}</b></div>
              {today.lastIn && <div className="kx-kv"><span>Jam kerja</span><b>{(() => { const m = Math.max(0, Math.round((Date.now() - today.lastIn) / 60000)); return `${Math.floor(m / 60)}j ${m % 60}m`; })()}</b></div>}
              <div className="kx-kv"><span>Closing</span><b>Kebersihan terkirim</b></div>
            </div>
            <button type="button" className="ds-btn ds-btn--block" onClick={() => navigate({ to: `/${username}/beranda` })}>Ke Beranda</button>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--block" style={{ marginTop: 8 }} onClick={() => navigate({ to: `/${username}/rekap-absensi` })}>Lihat rekap</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="shrink-0 mb-3">
        <DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={() => navigate({ to: `/${username}/beranda` })}>‹</DsIconButton>}>Closing shift</DsPageTitle>
        <p className="ds-sub" style={{ margin: "-6px 4px 8px" }}>{userName} · {shiftName}</p>
        {/* Error Banner */}
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-rose-50 border border-rose-200 p-4 mb-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
              <div>
                <p className="font-bold text-rose-800 text-xs">Gagal menyimpan</p>
                <p className="text-xs text-rose-600 mt-0.5">{submitError}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {!submitDone && (
        <>
          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {(
                <motion.div
                  key="kebersihan"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <KebersihanSection ref={kebersihanRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Aksi */}
          <div className="shrink-0 pt-2 pb-2">
            <DsButton block disabled={isSubmitting} onClick={handleSubmit}>{isSubmitting ? "Menyimpan…" : "Kirim laporan & verifikasi"}</DsButton>
          </div>
        </>
      )}
    </div>
  );

  // ── Handle Submit ──────────────────────────────────────────

  async function finishClosing(v: VerifyPayload) {
    const pending = pendingRef.current;
    if (!pending) throw new Error("Data closing hilang. Kirim ulang laporan.");
    const geo = await getPosition();
    if (!geo.ok) throw new Error(geo.reason === "denied" ? "Izin lokasi ditolak atau terblokir. Izinkan lokasi untuk situs ini; jika muncul “Situs ini tidak dapat meminta izin Anda”, tutup gelembung/overlay di layar lalu coba lagi." : "Lokasi belum terbaca. Nyalakan GPS dan mode akurasi tinggi, lalu coba lagi.");
    try {
      await submitClosingViaEdge({
        userId, userName, roleName, shiftName, role,
        items: pending.items,
        source: "karyawan_app",
        kebersihan: pending.kebersihan,
        pinCode: v.method === "pin" ? v.pin : undefined,
        faceDescriptor: v.method === "face" ? v.faceDescriptor : undefined,
        photo: v.photo,
        verifyMethod: v.method,
        location: geo.point,
      });
    } catch (err: any) {
      throw new Error(err?.message || "Gagal memproses closing");
    }
    setVerifying(false);
    setSubmitDone(true);
    today.reload();
  }

  async function handleSubmit() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // 2. Kebersihan: kecilkan foto lalu ikutkan ke payload. Sebelumnya
      //    data ini hanya hidup di state dan hilang begitu submit.
      const areasKebersihan = kebersihanRef.current?.getAreas() ?? [];
      const kebersihan = await Promise.all(
        areasKebersihan.map(async (a) => ({
          id: a.id,
          label: a.label,
          status: a.status,
          catatan: a.catatan,
          ...(a.fotoFile ? await prepareKebersihanPhoto(a.fotoFile) : {}),
        })),
      );

      // 3. Simpan payload, lalu minta verifikasi (wajah/PIN) + lokasi sebelum absen keluar.
      pendingRef.current = { items: [], kebersihan };
      setVerifying(true);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Terjadi kesalahan";
      setSubmitError(msg);
      console.error("[closing] handleSubmit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }
}

// ═══════════════════════════════════════════
//  KEBERSIHAN SECTION
// ═══════════════════════════════════════════

const KebersihanSection = forwardRef<{ getAreas: () => KebersihanArea[] }>(function KebersihanSection(_props, ref) {
  const [areas, setAreas] = useState<KebersihanArea[]>(AREAS_KEBERSIHAN);
  const [saved, setSaved] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Expose getAreas to parent via ref
  useImperativeHandle(ref, () => ({
    getAreas: () => areas,
  }));

  const updateStatus = (id: string, status: "bersih" | "perlu_perbaikan") => {
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
  };

  const updateCatatan = (id: string, catatan: string) => {
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, catatan } : a))
    );
  };

  const handleFileSelect = (id: string, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, foto: url, fotoFile: file } : a))
    );
  };

  const triggerFileInput = (id: string) => {
    fileInputRefs.current[id]?.click();
  };

  const removeFoto = (id: string) => {
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, foto: null, fotoFile: null } : a))
    );
  };

  const completedCount = areas.filter((a) => a.status === "bersih").length;
  const photoCount = areas.filter((a) => a.foto !== null).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="flex items-center gap-1.5 font-black text-sm"><Brush className="h-4 w-4" /> Checklist Kebersihan</p>
            <p className="text-[10px] text-muted-foreground font-medium">
              {completedCount}/3 area bersih — {photoCount} foto
            </p>
          </div>
        </div>
      </div>

      {/* Area Cards */}
      {areas.map((area) => {
        const AreaIcon = KEBERSIHAN_ICONS[area.icon];
        return (
        <div
          key={area.id}
          className={`rounded-2xl border p-4 transition-all ${
            area.status === "perlu_perbaikan"
              ? "border-amber-200 bg-amber-50/30"
              : area.foto
              ? "border-emerald-200 bg-emerald-50/30"
              : "border-border bg-background"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AreaIcon className="h-5 w-5 text-muted-foreground" />
              <p className="font-bold text-sm">{area.label}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => updateStatus(area.id, "bersih")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-[10px] font-bold transition-all ${
                  area.status === "bersih"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700"
                }`}
              >
                <Check className="h-3.5 w-3.5" /> Bersih
              </button>
              <button
                onClick={() => updateStatus(area.id, "perlu_perbaikan")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-[10px] font-bold transition-all ${
                  area.status === "perlu_perbaikan"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-amber-100 hover:text-amber-700"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Perlu Perbaikan
              </button>
            </div>
          </div>

          {/* Photo Upload */}
          <div className="flex items-center gap-3">
            {area.foto ? (
              <div className="relative">
                <img
                  src={area.foto}
                  alt={area.label}
                  className="h-16 w-16 rounded-xl object-cover border border-border"
                />
                <button
                  onClick={() => removeFoto(area.id)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => triggerFileInput(area.id)}
                className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
              >
                <Camera className="h-6 w-6" />
              </button>
            )}
            <input
              ref={(el) => { fileInputRefs.current[area.id] = el; }}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelect(area.id, e.target.files?.[0] || null)}
            />

            {/* Catatan */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Catatan (opsional)"
                value={area.catatan}
                onChange={(e) => updateCatatan(area.id, e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition-all focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
              />
              {area.status === "perlu_perbaikan" && !area.catatan && (
                <p className="flex items-center gap-1 text-[10px] text-amber-500 mt-1">
                  <Lightbulb className="h-3 w-3" /> Tambahkan catatan untuk tim maintenance
                </p>
              )}
            </div>
          </div>
        </div>
        );
      })}

      {/* Save Button */}
      <button
        onClick={() => setSaved(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-all active:scale-[0.98]"
      >
        <Save className="h-4 w-4" /> Simpan Checklist Kebersihan
      </button>

      {saved && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center"
        >
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
            <Check className="h-4 w-4 shrink-0" /> Checklist kebersihan tersimpan! Tekan "Kirim Laporan Closing" untuk absen keluar.
          </p>
        </motion.div>
      )}
    </div>
  );
});
