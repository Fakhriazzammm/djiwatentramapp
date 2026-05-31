import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { FaceRecognition, preloadFaceModels } from "@/components/auth/FaceRecognition";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Coffee, ArrowLeft, KeyRound, Loader2, UserCheck,
  MapPin, AlertCircle, CheckCircle2, Clock, Navigation,
  CalendarClock, RefreshCw, Camera, ChevronLeft, User,
} from "lucide-react";
import {
  useHybridSiteSettings,
  useHybridPublicUsers,
  useHybridCurrentlyInStore,
  useHybridClockIn,
  useHybridClockOut,
  useHybridEnrollFace,
  useHybridVerifyHomePin,
} from "@yumipos/web-shared";

export const Route = createLazyFileRoute("/attendance")({
  component: KaryawanAttendancePage,
});

// ── Haversine distance for geofencing ──
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function KaryawanAttendancePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"select" | "pin" | "face" | "success">("select");
  const [refreshCount, setRefreshCount] = useState(0);

  const [pin, setPin] = useState("");
  const [user, setUser] = useState<{
    id: string;
    name: string;
    hasFace?: boolean;
    isCurrentlyIn?: boolean;
    roleName?: string;
  } | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Geolocation
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Hooks
  const siteSettings = useHybridSiteSettings();
  const allStaff = useHybridPublicUsers();
  const currentlyIn = useHybridCurrentlyInStore(refreshCount);
  const verifyPin = useHybridVerifyHomePin();
  const enrollFace = useHybridEnrollFace();
  const clockIn = useHybridClockIn();
  const clockOut = useHybridClockOut();

  // ── Shift Detection ──
  const shiftSchedules = siteSettings?.shiftSettings?.shiftSchedules || [];
  const detectedShift = useMemo(() => {
    if (!shiftSchedules.length) return null;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (const schedule of shiftSchedules) {
      if (!schedule.openTime || !schedule.closeTime) continue;
      const [oH, oM] = schedule.openTime.split(":").map(Number);
      const [cH, cM] = schedule.closeTime.split(":").map(Number);
      const openMin = oH * 60 + oM;
      const closeMin = cH * 60 + cM;
      if (openMin <= closeMin) {
        if (currentMinutes >= openMin && currentMinutes < closeMin) return schedule;
      } else {
        if (currentMinutes >= openMin || currentMinutes < closeMin) return schedule;
      }
    }
    // Nearest upcoming
    let nearest: typeof shiftSchedules[number] | null = null;
    let minDiff = Infinity;
    for (const schedule of shiftSchedules) {
      if (!schedule.openTime) continue;
      const [oH, oM] = schedule.openTime.split(":").map(Number);
      let diff = (oH * 60 + oM) - currentMinutes;
      if (diff < 0) diff += 1440;
      if (diff < minDiff) { minDiff = diff; nearest = schedule; }
    }
    return nearest ? { ...nearest, upcoming: true } : null;
  }, [shiftSchedules]);
  const isShiftActive = detectedShift && !(detectedShift as any).upcoming;

  // ── Geofencing ──
  const distance = useMemo(() => {
    if (!userLocation || !siteSettings?.attendanceLat || !siteSettings?.attendanceLng) return null;
    return calculateDistance(
      userLocation.lat, userLocation.lng,
      siteSettings.attendanceLat, siteSettings.attendanceLng
    );
  }, [userLocation, siteSettings]);
  const isInRadius = distance !== null && distance <= (siteSettings?.attendanceRadius ?? 50);
  const attendanceLocation = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined;

  // ── Geolocation fetch (single shot) ──
  const fetchLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError("Browser tidak mendukung geolokasi."); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(null); setLocationLoading(false); },
      (err) => {
        if (err.code === err.POSITION_UNAVAILABLE) {
          setTimeout(() => {
            navigator.geolocation.getCurrentPosition(
              (pos2) => { setUserLocation({ lat: pos2.coords.latitude, lng: pos2.coords.longitude }); setLocationError(null); setLocationLoading(false); },
              () => { setLocationError("Izin lokasi diperlukan untuk absensi."); setLocationLoading(false); },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
          }, 2000);
        } else {
          setLocationError("Izin lokasi diperlukan untuk absensi.");
          setLocationLoading(false);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);
  useEffect(() => { if (step === "select") preloadFaceModels(); }, [step]);

  // ── User Selection ──
  const handleUserSelect = (staff: any) => {
    const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
    setUser({
      id: staff._id,
      name: staff.name,
      hasFace: !!staff.hasFace,
      isCurrentlyIn,
      roleName: staff.roleName || "",
    });
    // Face step langsung — tanpa PIN untuk daftar wajah
    setStep("face");
    setIsEnrolling(!staff.hasFace); // enroll mode jika belum punya wajah
  };

  // ── Face Processed ──
  const handleFaceProcessed = async (descriptor?: number[]) => {
    if (!user) return;
    try {
      // Geofence check
      if (siteSettings?.attendanceLat && !attendanceLocation) {
        toast.error("Lokasi belum siap. Aktifkan GPS lalu coba lagi.");
        return;
      }
      if (siteSettings?.attendanceLat && !isInRadius) {
        toast.error("Gagal: Anda berada di luar radius kafe.");
        return;
      }

      // Enroll mode + ada descriptor → daftar wajah TANPA PIN
      if (isEnrolling && descriptor) {
        toast.loading("Mendaftarkan wajah...", { id: "save-face" });
        await enrollFace({
          userId: user.id,
          faceDescriptor: descriptor,
          skipPinVerification: true, // TANPA PIN
        });
        toast.success("Wajah berhasil terdaftar!", { id: "save-face" });
        setIsEnrolling(false);
        setUser((prev) => (prev ? { ...prev, hasFace: true } : prev));
      }

      // Clock In/Out
      toast.loading(user.isCurrentlyIn ? "Proses Keluar..." : "Proses Masuk...", { id: "clocking" });
      const payload = {
        userId: user.id,
        faceDescriptor: descriptor,
        pinCode: pin || undefined,
        location: attendanceLocation,
      };

      if (user.isCurrentlyIn) {
        await clockOut(payload);
      } else {
        await clockIn({
          ...payload,
          shiftName: detectedShift?.name || undefined,
          shiftOpenTimeSnapshot: detectedShift?.openTime || undefined,
        });
      }

      toast.dismiss("clocking");
      setRefreshCount((c) => c + 1);
      setStep("success");
      setTimeout(() => {
        navigate({ to: `/${user.id}` as any });
      }, 3000);
    } catch (err: any) {
      toast.dismiss();
      toast.error(err?.message || "Gagal memproses absensi");
    }
  };

  // ── PIN Submit (fallback) ──
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) return;
    setIsVerifyingPin(true);
    try {
      const result = await verifyPin({ pinCode: pin, userId: user?.id });
      if (user && result.userId !== user.id) {
        toast.error("PIN ini bukan milik Anda.");
        setIsVerifyingPin(false);
        return;
      }
      // PIN-only fallback — clock in/out tanpa face
      await handleFaceProcessed();
    } catch (err: any) {
      toast.error(err.message || "PIN salah.");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20 pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border/30 bg-background/90 px-3 backdrop-blur-lg">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card text-primary shadow-sm">
            <Coffee className="h-4 w-4" />
          </div>
          <h1 className="text-sm font-bold tracking-tight">Absensi</h1>
        </div>
        <div className="flex items-center gap-2">
          {locationLoading ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-[10px] font-bold text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Lokasi...
            </div>
          ) : siteSettings?.attendanceLat && (
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 border text-[9px] font-bold ${
              isInRadius ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full ${isInRadius ? "bg-emerald-500" : "bg-red-500"}`} />
              {isInRadius ? "Dalam Area" : "Luar Area"}
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col p-3">
        <AnimatePresence mode="wait">
          {/* ── STEP 1: SELECT ── */}
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto w-full max-w-sm space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-base font-bold">Pilih nama</h2>
                <p className="text-[11px] font-medium text-muted-foreground">Pilih nama Anda untuk melanjutkan.</p>
              </div>

              {!allStaff ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {allStaff.map((staff: any) => {
                    const isIn = currentlyIn?.some((s: any) => s._id === staff._id);
                    return (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        key={staff._id}
                        onClick={() => handleUserSelect(staff)}
                        className={`group relative aspect-square rounded-xl border-2 p-2 text-center transition-all ${
                          isIn
                            ? "bg-emerald-50/30 border-emerald-500/20"
                            : "bg-card border-border/50 hover:border-primary shadow-sm"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1 h-full justify-center">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg font-bold text-xs transition-all ${
                            isIn ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-white"
                          }`}>
                            {staff.name.charAt(0)}
                          </div>
                          <p className="font-bold text-foreground text-[9px] leading-tight line-clamp-2 uppercase">
                            {staff.name}
                          </p>
                          <p className={`text-[7px] font-bold uppercase tracking-wider ${
                            isIn ? "text-emerald-600" : "text-muted-foreground/60"
                          }`}>
                            {isIn ? "BERTUGAS" : "OFF"}
                          </p>
                          {!staff.hasFace && (
                            <span className="mt-0.5 rounded-full bg-amber-100 px-1.5 py-[1px] text-[6px] font-bold text-amber-700 uppercase tracking-wider">
                              Baru
                            </span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Geofencing warning */}
              {!isInRadius && siteSettings?.attendanceLat && (
                <div className="flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-900">Luar Area Kafe</p>
                    <p className="text-[10px] text-red-700">Absensi hanya dalam radius {siteSettings.attendanceRadius}m dari lokasi.</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── STEP 2: FACE ── */}
          {step === "face" && (
            <motion.div
              key="face"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto w-full max-w-sm space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <h2 className={`text-base font-bold tracking-tight ${
                    isEnrolling ? "text-foreground" : (user?.isCurrentlyIn ? "text-amber-500" : "text-emerald-500")
                  }`}>
                    {isEnrolling ? "Daftar Wajah" : (user?.isCurrentlyIn ? "Absen Keluar" : "Absen Masuk")}
                  </h2>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    <span className="text-foreground">{user?.name}</span>
                    {detectedShift && !user?.isCurrentlyIn && (
                      <span className="text-muted-foreground/60"> — {detectedShift.name}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isShiftActive && (
                    <div className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-1 text-[9px] font-bold text-blue-700">
                      <CalendarClock className="h-3 w-3" />
                      {detectedShift?.name}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative">
                {!isInRadius && siteSettings?.attendanceLat ? (
                  <div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-100 text-red-600">
                      <Navigation className="h-7 w-7 animate-bounce" />
                    </div>
                    <p className="font-bold text-red-900 text-xs">DI LUAR AREA KERJA</p>
                    <p className="text-xs text-red-700">Akses diblokir. Harap berada di dalam radius kafe.</p>
                    <Button onClick={() => setStep("select")} variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">
                      Pilih User Lain
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* FaceRecognition — enroll mode (skip PIN) atau verify mode */}
                    <FaceRecognition
                      mode={isEnrolling ? "enroll" : "verify"}
                      onCapture={isEnrolling ? handleFaceProcessed : undefined}
                      onVerify={!isEnrolling ? handleFaceProcessed : undefined}
                      onModelError={() => {
                        if (!isEnrolling) {
                          toast.error("Gagal memuat kamera. Silakan gunakan PIN.");
                          setStep("pin");
                        }
                      }}
                    />

                    {/* Action buttons below camera */}
                    <div className="mt-3 flex flex-col gap-2">
                      {/* Enrolling + model error = PIN fallback */}
                      {isEnrolling && (
                        <Button
                          variant="outline"
                          className="w-full h-10 rounded-xl text-[11px] font-bold"
                          onClick={() => {
                            // Skip face enrollment — langsung clockIn dengan PIN
                            setStep("pin");
                          }}
                        >
                          <KeyRound className="mr-2 h-3.5 w-3.5" />
                          Lewati, Absen Pakai PIN
                        </Button>
                      )}

                      {!isEnrolling && (
                        <>
                          <Button
                            className="w-full h-10 rounded-xl text-[11px] font-bold shadow-sm"
                            variant="secondary"
                            onClick={() => {
                              toast.info("Masukkan PIN untuk absen manual.");
                              setStep("pin");
                            }}
                          >
                            <KeyRound className="mr-2 h-3.5 w-3.5" />
                            Absen Pakai PIN
                          </Button>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 h-9 rounded-xl text-[10px] font-bold"
                              variant="ghost"
                              onClick={() => {
                                setIsEnrolling(true);
                                toast.info("Arahkan wajah ke kamera untuk daftar ulang.");
                              }}
                            >
                              Daftar Ulang Wajah
                            </Button>
                            <Button
                              className="flex-1 h-9 rounded-xl text-[10px]"
                              onClick={() => { setStep("select"); setIsEnrolling(false); }}
                              variant="outline"
                            >
                              Ganti Identitas
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: PIN (fallback) ── */}
          {step === "pin" && (
            <motion.div
              key="pin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto w-full max-w-sm space-y-4"
            >
              <div className="space-y-4 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold tracking-tight">Masukkan PIN</h2>
                  <p className="text-xs text-muted-foreground">
                    {isEnrolling
                      ? `Halo ${user?.name}, masukkan PIN untuk verifikasi.`
                      : `Masukkan PIN 6 digit untuk ${user?.isCurrentlyIn ? "keluar" : "masuk"}.`}
                  </p>
                </div>

                <form className="space-y-4" onSubmit={handlePinSubmit}>
                  <Input
                    autoFocus
                    className="h-14 rounded-xl border-2 text-center text-xl font-bold tracking-[0.4em] transition-all focus:border-primary focus:ring-4 focus:ring-primary/5"
                    maxLength={6}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    type="password"
                    value={pin}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 rounded-xl font-bold"
                      onClick={() => { setStep("select"); setPin(""); setIsEnrolling(false); }}
                    >
                      KEMBALI
                    </Button>
                    <Button
                      className="h-12 rounded-xl font-bold"
                      disabled={pin.length !== 6 || isVerifyingPin}
                      type="submit"
                    >
                      {isVerifyingPin ? <Loader2 className="h-5 w-5 animate-spin" /> : "LANJUT"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: SUCCESS ── */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-sm"
            >
              <div className="flex flex-col items-center space-y-5 text-center bg-card border border-border/50 rounded-2xl p-6 shadow-lg relative overflow-hidden">
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
                  <div className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] shadow-sm ${
                    user?.isCurrentlyIn
                      ? "bg-amber-100 text-amber-600 border border-amber-200"
                      : "bg-emerald-100 text-emerald-600 border border-emerald-200"
                  }`}>
                    {user?.isCurrentlyIn ? "Berhasil Absen Keluar" : "Berhasil Absen Masuk"}
                  </div>
                  <h2 className="text-2xl font-bold text-emerald-600">Berhasil!</h2>
                  <p className="text-sm font-semibold">
                    {user?.isCurrentlyIn ? "Hati-hati di jalan!" : "Semangat bekerja!"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user?.name} — {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-2 rounded-xl border bg-muted/50 px-4 py-3 w-full"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Mengalihkan ke Profil...
                  </p>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
