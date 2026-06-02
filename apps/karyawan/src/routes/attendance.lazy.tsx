import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useHybridCurrentlyInStore, useHybridPublicUsers, useHybridSiteSettings } from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { FaceRecognition, preloadFaceModels } from "@/components/auth/FaceRecognition";
import { PersonalSchedule } from "@yumipos/web-shared/components/attendance/PersonalSchedule";
import { useHybridVerifyHomePin, useHybridClockIn, useHybridClockOut } from "@yumipos/web-shared";
import { motion } from "framer-motion";
import { Loader2, UserCheck, Navigation, Coffee, Camera, KeyRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/attendance")({
  component: KaryawanAttendancePage,
});

// ── Haversine distance ──
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function KaryawanAttendancePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"select" | "choose" | "face" | "pin" | "success">("select");
  const [refreshCount, setRefreshCount] = useState(0);
  const [pinCode, setPinCode] = useState("");
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
    hasFace: boolean;
    isCurrentlyIn: boolean;
    roleName: string;
  } | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isClocking, setIsClocking] = useState(false);

  // ── Data hooks ──
  const siteSettings = useHybridSiteSettings();
  const allStaff = useHybridPublicUsers();
  const currentlyIn = useHybridCurrentlyInStore(refreshCount);
  const verifyPin = useHybridVerifyHomePin();
  const clockIn = useHybridClockIn();
  const clockOut = useHybridClockOut();

  // ── Shift detection ──
  const shiftSchedules = siteSettings?.shiftSettings?.shiftSchedules || [];
  const detectedShift = useMemo(() => {
    if (!shiftSchedules.length) return null;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const shift of shiftSchedules) {
      if (!shift.openTime || !shift.closeTime) continue;
      const [openHour, openMin] = String(shift.openTime).split(":").map(Number);
      const [closeHour, closeMin] = String(shift.closeTime).split(":").map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      if (openMinutes <= closeMinutes) {
        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) return shift;
      } else {
        if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) return shift;
      }
    }

    let closest: any = null;
    let minDelta = Infinity;
    for (const shift of shiftSchedules) {
      if (!shift.openTime) continue;
      const [openHour, openMin] = String(shift.openTime).split(":").map(Number);
      let delta = openHour * 60 + openMin - currentMinutes;
      if (delta < 0) delta += 1440;
      if (delta < minDelta) { minDelta = delta; closest = { ...shift, upcoming: true }; }
    }
    return closest;
  }, [shiftSchedules]);

  const isShiftActive = detectedShift && !(detectedShift as any).upcoming;

  // ── Geolocation ──
  const distance = useMemo(() => {
    if (!selectedUser || !siteSettings?.attendanceLat || !siteSettings?.attendanceLng) return null;
    if (!userLocation) return null;
    return haversineDistance(userLocation.lat, userLocation.lng, siteSettings.attendanceLat, siteSettings.attendanceLng);
  }, [selectedUser, userLocation, siteSettings]);

  const isWithinRadius = distance !== null && distance <= (siteSettings?.attendanceRadius ?? 50);
  const locationForClock = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined;

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError("Browser tidak mendukung geolokasi."); return; }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationError(null);
        setIsLoadingLocation(false);
      },
      (err) => {
        if (err.code === err.POSITION_UNAVAILABLE) {
          setTimeout(() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(null); setIsLoadingLocation(false); },
              () => { setLocationError("Izin lokasi diperlukan untuk absensi."); setIsLoadingLocation(false); },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
          }, 2000);
        } else {
          setLocationError("Izin lokasi diperlukan untuk absensi.");
          setIsLoadingLocation(false);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  // ── Preload face models when on select screen ──
  useEffect(() => { if (step === "select") preloadFaceModels(); }, [step]);

  // ── User selection ──
  const handleUserSelect = (staff: any) => {
    const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
    setSelectedUser({ id: staff._id, name: staff.name, hasFace: !!staff.hasFace, isCurrentlyIn: !!isCurrentlyIn, roleName: staff.roleName || "" });
    setStep("choose");
  };

  // ── Clock in/out handler ──
  const handleClock = async (faceDescriptor?: Float32Array) => {
    if (!selectedUser || isClocking) return;
    setIsClocking(true);
    try {
      if (siteSettings?.attendanceLat && !userLocation) {
        toast.error("Lokasi belum siap. Aktifkan GPS lalu coba lagi.");
        setIsClocking(false);
        return;
      }
      if (siteSettings?.attendanceLat && !isWithinRadius) {
        toast.error("Gagal: Anda berada di luar radius kafe.");
        setIsClocking(false);
        return;
      }

      toast.loading(selectedUser.isCurrentlyIn ? "Proses Keluar..." : "Proses Masuk...", { id: "clocking" });
      const payload = {
        userId: selectedUser.id,
        faceDescriptor: faceDescriptor ?? null,
        pinCode: pinCode || undefined,
        location: locationForClock,
      };
      if (selectedUser.isCurrentlyIn) {
        await clockOut(payload);
      } else {
        await clockIn({ ...payload, shiftName: (detectedShift as any)?.name || undefined, shiftOpenTimeSnapshot: (detectedShift as any)?.openTime || undefined });
      }
      toast.dismiss("clocking");
      setRefreshCount((prev) => prev + 1);
      setStep("success");
      setTimeout(() => { navigate({ to: `/${selectedUser.id}` as any }); }, 3000);
    } catch (error: any) {
      toast.dismiss();
      toast.error(error?.message || "Gagal memproses absensi");
    } finally {
      setIsClocking(false);
    }
  };

  // ── PIN submission ──
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinCode.length !== 6) return;
    setIsVerifyingPin(true);
    try {
      const result = await verifyPin({ pinCode, userId: selectedUser?.id });
      if (selectedUser && result.userId !== selectedUser.id) {
        toast.error("PIN ini bukan milik Anda.");
        setIsVerifyingPin(false);
        return;
      }
      await handleClock();
    } catch (error: any) {
      toast.error(error?.message || "PIN salah.");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // ── Back to staff selection ──
  const handleBack = () => {
    setStep("select");
    setSelectedUser(null);
    setPinCode("");
  };

  // ── Render ──
  return (
    <div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20 pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border/30 bg-background/90 px-3 backdrop-blur-lg">
        <div className="flex items-center gap-2">
          {step !== "select" && step !== "success" && (
            <button onClick={handleBack} className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-muted transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card text-primary shadow-sm">
            <Coffee className="h-4 w-4" />
          </div>
          <h1 className="text-sm font-bold tracking-tight">Absensi</h1>
        </div>
        <div className="flex items-center gap-2">
          {isLoadingLocation ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-[10px] font-bold text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" /> Lokasi...
            </div>
          ) : siteSettings?.attendanceLat ? (
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 border text-[9px] font-bold ${isWithinRadius ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              <div className={`h-1.5 w-1.5 rounded-full ${isWithinRadius ? "bg-emerald-500" : "bg-red-500"}`} />
              {isWithinRadius ? "Dalam Area" : "Luar Area"}
            </div>
          ) : null}
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col p-3">
        {step === "select" ? (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-sm space-y-4"
          >
            <div className="space-y-1">
              <h2 className="text-base font-bold">Pilih nama</h2>
              <p className="text-[11px] font-medium text-muted-foreground">Pilih nama Anda untuk melanjutkan.</p>
            </div>

            {/* Staff grid */}
            {allStaff === undefined ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : allStaff.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <Loader2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-muted-foreground">Belum ada staff terdaftar</p>
                <p className="text-[10px] text-muted-foreground/60">Hubungi admin untuk mendaftarkan staff.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {allStaff.map((staff: any) => {
                  const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
                  return (
                    <motion.button
                      key={staff._id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleUserSelect(staff)}
                      className={`group relative aspect-square rounded-xl border-2 p-2 text-center transition-all ${isCurrentlyIn ? "bg-emerald-50/30 border-emerald-500/20" : "bg-card border-border/50 hover:border-primary shadow-sm"}`}
                    >
                      <div className="flex flex-col items-center gap-1 h-full justify-center">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg font-bold text-xs transition-all ${isCurrentlyIn ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-white"}`}>
                          {staff.name.charAt(0)}
                        </div>
                        <p className="font-bold text-foreground text-[9px] leading-tight line-clamp-2 uppercase">{staff.name}</p>
                        <p className={`text-[7px] font-bold uppercase tracking-wider ${isCurrentlyIn ? "text-emerald-600" : "text-muted-foreground/60"}`}>
                          {isCurrentlyIn ? "BERTUGAS" : "OFF"}
                        </p>
                        {!staff.hasFace && (
                          <span className="mt-0.5 rounded-full bg-amber-100 px-1.5 py-[1px] text-[6px] font-bold text-amber-700 uppercase tracking-wider">Baru</span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Out of area warning */}
            {!isWithinRadius && siteSettings?.attendanceLat && (
              <div className="flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                <Navigation className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-900">Luar Area Kafe</p>
                  <p className="text-[10px] text-red-700">Absensi hanya dalam radius {siteSettings.attendanceRadius}m dari lokasi.</p>
                </div>
              </div>
            )}
          </motion.div>

        ) : step === "choose" ? (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-sm space-y-4"
          >
            {/* Selected user info */}
            <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold text-sm ${selectedUser?.isCurrentlyIn ? "bg-emerald-500 text-white" : "bg-primary text-white"}`}>
                {selectedUser?.name?.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{selectedUser?.name}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {selectedUser?.isCurrentlyIn ? "Sedang Bertugas" : "Sedang Off"} {isShiftActive && <span className="text-primary">· {(detectedShift as any).name}</span>}
                </p>
              </div>
              <div className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${selectedUser?.isCurrentlyIn ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                {selectedUser?.isCurrentlyIn ? "KELUAR" : "MASUK"}
              </div>
            </div>

            {/* PersonalSchedule */}
            {selectedUser && (
              <div className="rounded-xl border bg-card/80 p-2">
                <PersonalSchedule userId={selectedUser.id} month={new Date().getMonth() + 1} year={new Date().getFullYear()} />
              </div>
            )}

            {/* Two action buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => { setStep("face"); }}
                className="flex flex-col items-center gap-3 rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 transition-all hover:border-blue-400 hover:shadow-md active:scale-[0.97]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-sm">
                  <Camera className="h-7 w-7" />
                </div>
                <div className="space-y-0.5 text-center">
                  <p className="text-xs font-bold text-blue-900">Absen dengan</p>
                  <p className="text-sm font-bold text-blue-700 uppercase tracking-wider">Wajah</p>
                </div>
              </button>

              <button
                onClick={() => { setStep("pin"); setPinCode(""); }}
                className="flex flex-col items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 transition-all hover:border-amber-400 hover:shadow-md active:scale-[0.97]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                  <KeyRound className="h-7 w-7" />
                </div>
                <div className="space-y-0.5 text-center">
                  <p className="text-xs font-bold text-amber-900">Absen dengan</p>
                  <p className="text-sm font-bold text-amber-700 uppercase tracking-wider">PIN</p>
                </div>
              </button>
            </div>

            {/* Out of area warning */}
            {!isWithinRadius && siteSettings?.attendanceLat && (
              <div className="flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                <Navigation className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-900">Luar Area Kafe</p>
                  <p className="text-[10px] text-red-700">Absensi hanya dalam radius {siteSettings.attendanceRadius}m dari lokasi.</p>
                </div>
              </div>
            )}
          </motion.div>

        ) : step === "face" ? (
          <motion.div
            key="face"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold">{selectedUser?.isCurrentlyIn ? "Absen Keluar" : "Absen Masuk"}</h2>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  <span className="text-foreground">{selectedUser?.name}</span>
                  {detectedShift && !selectedUser?.isCurrentlyIn && <span className="text-muted-foreground/60"> — {(detectedShift as any).name}</span>}
                </p>
              </div>
            </div>

            {/* Camera or out-of-range */}
            <div className="relative">
              {!isWithinRadius && siteSettings?.attendanceLat ? (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-100 text-red-600">
                    <Navigation className="h-7 w-7 animate-bounce" />
                  </div>
                  <p className="font-bold text-red-900 text-xs">DI LUAR AREA KERJA</p>
                  <p className="text-xs text-red-700">Akses diblokir. Harap berada di dalam radius kafe.</p>
                  <Button onClick={() => setStep("choose")} variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">
                    Kembali
                  </Button>
                </div>
              ) : isClocking ? (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-4 rounded-xl bg-muted">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm font-bold text-muted-foreground">Memproses...</p>
                </div>
              ) : (
                <>
                  <FaceRecognition
                    mode="verify"
                    onVerify={(d) => {
                      if (!isClocking) handleClock(new Float32Array(d));
                    }}
                    onModelError={() => {
                      toast.error("Gagal memuat kamera. Silakan gunakan PIN.");
                      setStep("choose");
                    }}
                  />
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      className="w-full h-10 rounded-xl text-[11px] font-bold"
                      onClick={() => { setStep("choose"); }}
                    >
                      <KeyRound className="mr-2 h-3.5 w-3.5" />
                      Ganti ke PIN
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>

        ) : step === "pin" ? (
          <motion.div
            key="pin"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-sm space-y-4"
          >
            <div className="space-y-4 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <KeyRound className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight">Masukkan PIN</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedUser?.isCurrentlyIn
                    ? `Halo ${selectedUser.name}, masukkan PIN untuk keluar.`
                    : `Halo ${selectedUser?.name}, masukkan PIN 6 digit untuk ${selectedUser?.isCurrentlyIn ? "keluar" : "masuk"}.`}
                </p>
              </div>
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <Input
                  autoFocus
                  className="h-14 rounded-xl border-2 text-center text-xl font-bold tracking-[0.4em] transition-all focus:border-primary focus:ring-4 focus:ring-primary/5"
                  maxLength={6}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  type="password"
                  value={pinCode}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-12 rounded-xl font-bold" onClick={() => setStep("choose")}>
                    KEMBALI
                  </Button>
                  <Button className="h-12 rounded-xl font-bold" disabled={pinCode.length !== 6 || isVerifyingPin} type="submit">
                    {isVerifyingPin ? <Loader2 className="h-5 w-5 animate-spin" /> : "LANJUT"}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>

        ) : step === "success" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-sm"
          >
            <div className="flex flex-col items-center space-y-5 text-center bg-card border border-border/50 rounded-2xl p-6 shadow-lg">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
                className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              >
                <UserCheck className="h-12 w-12" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <div className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] shadow-sm ${selectedUser?.isCurrentlyIn ? "bg-amber-100 text-amber-600 border border-amber-200" : "bg-emerald-100 text-emerald-600 border border-emerald-200"}`}>
                  {selectedUser?.isCurrentlyIn ? "Berhasil Absen Keluar" : "Berhasil Absen Masuk"}
                </div>
                <h2 className="text-2xl font-bold text-emerald-600">Berhasil!</h2>
                <p className="text-sm font-semibold">{selectedUser?.isCurrentlyIn ? "Hati-hati di jalan!" : "Semangat bekerja!"}</p>
                <p className="text-xs text-muted-foreground">{selectedUser?.name} — {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-2 rounded-xl border bg-muted/50 px-4 py-3 w-full"
              >
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Mengalihkan ke Profil...</p>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </main>
    </div>
  );
}
