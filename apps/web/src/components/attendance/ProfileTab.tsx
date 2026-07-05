import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Lock, Clock, Download, FileText, TrendingUp, History,
  Bell, Check, LogOut, ChevronDown, Camera, ShieldCheck, KeyRound, X, Calendar,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonalSchedule } from "@/components/attendance/PersonalSchedule";
import { PayslipDetailCard } from "@/components/attendance/PayslipDetailCard";
import { generatePayslipPDF, type PayslipBreakdown } from "@/lib/payslip-pdf";
import { createClient } from "@/lib/client";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Normalize Indonesian month names for dedup
const normPeriod = (name: string) => {
  const idMonths: Record<string, string> = {
    januari: "january", februari: "february", maret: "march", mei: "may",
    juni: "june", juli: "july", agustus: "august", oktober: "october",
    nopember: "november", desember: "december",
  };
  let n = name.toLowerCase().trim();
  for (const [id, en] of Object.entries(idMonths)) {
    n = n.replace(id, en);
  }
  return n;
};

interface ProfileTabProps {
  staff: any;
  username: string;
  isUnlocked: boolean;
  privateData: any;
  stats: any;
  logs: any[];
  myPayslips: any[];
  livePayslip: any;
  contractData: any;
  isLoadingContract: boolean;
  settings: any;
  token: string | null;
  requiresPinChange: boolean;
  selectedMonth: number;
  selectedYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onLogout: () => Promise<void>;
  onDownloadPayslip: (payslip: any) => void;
  onEditProfile: () => void;
}

export function ProfileTab({
  staff, username, isUnlocked, privateData, stats, logs,
  myPayslips, livePayslip, contractData, isLoadingContract,
  settings, token, requiresPinChange,
  selectedMonth, selectedYear, onMonthChange, onYearChange,
  onLogout, onDownloadPayslip, onEditProfile,
}: ProfileTabProps) {
  const navigate = useNavigate();
  const [showAllPayslips, setShowAllPayslips] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const storeName = settings?.storeName || "TENTREM KOFFIE";
  const storeAddress = settings?.storeAddress || "";

  // ── Edit mode states ──
  const [newPin, setNewPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const updatePinMutation = { mutateAsync: async (args: any) => {
    const supabase = createClient();
    const { error } = await supabase.functions.invoke("yumi-auth", {
      body: { action: "changePin", token: args.token, oldPin: args.oldPin, newPin: args.newPin },
    });
    if (error) throw new Error(error.message || "Gagal ganti PIN");
  }} as any;

  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editIdentityNumber, setEditIdentityNumber] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editPlaceOfBirth, setEditPlaceOfBirth] = useState("");
  const [editEmergencyContactName, setEditEmergencyContactName] = useState("");
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editBankAccount, setEditBankAccount] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const updateProfileMutation = { mutateAsync: async (args: any) => {
    const supabase = createClient();
    const { error } = await supabase.functions.invoke("yumi-auth", {
      body: { action: "updateProfile", ...args },
    });
    if (error) throw new Error(error.message || "Gagal update profil");
  }} as any;

  // Sync edit fields from props
  useEffect(() => {
    if (staff) {
      setEditName(staff.name || "");
      setEditUsername(staff.slug || "");
      setEditSlug(staff.slug || "");
    }
    if (privateData?.raw) {
      const r = privateData.raw as any;
      setEditEmail(privateData.email || "");
      setEditPhone(r.phone || "");
      setEditIdentityNumber(r.identityNumber || "");
      setEditAddress(r.address || "");
      setEditBirthDate(r.birthDate || "");
      setEditPlaceOfBirth(r.placeOfBirth || "");
      setEditEmergencyContactName(r.emergencyContactName || "");
      setEditEmergencyContactPhone(r.emergencyContactPhone || "");
      setEditBankName(String(r.bankName ?? ""));
      setEditBankAccount(String(r.bankAccount ?? ""));
    }
  }, [staff, privateData]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header Unlocked */}
      <div className="flex items-center gap-4 rounded-2xl bg-primary/5 p-4 border border-primary/10">
        {staff.photoUrl ? (
          <img src={staff.photoUrl} alt={staff.name} className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-lg" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary text-2xl font-black text-primary-foreground shadow-lg">
            {staff.name?.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">{staff.name}</h1>
          <p className="font-bold text-primary text-[10px] uppercase">{staff.roleName}</p>
          <p className="text-[10px] text-muted-foreground leading-none">{privateData?.username}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onLogout} className="rounded-lg h-8 w-8">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Period Selector */}
      <div className="flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Periode</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-transparent text-sm font-black focus:outline-none"
            value={selectedMonth}
            onChange={(e) => onMonthChange(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            className="bg-transparent text-sm font-black focus:outline-none"
            value={selectedYear}
            onChange={(e) => onYearChange(parseInt(e.target.value))}
          >
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <Clock className="h-4 w-4" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Total Jam</p>
          <p className="mt-0.5 text-xl font-black">{stats?.totalHours ?? 0} <span className="text-[10px] font-normal text-muted-foreground">jam</span></p>
          <p className="text-[9px] text-orange-600 font-bold">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Kehadiran</p>
          <p className="mt-0.5 text-xl font-black">{stats?.attendanceRate ?? 0}%</p>
          <p className="text-[9px] text-emerald-600 font-bold">
            {stats ? (stats.attendanceRate > 90 ? "Sangat Baik" : "Baik") : "..."}
          </p>
        </div>
      </div>

      {/* Personal Schedule */}
      {isUnlocked && staff && (
        <PersonalSchedule
          userId={staff._id}
          month={selectedMonth}
          year={selectedYear}
        />
      )}

      {/* Kontrak Kerja */}
      {isUnlocked && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 px-2 font-bold uppercase tracking-wider text-sm">
            <FileText className="h-4 w-4 text-emerald-500" />
            Kontrak Kerja
          </h3>
          <div className="rounded-2xl border bg-card p-4">
            {isLoadingContract ? (
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="h-8 w-full rounded-lg bg-muted mt-3" />
              </div>
            ) : contractData ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Status</span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Aktif</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Jenis</span>
                    <span className="text-xs font-bold">PKWT - Full Time</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Durasi</span>
                    <span className="text-xs font-bold">6 Bulan</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Mulai</span>
                    <span className="text-xs font-bold">28 Mei 2026</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Berakhir</span>
                    <span className="text-xs font-bold">28 November 2026</span>
                  </div>
                </div>
                {contractData.contract_pdf_url && (
                  <Button
                    variant="outline" size="sm"
                    className="w-full mt-3 rounded-lg text-[10px] font-bold h-8"
                    onClick={() => window.open(contractData.contract_pdf_url, "_blank")}
                  >
                    <Download className="mr-1.5 h-3 w-3" />
                    Download Kontrak PDF
                  </Button>
                )}
              </>
            ) : (
              <div className="py-4 text-center">
                <p className="text-[11px] font-medium text-muted-foreground">Belum ada kontrak kerja</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slip Gaji */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
            <FileText className="h-4 w-4 text-primary" />
            Slip Gaji {showAllPayslips ? "" : "Terakhir"}
          </h3>
          {myPayslips && myPayslips.length > 3 && (
            <Button variant="link" size="sm" className="text-xs" onClick={() => setShowAllPayslips(!showAllPayslips)}>
              {showAllPayslips ? "Sembunyikan" : "Lihat Semua"}
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {!myPayslips && !livePayslip ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-muted" />
                    <div className="space-y-1 flex-1">
                      <div className="h-3 w-32 rounded bg-muted" />
                      <div className="h-2.5 w-20 rounded bg-muted" />
                    </div>
                    <div className="h-5 w-16 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </>
          ) : (() => {
            const all: any[] = [];
            const seenPeriods = new Set<string>();
            if (livePayslip) {
              all.push(livePayslip);
              seenPeriods.add(normPeriod(livePayslip.period_name));
            }
            if (myPayslips) myPayslips.forEach((p: any) => {
              if ((p.gross_pay??0) > 0 || (p.net_pay??0) > 0) {
                if (!seenPeriods.has(normPeriod(p.period_name))) {
                  all.push(p);
                }
              }
            });
            const display = showAllPayslips ? all : all.slice(0, 3);
            return display.map((p: any) => (
              <PayslipDetailCard key={p.id} payslip={p} onDownload={onDownloadPayslip} />
            ));
          })()}
        </div>
      </div>

      {/* Riwayat Absensi */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 px-2 font-bold uppercase tracking-wider text-sm">
          <History className="h-4 w-4 text-primary" />
          Log Kehadiran {MONTHS[selectedMonth - 1]} {selectedYear}
        </h3>
        <div className="rounded-2xl border bg-card overflow-hidden">
          {!logs || logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Tidak ada data absensi untuk periode ini.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log: any) => (
                <div key={log._id} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[10px] font-bold flex-col leading-tight shrink-0">
                      <span>{new Date(log.timestamp).getDate()}</span>
                      <span className="text-[8px] opacity-60">{MONTHS[new Date(log.timestamp).getMonth()].substring(0, 3).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-bold capitalize text-xs">{log.type === "check_in" ? "Masuk" : "Keluar"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1.5 font-bold text-[10px] ${log.type === "check_in" ? "text-emerald-600" : "text-orange-600"}`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${log.type === "check_in" ? "bg-emerald-500" : "bg-orange-500"}`} />
                      {log.type === "check_in" ? "MASUK" : "KELUAR"}
                    </div>
                    {log.notes && <p className="text-[9px] text-muted-foreground truncate max-w-[80px] mt-0.5">{log.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grup Telegram */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 px-2 font-bold uppercase tracking-wider text-sm">
          <Bell className="h-4 w-4 text-sky-500" />
          Grup Telegram
        </h3>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 text-lg">💬</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Gabung Grup Karyawan</p>
              <p className="mt-0.5 text-[11px] font-medium text-sky-700">
                Dapatkan pengumuman, jadwal, dan info terbaru dari tim.
              </p>
              <Button
                variant="outline" size="sm"
                className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3 border-sky-300 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                onClick={() => window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank")}
              >
                GABUNG GRUP
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
