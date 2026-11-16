import { useEffect, useState } from "react";
import { colorFor } from "./kol-lib";

/** Foto creator; bila belum ada atau gagal dimuat, tampil huruf awal dengan warna tetap per nama. */
export function AvatarImg({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  const letter = (name.trim()[0] || "C").toUpperCase();
  return (
    <div className="kx-av" style={{ width: size, height: size, fontSize: size * 0.4, background: url && !failed ? "#e9ecf1" : colorFor(name || "C") }}>
      {url && !failed ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : letter}
    </div>
  );
}
