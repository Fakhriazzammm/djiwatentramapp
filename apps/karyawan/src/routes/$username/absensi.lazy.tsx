import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useHybridCurrentlyInStore, useHybridPublicUsers, useHybridSiteSettings } from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { FaceRecognition, preloadFaceModels } from "@/components/auth/FaceRecognition";
import { useHybridVerifyHomePin, useHybridClockIn, useHybridClockOut, useHybridEnrollFace, createClient } from "@yumipos/web-shared";
import { useYumiAuth } from "@yumipos/web-shared";
import { motion } from "framer-motion";
import { Loader2, UserCheck, Navigation, Coffee, Camera, KeyRound, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/$username/absensi")({
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
  const { username } = useParams({ from: "/$username/absensi" as any }) as { username: string };
  // Check if navigated from profil page for face enrollment
  const urlParams = new URLSearchParams(window.location.search);
  const enrollParam = urlParams.get("enroll");
  const [step, setStep] = useState<"choose" | "face" | "pin" | "enroll" | "success">(enrollParam === "1" ? "enroll" : "choose");
  const [refreshCount, setRefreshCount] = useState(0);
  const [pinCode, setPinCode] = useState("");
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
    slug: string;
    hasFace: boolean;
    isCurrentlyIn: boolean;
    roleName: string;
  } | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isClocking, setIsClocking] = useState(false);
  const [faceReady, setFaceReady] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);

  // ── Data hooks ──
  const siteSettings = useHybridSiteSettings();
  const allStaff = useHybridPublicUsers();
  const currentlyIn = useHybridCurrentlyInStore(refreshCount);
  const verifyPin = useHybridVerifyHomePin();
  const clockIn = useHybridClockIn();
  const clockOut = useHybridClockOut();
  const enrollFace = useHybridEnrollFace();
  const { user: authUser, isAuthenticated } = useYumiAuth();

  // ── Auth gate: redirect to login if not authenticated ──
  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/login" as any, replace: true });
      return;
    }
    if (!authUser || !Array.isArray(allStaff) || allStaff.length === 0) return;
    // Match by _id, slug, or username (email prefix)
    const matched = allStaff.find((s: any) => {
      if (authUser._id && String(s._id) === String(authUser._id)) return true;
      if (authUser.slug && s.slug && String(s.slug) === String(authUser.slug)) return true;
      if (authUser.username && s.username && String(s.username) === String(authUser.username)) return true;
      return false;
    });
    if (matched) {
      handleUserSelect(matched);
    }
  }, [isAuthenticated, authUser, allStaff]);

  // ── Sync isCurrentlyIn when currentlyIn data loads/changes ──
  useEffect(() => {
    if (!selectedUser?.id || !currentlyIn) return;
    const isIn = currentlyIn.some((s: any) => s._id === selectedUser.id);
    setSelectedUser((prev) => (prev && prev.isCurrentlyIn !== isIn ? { ...prev, isCurrentlyIn: isIn } : prev));
  }, [selectedUser?.id, currentlyIn]);

  // ── Today's schedule for selected user ──
  const [userTodaySchedule, setUserTodaySchedule] = useState<{ shift_name: string; start_time: string; end_time: string } | null>(null);
  useEffect(() => {
    if (!selectedUser?.id) { setUserTodaySchedule(null); return; }
    let cancelled = false;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .schema("pos")
          .from("attendance_schedules")
          .select("shift_name, start_time, end_time")
          .eq("user_id", selectedUser.id)
          .eq("date", dateStr)
          .not("shift_name", "ilike", "%off%")
          .maybeSingle();
        if (!cancelled) {
          setUserTodaySchedule(data as any);
        }
      } catch { if (!cancelled) setUserTodaySchedule(null); }
    })();
    return () => { cancelled = true; };
  }, [selectedUser?.id]);

  // ── Shift detection (user schedule first, then time-based fallback) ──
  const shiftSchedules = siteSettings?.shiftSettings?.shiftSchedules || [];
  const detectedShift = useMemo(() => {
    // Priority 1: user's scheduled shift for today
    if (userTodaySchedule?.shift_name && userTodaySchedule?.start_time) {
      const match = shiftSchedules.find((s: any) =>
        String(s.name ?? s.shiftName ?? "").toUpperCase() === userTodaySchedule.shift_name.toUpperCase()
      );
      if (match) {
        // Use their schedule's start_time as reference
        const [sh, sm] = String(userTodaySchedule.start_time).split(":").map(Number);
        const refMinutes = sh * 60 + sm;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const isEarly = currentMinutes < refMinutes;
        return { ...match, name: match.name ?? match.shiftName, openTime: userTodaySchedule.start_time, closeTime: userTodaySchedule.end_time, upcoming: isEarly };
      }
    }

    // Priority 2: time-based fallback — find best shift
    if (!shiftSchedules.length) return null;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Collect ALL matching shifts (there may be overlap, e.g. Pagi 07:30-14:30 & Sore 13:00-21:00)
    const matchingShifts: any[] = [];
    for (const shift of shiftSchedules) {
      if (!shift.openTime || !shift.closeTime) continue;
      const [openHour, openMin] = String(shift.openTime).split(":").map(Number);
      const [closeHour, closeMin] = String(shift.closeTime).split(":").map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      if (openMinutes <= closeMinutes) {
        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) matchingShifts.push(shift);
      } else {
        if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) matchingShifts.push(shift);
      }
    }

    // When multiple shifts match (overlap), pick the LATEST openTime (most recently started)
    // This ensures Shift Sore (13:00) is chosen over Shift Pagi (07:30) during overlap
    if (matchingShifts.length > 0) {
      matchingShifts.sort((a: any, b: any) => {
        const aOpen = parseInt(String(a.openTime).split(":")[0]) * 60 + parseInt(String(a.openTime).split(":")[1]);
        const bOpen = parseInt(String(b.openTime).split(":")[0]) * 60 + parseInt(String(b.openTime).split(":")[1]);
        return bOpen - aOpen;
      });
      return matchingShifts[0];
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
  const isOwner = selectedUser?.roleName?.toLowerCase().includes("owner");

  // ── Geolocation ──
  const distance = useMemo(() => {
    if (!selectedUser || !siteSettings?.attendanceLat || !siteSettings?.attendanceLng) return null;
    if (!userLocation) return null;
    return haversineDistance(userLocation.lat, userLocation.lng, siteSettings.attendanceLat, siteSettings.attendanceLng);
  }, [selectedUser, userLocation, siteSettings]);

  const isWithinRadius = isOwner ? true : (distance !== null && distance <= (siteSettings?.attendanceRadius ?? 50));
  const locationForClock = isOwner && siteSettings?.attendanceLat
    ? { lat: siteSettings.attendanceLat, lng: siteSettings.attendanceLng }
    : userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined;

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

  // ── Preload face models on mount ──
  useEffect(() => {
    let cancelled = false;
    preloadFaceModels().then((ok) => {
      if (!cancelled) {
        setFaceReady(ok);
        if (!ok) setFaceError("Model wajah gagal dimuat");
      }
    });
    return () => { cancelled = true; };
  }, []);

  // ── User selection ──
  const handleUserSelect = (staff: any) => {
    const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
    setSelectedUser({ id: staff._id, name: staff.name, slug: staff.slug, hasFace: !!staff.hasFace, isCurrentlyIn: !!isCurrentlyIn, roleName: staff.roleName || "" });
    setStep("choose");
  };

  // ── Clock in/out handler ──
  const handleClock = async (faceDescriptor?: Float32Array) => {
    if (!selectedUser || isClocking) return;
    setIsClocking(true);
    try {
      if (siteSettings?.attendanceLat && !userLocation && !isOwner) {
        toast.error("Lokasi belum siap. Aktifkan GPS lalu coba lagi.");
        setIsClocking(false);
        return;
      }
      if (siteSettings?.attendanceLat && !isWithinRadius) {
        if (isOwner) {
          // Owner bypass — allow clock without location
        } else {
          toast.error("Gagal: Anda berada di luar radius kafe.");
          setIsClocking(false);
          return;
        }
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
      setTimeout(() => { navigate({ to: "/$username/beranda" as any, params: { username } }); }, 3000);
    } catch (error: any) {
      toast.dismiss();
      const msg = error?.message || "Gagal memproses absensi";
      toast.error(msg);
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
      toast.error(error?.message || "Gagal memproses absensi");
      setPinCode("");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // ── Render ──
  return (
    <div className="space-y-3">
      {/* Header row: title + location */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
      </div>

      {/* Steps content */}
      {step === "choose" && selectedUser ? (
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

          {/* Two action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => { setStep("face"); setFaceError(null); }}
              disabled={!faceReady}
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-5 transition-all active:scale-[0.97] ${
                faceReady
                  ? "border-blue-200 bg-blue-50 hover:border-blue-400 hover:shadow-md cursor-pointer"
                  : faceError
                  ? "border-red-200 bg-red-50 cursor-not-allowed opacity-60"
                  : "border-blue-100 bg-blue-50/50 cursor-wait opacity-50"
              }`}
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ${
                faceReady ? "bg-blue-500 text-white" : faceError ? "bg-red-400 text-white" : "bg-blue-300 text-white"
              }`}>
                {!faceReady && !faceError ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <Camera className="h-7 w-7" />
                )}
              </div>
              <div className="space-y-0.5 text-center">
                <p className={`text-xs font-bold ${faceReady ? "text-blue-900" : faceError ? "text-red-900" : "text-blue-900/60"}`}>
                  {faceReady ? "Absen dengan" : faceError ? "Tidak tersedia" : "Memuat..."}
                </p>
                <p className={`text-sm font-bold uppercase tracking-wider ${faceReady ? "text-blue-700" : faceError ? "text-red-700" : "text-blue-700/60"}`}>
                  {faceReady ? "Wajah" : faceError ? "Gunakan PIN" : "Kamera"}
                </p>
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

          {/* Daftarkan wajah */}
          {!selectedUser?.hasFace && (
            <div className="text-center">
              <button
                onClick={() => { setStep("enroll"); setFaceError(null); }}
                className="text-[10px] font-bold text-muted-foreground/60 hover:text-primary transition-colors underline underline-offset-2"
              >
                Atur Data Wajah
              </button>
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
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">Memuat data...</p>
          </div>
        </div>

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
            ) : faceError ? (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-100 text-red-600">
                  <Camera className="h-7 w-7" />
                </div>
                <p className="font-bold text-red-900 text-xs">KAMERA TIDAK TERSEDIA</p>
                <p className="text-xs text-red-700">{faceError}</p>
                <div className="flex gap-2 mt-1">
                  <Button onClick={() => setStep("choose")} variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 flex-1">
                    Kembali
                  </Button>
                  <Button onClick={() => { setFaceError(null); }} variant="outline" className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 flex-1">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Ulang
                  </Button>
                </div>
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
                  onVerify={async (d) => {
                    if (!isClocking) await handleClock(new Float32Array(d));
                  }}
                  onModelError={(msg) => {
                    setFaceError(msg || "Gagal memuat kamera");
                    toast.error("Kamera tidak tersedia. Silakan gunakan PIN.");
                  }}
                />
                <div className="mt-3 flex flex-col gap-2">
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

      ) : step === "enroll" ? (
        <motion.div
          key="enroll"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-sm space-y-4"
        >
          {!selectedUser ? (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <p className="font-bold text-xs">Memuat data pengguna...</p>
            </div>
          ) : (
            <>
          <div className="space-y-2 text-center">
            <h2 className="text-base font-bold">Daftarkan Wajah</h2>
            <p className="text-[11px] font-semibold text-muted-foreground">
              Arahkan wajah ke kamera untuk mendaftarkan data biometrik.
            </p>
          </div>

          {faceError ? (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-100 text-red-600">
                <Camera className="h-7 w-7" />
              </div>
              <p className="font-bold text-red-900 text-xs">KAMERA TIDAK TERSEDIA</p>
              <p className="text-xs text-red-700">{faceError}</p>
              <Button onClick={() => setStep("choose")} variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">
                Kembali
              </Button>
            </div>
          ) : (
            <FaceRecognition
              mode="enroll"
              onCapture={async (d) => {
                try {
                  await enrollFace({ userId: selectedUser?.id, faceDescriptor: d, skipPinVerification: true });
                  toast.success("Wajah berhasil didaftarkan!");
                  // Update selectedUser.hasFace
                  if (selectedUser) setSelectedUser({ ...selectedUser, hasFace: true });
                  setTimeout(() => setStep("choose"), 2000);
                } catch (e: any) {
                  toast.error(e?.message || "Gagal mendaftarkan wajah");
                }
              }}
              onModelError={(msg) => {
                setFaceError(msg || "Gagal memuat kamera");
                toast.error("Kamera tidak tersedia. Silakan gunakan PIN.");
              }}
            />
          )}
            </>
          )}

          <div className="text-center">
            <button
              onClick={() => setStep("choose")}
              className="text-[10px] font-bold text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
            >
              Batal
            </button>
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
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Mengalihkan ke Beranda...</p>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
