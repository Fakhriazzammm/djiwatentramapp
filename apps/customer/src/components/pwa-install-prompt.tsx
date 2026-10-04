import { Djiwa3DIcon } from "@yumipos/web-shared";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobile() {
  return window.matchMedia("(max-width: 900px)").matches || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

const INSTALL_PROMPT_SEEN_KEY = "djiwa-pwa-install-prompt-seen-date";

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function wasInstallPromptSeenToday() {
  try {
    return localStorage.getItem(INSTALL_PROMPT_SEEN_KEY) === localDateKey();
  } catch {
    return false;
  }
}

function markInstallPromptSeenToday() {
  try {
    localStorage.setItem(INSTALL_PROMPT_SEEN_KEY, localDateKey());
  } catch {
    // Prompt tetap boleh dipakai jika storage browser diblokir.
  }
}

type InstallGuide = {
  title: string;
  steps: string[];
  note: string;
};

function installGuide(ios: boolean): InstallGuide {
  if (ios) return {
    title: "Safari iPhone / iPad",
    steps: ["Tekan ikon Share (kotak dengan panah ke atas).", "Geser menu lalu pilih Add to Home Screen.", "Tekan Add di kanan atas untuk menyimpan."],
    note: "Jika Add to Home Screen belum terlihat, geser daftar menu Share ke bawah.",
  };
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("samsungbrowser")) return {
    title: "Samsung Internet",
    steps: ["Tekan menu ☰ di bagian bawah atau kanan bawah.", "Pilih Add page to, lalu Home screen.", "Tekan Add untuk menyimpan ke layar utama."],
    note: "Nama menu dapat tampil sebagai Add to Home screen pada beberapa versi.",
  };
  if (agent.includes("firefox")) return {
    title: "Firefox Android",
    steps: ["Tekan menu ⋮ di kanan atas.", "Pilih Install atau Add to Home screen.", "Konfirmasi dengan Add / Install."],
    note: "Jika opsi belum tersedia, buka situs ini langsung di Firefox dan bukan dari browser dalam aplikasi lain.",
  };
  if (agent.includes("chrome") || agent.includes("crios")) return {
    title: "Chrome Android",
    steps: ["Tekan Download sekarang di bawah.", "Pada dialog yang muncul, pilih Install.", "Jika tidak ada dialog, buka menu ⋮ lalu pilih Install app atau Add to Home screen."],
    note: "Pastikan halaman dibuka di Chrome, bukan dari browser dalam aplikasi WhatsApp atau Instagram.",
  };
  return {
    title: "Browser Android",
    steps: ["Buka menu browser ⋮ atau ☰.", "Cari Install app, Install, atau Add to Home screen.", "Konfirmasi dengan Add / Install."],
    note: "Nama menu berbeda menurut browser dan versi perangkat.",
  };
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone() || wasInstallPromptSeenToday()) return;

    const showIosGuide = isIos();
    if (showIosGuide) {
      const timer = window.setTimeout(() => {
        setIos(true);
        markInstallPromptSeenToday();
        setVisible(true);
      }, 1800);
      return () => window.clearTimeout(timer);
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      window.setTimeout(() => {
        markInstallPromptSeenToday();
        setVisible(true);
      }, 900);
    };
    const handleInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!visible || isStandalone()) return null;

  const close = () => {
    markInstallPromptSeenToday();
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    else close();
    setDeferredPrompt(null);
    setInstalling(false);
  };

  const guide = installGuide(ios);

  return (
    <aside className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-[310px] rounded-2xl border border-primary/15 bg-card/95 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.16)] backdrop-blur-xl" role="dialog" aria-label="Install Djiwa App">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Djiwa3DIcon name="customer-benefit-promo" size="sm" alt="" className="h-10 w-10 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight">Install Djiwa App</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Akses lebih cepat dari layar utama.</p>
        </div>
        <button type="button" onClick={close} aria-label="Tutup popup install" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">×</button>
      </div>
      {ios ? <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">Safari: tekan <strong className="text-foreground">Share</strong> → <strong className="text-foreground">Add to Home Screen</strong> → <strong className="text-foreground">Add</strong>.</p> : <button type="button" onClick={() => void install()} disabled={installing} className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground transition active:scale-[.98] disabled:opacity-60">{installing ? "Menyiapkan..." : "Install Djiwa App"}</button>}
    </aside>
  );
}

export function MobilePortraitGuard() {
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setLandscape(media.matches && window.matchMedia("(orientation: landscape)").matches);
    update();
    media.addEventListener?.("change", update);
    window.addEventListener("resize", update);

    const standalone = isStandalone();
    if (standalone && "orientation" in screen && typeof screen.orientation.lock === "function") {
      void screen.orientation.lock("portrait").catch(() => undefined);
    }
    return () => {
      media.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!landscape) return null;
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0d2d54] px-8 text-center text-white"><div><div className="mx-auto flex h-16 w-16 rotate-90 items-center justify-center rounded-2xl border-2 border-white/70 text-3xl">📱</div><p className="mt-5 text-lg font-black">Putar kembali ke portrait</p><p className="mt-2 text-sm leading-relaxed text-blue-100">Djiwa App dirancang untuk tampilan mobile portrait.</p></div></div>;
}
