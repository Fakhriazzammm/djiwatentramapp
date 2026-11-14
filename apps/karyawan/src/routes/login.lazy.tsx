"use client";

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronDown, Search } from "lucide-react";
import { DsAvatar, DsButton, DsRoot, ds3d } from "@yumipos/web-shared/components/ds";
import { useYumiAuth, listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@yumipos/web-shared";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/login")({
  component: KaryawanLoginPage,
});

function KaryawanLoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useYumiAuth();
  const [users, setUsers] = useState<YumiPublicUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [resolvedUser, setResolvedUser] = useState<YumiPublicUser | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const pinIndexes = [0, 1, 2, 3, 4, 5];
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/" as any, replace: true });
      return;
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextUsers = await listPublicYumiUsers();
        if (active) setUsers(nextUsers);
      } catch (err: any) {
        if (active) {
          setLoadError(err?.message || "Gagal memuat daftar karyawan");
          toast.error("Gagal memuat daftar karyawan");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Auto-focus name input on mount
  useEffect(() => {
    if (!isLoading) nameRef.current?.focus();
  }, [isLoading]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter users based on query
  const filteredUsers = useMemo(() => {
    if (!nameQuery.trim()) return users;
    const q = nameQuery.trim().toLowerCase();
    return users.filter((u) =>
      [u.name, u.slug, u.username]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [users, nameQuery]);

  const selectUser = (user: YumiPublicUser) => {
    setNameQuery(user.name);
    setResolvedUser(user);
    setResolveError("");
    setShowDropdown(false);
    setPin(["", "", "", "", "", ""]);
    const firstEmpty = 0;
    inputRefs.current[firstEmpty]?.focus();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNameQuery(val);
    setPin(["", "", "", "", "", ""]);
    setResolvedUser(null);
    setResolveError("");
    setShowDropdown(true);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Auto-select first match if exact or unique
      if (filteredUsers.length === 1) {
        selectUser(filteredUsers[0]);
      } else if (filteredUsers.length > 0 && nameQuery.trim()) {
        // Try exact match
        const exact = filteredUsers.find(
          (u) => u.name.toLowerCase() === nameQuery.trim().toLowerCase()
        );
        if (exact) {
          selectUser(exact);
        }
      }
      setShowDropdown(false);
    }
    if (e.key === "Escape") {
      setShowDropdown(false);
    }
    if (e.key === "ArrowDown" && showDropdown && filteredUsers.length > 0) {
      e.preventDefault();
      // Focus first dropdown item — handled by dropdown
    }
  };

  const handleNameFocus = () => {
    if (!resolvedUser) {
      setShowDropdown(true);
    }
  };

  const handlePinChange = (index: number, value: string) => {
    if (isVerifying) return;
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      if (pin[index]) {
        const newPin = [...pin];
        newPin[index] = "";
        setPin(newPin);
      } else if (index === 0) {
        nameRef.current?.focus();
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (isVerifying) return;
    const data = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!data) return;
    const newPin = [...pin];
    for (let i = 0; i < data.length; i++) {
      newPin[i] = data[i];
    }
    setPin(newPin);
    const nextIdx = Math.min(data.length, 5);
    inputRefs.current[nextIdx]?.focus();
  };

  const submitPin = async () => {
    const pinStr = pin.join("");
    if (pinStr.length !== 6 || isVerifying) return;

    if (!resolvedUser) {
      setResolveError("Pilih karyawan terlebih dahulu");
      nameRef.current?.focus();
      return;
    }

    setIsVerifying(true);
    try {
      const result = await loginWithYumiPin(resolvedUser!._id, pinStr);
      login(result.token);
      toast.success(`Selamat datang, ${result.user.name}`);
      // slug bisa kosong untuk sebagian user — _id selalu ada dan diterima
      // route /$username. Pakai params, bukan path rakitan, supaya nilainya
      // ter-encode dengan benar.
      const handle = result.user.slug || result.user._id;
      navigate({
        to: "/$username",
        params: { username: handle },
        replace: true,
      } as any);
    } catch (err: any) {
      toast.error(err?.message || "Gagal masuk");
      setPin(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-submit when PIN fully entered
  useEffect(() => {
    if (pin.every((d) => d) && !isVerifying) {
      submitPin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.join(""), resolvedUser]);

  const isPinComplete = pin.every((d) => d);
  const canInputPin = resolvedUser && !resolveError;

  const heroIcon = ds3d("employee-attendance-menu");
  return (
    <DsRoot className="karyawan-shell">
      <main className="ds-screen flex min-h-dvh w-full flex-col items-center justify-center" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 }}
          className="w-full max-w-[420px]"
        >
          <section aria-labelledby="login-title">
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <img src={heroIcon} alt="" style={{ width: 96, height: 96, objectFit: "contain", margin: "0 auto 4px", display: "block" }} />
              <p className="ds-sub" style={{ margin: 0 }}>Djiwa Tentram</p>
              <h1 id="login-title" className="ds-page-title" style={{ marginTop: 2 }}>Masuk ke Karyawan</h1>
              <p className="ds-sub" style={{ margin: "6px 0 0", fontSize: 15 }}>Pilih nama kamu, lalu masukkan PIN</p>
            </div>

            {loadError && (
              <div className="ds-note" style={{ background: "var(--ds-danger-soft)", color: "var(--ds-danger)", marginBottom: 12 }}>
                <div><b>Gagal memuat data karyawan</b><span style={{ fontSize: 12.5 }}>{loadError}</span></div>
              </div>
            )}

            <div className="ds-group" style={{ padding: 14 }}>
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ds-faint)" }} />
                  <input
                    ref={nameRef}
                    type="text"
                    autoComplete="off"
                    placeholder={isLoading ? "Memuat daftar karyawan..." : "Cari nama karyawan"}
                    value={nameQuery}
                    onChange={handleNameChange}
                    onFocus={handleNameFocus}
                    onKeyDown={handleNameKeyDown}
                    disabled={isLoading}
                    className="ds-input"
                    style={{ paddingLeft: 42, paddingRight: 44, background: "#fff", outline: "none", boxShadow: "none", borderColor: resolveError ? "var(--ds-danger)" : resolvedUser ? "var(--ds-ok)" : "transparent" }}
                  />
                  <button type="button" onClick={() => setShowDropdown(!showDropdown)} aria-label="Buka daftar karyawan" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--ds-mute)", minHeight: 32 }}>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {resolvedUser && !resolveError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px 0" }}>
                    <DsAvatar name={resolvedUser.name} size={32} />
                    <b style={{ fontSize: 14 }}>{resolvedUser.name}</b>
                    <span className="ds-tag ds-tag--ok" style={{ marginLeft: "auto" }}>Dipilih</span>
                  </div>
                )}
                {resolveError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 4px 0", color: "var(--ds-danger)", fontSize: 13 }}>
                    <AlertCircle className="h-4 w-4" />{resolveError}
                  </div>
                )}

                {showDropdown && !isLoading && (
                  <div className="absolute z-50 mt-2 w-full overflow-y-auto" style={{ background: "#fff", borderRadius: 24, boxShadow: "var(--ds-float)", maxHeight: 260, padding: "6px 14px" }}>
                    {filteredUsers.length === 0 ? (
                      <div className="ds-sub" style={{ padding: "16px 0", textAlign: "center" }}>{nameQuery.trim() ? "Karyawan tidak ditemukan" : "Tidak ada data karyawan"}</div>
                    ) : (
                      filteredUsers.map((user) => (
                        <button key={user._id} type="button" onClick={() => selectUser(user)} className="ds-row" style={{ minHeight: 56, padding: "8px 0" }}>
                          <DsAvatar name={user.name} src={null} size={38} />
                          <div className="ds-main"><b>{user.name}</b>{user.username && <span>@{user.username}</span>}</div>
                          {resolvedUser?._id === user._id && <span className="ds-tag ds-tag--ok">✓</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "center", marginTop: 18 }}>
                <div className="ds-label" style={{ marginBottom: 10 }}>PIN 6 digit</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 8 }} onPaste={handlePinPaste}>
                  {pinIndexes.map((i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      aria-label={`Digit PIN ${i + 1}`}
                      value={pin[i]}
                      onChange={(e) => handlePinChange(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      disabled={!canInputPin || isVerifying}
                      style={{ width: 46, height: 56, borderRadius: 18, border: `1.5px solid ${pin[i] ? "var(--ds-navy)" : "transparent"}`, background: canInputPin ? "#fff" : "rgba(255,255,255,.5)", textAlign: "center", font: "700 22px var(--ds-font)", outline: "none", minHeight: 56 }}
                    />
                  ))}
                </div>
                <p className="ds-sub" style={{ margin: "12px 0 0", minHeight: 18 }}>
                  {isLoading ? "Memuat data..." : loadError ? "Gagal terhubung ke server" : !canInputPin ? (resolveError ? "Pilih karyawan yang benar" : "Ketik atau pilih nama karyawan") : isVerifying ? "Memverifikasi..." : isPinComplete ? "" : "Masukkan PIN 6 digit"}
                </p>
              </div>

              <DsButton block disabled={!canInputPin || !isPinComplete || isVerifying} onClick={submitPin}>{isVerifying ? "Memverifikasi…" : "Masuk"}</DsButton>
            </div>

            <div style={{ textAlign: "center", marginTop: 18 }}>
              <DsButton variant="ghost" size="md" onClick={() => navigate({ to: "/register" as any })}>Daftar karyawan baru</DsButton>
            </div>
            <p className="ds-sub" style={{ textAlign: "center", marginTop: 18, opacity: 0.7 }}>Djiwa Tentram — Kehadiran Karyawan</p>
          </section>
        </motion.div>
      </main>
    </DsRoot>
  );
}
