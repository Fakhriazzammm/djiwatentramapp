import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, BadgeCheck, ChevronRight, Globe2, HeartHandshake, Instagram, MapPin, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  {
    href: "https://djiwatentram.yumme.id",
    label: "Djiwa Tentram App",
    description: "Pesan menu favorit dengan mudah",
    icon: Globe2,
    tone: "bg-[#eaf2ff] text-[#1a5dc6]",
  },
  {
    href: "https://booking.yumme.id",
    label: "Booking Djiwa Tentram",
    description: "Rencanakan momen spesialmu",
    icon: MapPin,
    tone: "bg-[#eef7f4] text-[#19745d]",
  },
  {
    href: "https://rekrutmen.yumme.id",
    label: "Karier bersama kami",
    description: "Temukan kesempatan untuk bertumbuh",
    icon: HeartHandshake,
    tone: "bg-[#fff4e8] text-[#b56715]",
  },
];

const greetings = [
  "Selamat datang di Djiwa Tentram",
  "Tempat nyaman untuk momen berarti",
  "Pesan, rencanakan, dan bertumbuh bersama",
  "Semua perjalananmu dimulai dari sini",
];

const spring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };

export function App() {
  const reduceMotion = useReducedMotion();
  const [greetingIndex, setGreetingIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => setGreetingIndex((current) => (current + 1) % greetings.length), 3600);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <div className="linkbio-bg relative min-h-screen overflow-hidden px-4 py-6 text-[#17233f] sm:px-6 sm:py-10">
      <div className="linkbio-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-24 h-56 w-56 rounded-full bg-[#b8d5ff]/30 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -18, 0], y: [0, 14, 0], scale: [1, 1.05, 1] }}
        transition={reduceMotion ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <main className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[480px] flex-col items-center">
        <motion.header
          className="flex w-full items-center justify-between"
          initial={reduceMotion ? false : { opacity: 0, y: -12 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={spring}
        >
          <div className="flex items-center gap-2.5">
            <img src="/logo-djiwa.png" alt="Logo Djiwa Tentram" className="h-10 w-10 rounded-[14px] object-contain shadow-[0_8px_24px_rgba(26,93,198,0.14)]" />
            <div>
              <p className="font-display text-sm font-extrabold tracking-[-0.03em] text-[#17366f]">Djiwa Tentram</p>
              <p className="text-[11px] font-medium text-[#6b7d9e]">Centrik untuk hidup yang berarti</p>
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/70 text-[#1a5dc6] shadow-[0_8px_22px_rgba(45,93,153,0.08)] backdrop-blur">
            <Sparkles className="h-4 w-4" strokeWidth={2} />
          </div>
        </motion.header>

        <motion.section
          className="mt-12 w-full text-center sm:mt-16"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.08 }}
        >
          <div className="mx-auto flex h-[86px] w-[86px] items-center justify-center rounded-[28px] border border-white/90 bg-white/80 p-3 shadow-[0_18px_48px_rgba(39,91,157,0.14)] backdrop-blur sm:h-[98px] sm:w-[98px] sm:rounded-[32px]">
            <img src="/logo-djiwa.png" alt="Djiwa Tentram" className="h-full w-full object-contain" />
          </div>
          <div className="mt-7 min-h-[72px]">
            <AnimatePresence mode="wait">
              <motion.h1
                key={greetingIndex}
                className="font-display text-[27px] font-extrabold leading-[1.12] tracking-[-0.055em] text-[#17366f] sm:text-[32px]"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              >
                {greetings[greetingIndex]}
              </motion.h1>
            </AnimatePresence>
          </div>
          <p className="mx-auto mt-3 max-w-[355px] text-sm leading-6 text-[#617594] sm:text-[15px]">
            Satu ruang untuk menemukan layanan, cerita, dan kesempatan dari keluarga Djiwa Tentram.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#1a5dc6]">
            <BadgeCheck className="h-4 w-4" strokeWidth={2.4} />
            <span>Official links</span>
          </div>
        </motion.section>

        <motion.nav
          aria-label="Link resmi Djiwa Tentram"
          className="mt-9 flex w-full flex-col gap-3.5"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: 0.16 } } }}
        >
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <motion.a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  show: { opacity: 1, y: 0, transition: spring },
                }}
                whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
                whileTap={reduceMotion ? undefined : { scale: 0.975 }}
                className="group flex min-h-[74px] items-center gap-3.5 rounded-[22px] border border-white/90 bg-white/85 px-4 py-3.5 text-left shadow-[0_12px_34px_rgba(39,91,157,0.09)] backdrop-blur transition-shadow duration-200 hover:shadow-[0_18px_40px_rgba(39,91,157,0.15)]"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${link.tone}`}>
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[14px] font-extrabold tracking-[-0.02em] text-[#1e3155]">{link.label}</span>
                  <span className="mt-0.5 block text-[12px] font-medium text-[#7890b2]">{link.description}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-[#7e9ac2] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
              </motion.a>
            );
          })}
        </motion.nav>

        <motion.section
          className="mt-7 flex w-full items-center justify-between rounded-[20px] border border-white/80 bg-white/55 px-4 py-3 text-[11px] font-medium text-[#7185a3] backdrop-blur"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <span>Temukan yang kamu butuhkan</span>
          <ChevronRight className="h-4 w-4 text-[#1a5dc6]" />
        </motion.section>

        <footer className="mt-auto flex flex-col items-center gap-3 pb-2 pt-12 text-center">
          <div className="flex items-center gap-4 text-[#7890b2]">
            <a aria-label="Instagram Djiwa Tentram" href="https://instagram.com/djiwa.tentram" target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/60 transition-colors hover:text-[#1a5dc6]"><Instagram className="h-4 w-4" /></a>
          </div>
          <p className="text-[11px] font-medium text-[#8ea0bb]">© {new Date().getFullYear()} Djiwa Tentram. Dibuat dengan ketenangan.</p>
        </footer>
      </main>
    </div>
  );
}
