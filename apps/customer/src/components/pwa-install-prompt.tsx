import { Download, X } from "lucide-react";
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
    if (!isMobile() || isStandalone()) return;

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
    <aside className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-[270px] rounded-[12px] border border-primary/15 bg-card/95 p-2 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur-xl" role="dialog" aria-label="Download Djiwa App">
      <button type="button" onClick={close} aria-label="Tutup popup download untuk kunjungan ini" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-3 w-3" /></button>
      <div className="flex items-start gap-2 pr-6">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Download className="h-3.5 w-3.5" /></div>
        <div className="min-w-0">
          <p className="text-[11px] font-black">Download Djiwa App</p>
          <p className="mt-0.5 text-[9px] font-bold leading-snug text-primary">{guide.title}</p>
        </div>
      </div>
      <div className="mt-1.5 rounded-lg bg-primary/5 px-2 py-1.5 text-[9px] leading-snug text-muted-foreground"><ol className="space-y-0.5">{guide.steps.map((step, index) => <li key={step}><span className="font-black text-foreground">{index + 1}.</span> {step}</li>)}</ol><p className="mt-1 border-t border-primary/10 pt-1 text-[8px] leading-snug text-muted-foreground">{guide.note}</p></div>
      {!ios ? <button type="button" onClick={() => void install()} disabled={installing} className="mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-black text-primary-foreground disabled:opacity-60"><Download className="h-3.5 w-3.5" /> {installing ? "Menyiapkan..." : "Download sekarang"}</button> : null}
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
