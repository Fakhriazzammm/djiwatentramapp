"use client";

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Fingerprint, UserCheck, ShieldCheck, AlertCircle, ChevronDown, Search } from "lucide-react";
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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 }}
        className="w-full max-w-sm"
      >
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg">
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Fingerprint className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Absen Karyawan</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pilih nama kamu, lalu masukkan PIN
            </p>
          </div>

          {loadError && (
            <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive mb-3">
              <p className="font-medium">Gagal memuat data karyawan</p>
              <p className="text-xs mt-1 opacity-80">{loadError}</p>
            </div>
          )}

          {/* Name/Username Input with Dropdown */}
          <div className="relative mb-3" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={nameRef}
                type="text"
                placeholder={isLoading ? "Memuat daftar karyawan..." : "Cari nama karyawan..."}
                value={nameQuery}
                onChange={handleNameChange}
                onFocus={handleNameFocus}
                onKeyDown={handleNameKeyDown}
                disabled={isLoading}
                className={`w-full rounded-xl border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:ring-1 ${
                  resolveError
                    ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                    : resolvedUser
                      ? "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200"
                      : "border-border/60 focus:border-primary/50 focus:ring-primary/20"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Status indicator when user resolved */}
            {resolvedUser && !resolveError && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                  <UserCheck className="h-3 w-3 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-600">{resolvedUser.name}</span>
              </div>
            )}
            {resolveError && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-500">{resolveError}</span>
              </div>
            )}

            {/* Dropdown list */}
            {showDropdown && !isLoading && (
              <div className="absolute z-50 mt-1 w-full rounded-xl border border-border/60 bg-card shadow-lg max-h-60 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                    {nameQuery.trim() ? "Karyawan tidak ditemukan" : "Tidak ada data karyawan"}
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => selectUser(user)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                        resolvedUser?._id === user._id ? "bg-accent/50 font-medium" : ""
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                        {user.initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate">{user.name}</p>
                        {user.username && (
                          <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                        )}
                      </div>
                      {resolvedUser?._id === user._id && (
                        <UserCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* PIN Input */}
          <div className="text-center">
            <div className="mb-3 flex items-center justify-center gap-2.5">
              {pinIndexes.map((i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={pin[i]}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  onPaste={i === 0 ? handlePinPaste : undefined}
                  disabled={!canInputPin || isVerifying}
                  className={`h-11 w-11 rounded-xl border text-center text-lg font-bold outline-none transition-all
                    ${isVerifying
                      ? "border-muted bg-muted/30 text-muted-foreground"
                      : canInputPin
                        ? "border-primary/40 bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                        : "border-muted/60 bg-muted/20 text-muted-foreground/30"
                    }
                    ${pin[i] ? "border-primary/60 shadow-sm" : ""}
                  `}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Memuat data..."
                : loadError
                  ? "Gagal terhubung ke server"
                  : !canInputPin
                    ? resolveError
                      ? "Pilih karyawan yang benar"
                      : "Ketik atau pilih nama karyawan"
                    : isVerifying
                      ? "Memverifikasi..."
                      : isPinComplete
                        ? ""
                        : "Masukkan PIN 6 digit"}
            </p>
          </div>
        </div>

        {/* Register link */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate({ to: "/register" as any })}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Daftar Karyawan Baru
          </button>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Djiwa Tentram — Kehadiran Karyawan
        </p>
      </motion.div>
    </div>
  );
}
