import { useEffect, useState } from "react";
import { Btn } from "../shell/dpx-ui";

const DAY = 24 * 60 * 60 * 1000;
const WIB = 7 * 60 * 60 * 1000;

export function sundayWindow(now: number) {
  const jakarta = now + WIB;
  return {
    active: new Date(jakarta).getUTCDay() === 0,
    untilMidnight: DAY - jakarta % DAY,
  };
}

export function SundayReviewCard({ onOpen }: { onOpen: () => void }) {
  const [active, setActive] = useState(() => sundayWindow(Date.now()).active);
  useEffect(() => {
    let timer: number;
    function refresh() {
      window.clearTimeout(timer);
      const current = sundayWindow(Date.now());
      setActive(current.active);
      timer = window.setTimeout(refresh, current.untilMidnight);
    }
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  if (!active) return null;
  return <Btn type="button" className="dpx-sunday-review" onClick={onOpen}>
    <span className="dpx-sunday-copy">
      <strong>Jeda mingguan</strong>
      <span>Lihat cerita keuangan tujuh hari ini bersama AI.</span>
      <b>Buka laporan <span aria-hidden="true">→</span></b>
    </span>
    <img src="/assets/djiwapay-studio/mascot-sunday.png" width="108" height="108" alt="" />
  </Btn>;
}
