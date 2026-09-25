import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "djiwa-pwa-install-dismissed-until";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobile() {
  return window.matchMedia("(max-width: 900px)").matches || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasDismissed() {
  const until = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
  return Number.isFinite(until) && until > Date.now();
}

function dismiss() {
  window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_FOR_MS));
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone() || wasDismissed()) return;

    const showIosGuide = isIos();
    if (showIosGuide) {
      const timer = window.setTimeout(() => {
        setIos(true);
        setVisible(true);
      }, 1800);
      return () => window.clearTimeout(timer);
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 900);
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
    dismiss();
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

  return (
    <aside className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-md rounded-[22px] border border-primary/15 bg-card/95 p-3 shadow-[0_16px_50px_rgba(15,23,42,0.2)] backdrop-blur-xl" role="dialog" aria-label="Install Djiwa App">
      <button type="button" onClick={close} aria-label="Tutup ajakan install aplikasi" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      <div className="flex items-start gap-3 pr-8">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Download className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-sm font-black">Pasang Djiwa App</p>
          {ios ? <><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Akses lebih cepat dari layar utama.</p><p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-primary"><Share className="h-3.5 w-3.5" /> Tekan Share → Add to Home Screen</p></> : <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Simpan sebagai aplikasi mobile agar lebih cepat dibuka.</p>}
        </div>
      </div>
      {ios ? <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary/5 px-2.5 py-2 text-[10px] text-muted-foreground"><Share className="h-3.5 w-3.5 shrink-0 text-primary" /> Pilih <span className="font-black text-foreground">Add to Home Screen</span>, lalu tekan Add.</div> : <button type="button" onClick={() => void install()} disabled={installing} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-60"><Download className="h-4 w-4" /> {installing ? "Menyiapkan..." : "Install sekarang"}</button>}
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
