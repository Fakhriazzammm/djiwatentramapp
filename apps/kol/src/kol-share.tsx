import { Download, Link2, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KxSheet } from "./kol-sheet";
import type { RewardInfo } from "./kol-rewards";

/** Bagikan kampanye: tautan (Web Share / salin / WhatsApp, Telegram, X, Facebook) dan gambar format Instagram Story 1080x1920. */
export type ShareCampaignInfo = {
  slug: string; title: string; location?: string | null; benefit_description?: string | null;
  start_date?: string | null; end_date?: string | null; cover_url?: string | null; reward?: RewardInfo | null;
};

const W = 1080, H = 1920;
const FONT = '-apple-system, "SF Pro Display", "Inter", "Segoe UI", system-ui, sans-serif';
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const shortDay = (v?: string | null) => (v ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "");

export const campaignUrl = (slug: string) => `${window.location.origin}/campaigns/${encodeURIComponent(slug)}`;
export const campaignCaption = (c: ShareCampaignInfo) =>
  `${c.title}${c.reward ? ` — reward ${rp(c.reward.ratePer1000)} per 1.000 view, dibayar ke saldo Djiwa Pay` : ""}. Daftar sekarang:`;

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`; }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Gambar story: foto kampanye penuh di atas, kartu reward, benefit, dan ajakan daftar. */
export async function renderStory(c: ShareCampaignInfo): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14306a"); bg.addColorStop(0.55, "#0f2347"); bg.addColorStop(1, "#0a1630");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const cover = c.cover_url ? (await loadImage(c.cover_url, true)) ?? (await loadImage(c.cover_url, false)) : null;
  const photoH = 1060;
  if (cover) {
    const scale = Math.max(W / cover.width, photoH / cover.height);
    const dw = cover.width * scale, dh = cover.height * scale;
    ctx.drawImage(cover, (W - dw) / 2, (photoH - dh) / 2, dw, dh);
  } else {
    const alt = ctx.createLinearGradient(0, 0, W, photoH); alt.addColorStop(0, "#1a5dc6"); alt.addColorStop(1, "#13804a");
    ctx.fillStyle = alt; ctx.fillRect(0, 0, W, photoH);
  }
  const fade = ctx.createLinearGradient(0, photoH - 520, 0, photoH + 40);
  fade.addColorStop(0, "rgba(15,35,71,0)"); fade.addColorStop(1, "#0f2347");
  ctx.fillStyle = fade; ctx.fillRect(0, photoH - 520, W, 560);
  const top = ctx.createLinearGradient(0, 0, 0, 300);
  top.addColorStop(0, "rgba(10,22,48,.65)"); top.addColorStop(1, "rgba(10,22,48,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 300);

  // Penanda merek
  const logo = await loadImage("/logo-djiwa.png", false);
  ctx.fillStyle = "rgba(255,255,255,.92)"; roundRect(ctx, 60, 70, 470, 84, 42); ctx.fill();
  if (logo) { const s = 56 / Math.max(logo.width, logo.height); ctx.drawImage(logo, 80, 84, logo.width * s, logo.height * s); }
  ctx.fillStyle = "#0f2347"; ctx.font = `700 34px ${FONT}`; ctx.textBaseline = "middle";
  ctx.fillText("Djiwa Tentram × Kreator", logo ? 150 : 86, 112);

  // Judul
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#ffffff"; ctx.font = `800 92px ${FONT}`;
  const titleLines = wrap(ctx, c.title, W - 120, 3);
  let y = photoH - 90 - (titleLines.length - 1) * 100;
  for (const line of titleLines) { ctx.fillText(line, 60, y); y += 100; }
  y -= 100;
  ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = `500 38px ${FONT}`;
  const sub = [c.location, c.start_date && c.end_date ? `${shortDay(c.start_date)} – ${shortDay(c.end_date)}` : ""].filter(Boolean).join("  ·  ");
  if (sub) { const l = wrap(ctx, sub, W - 120, 1); ctx.fillText(l[0], 60, y + 64); }

  // Kartu reward
  const cardY = photoH + 60;
  const reward = c.reward;
  const grad = ctx.createLinearGradient(60, cardY, W - 60, cardY + 360);
  grad.addColorStop(0, "#1fa463"); grad.addColorStop(1, "#13804a");
  ctx.fillStyle = grad; roundRect(ctx, 60, cardY, W - 120, 360, 48); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `700 32px ${FONT}`;
  ctx.fillText(reward ? "REWARD UNTUK KREATOR" : "KAMPANYE KREATOR", 110, cardY + 78);
  ctx.fillStyle = "#ffffff";
  if (reward) {
    ctx.font = `800 118px ${FONT}`; ctx.fillText(rp(reward.ratePer1000), 106, cardY + 205);
    const rateW = ctx.measureText(rp(reward.ratePer1000)).width;
    ctx.font = `600 40px ${FONT}`; ctx.fillText("/ 1.000 view", 106 + rateW + 18, cardY + 205);
    ctx.font = `600 36px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillText(`Tiap view dihitung · maks ${rp(reward.maxPerKol)}`, 110, cardY + 272);
    ctx.fillText(`Dibayar H+${reward.settleDays} ke saldo Djiwa Pay`, 110, cardY + 326);
  } else {
    ctx.font = `800 80px ${FONT}`; const l = wrap(ctx, c.benefit_description || "Daftar dan berkolaborasi", W - 220, 2);
    l.forEach((t, i) => ctx.fillText(t, 110, cardY + 190 + i * 92));
  }

  // Benefit
  let by = cardY + 360 + 60;
  if (c.benefit_description && reward) {
    ctx.fillStyle = "rgba(255,255,255,.14)"; roundRect(ctx, 60, by, W - 120, 110, 55); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.font = `700 36px ${FONT}`;
    const l = wrap(ctx, `Benefit: ${c.benefit_description}`, W - 230, 1);
    ctx.textBaseline = "middle"; ctx.fillText(l[0], 100, by + 56); ctx.textBaseline = "alphabetic";
    by += 110 + 50;
  } else by += 20;

  // Ajakan
  ctx.fillStyle = "#ffffff"; roundRect(ctx, 60, by, W - 120, 124, 62); ctx.fill();
  ctx.fillStyle = "#0f2347"; ctx.font = `800 48px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Daftar sekarang  →", W / 2, by + 64);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = `600 34px ${FONT}`; ctx.textAlign = "center";
  ctx.fillText(`kol.djiwatentram.web.id/campaigns/${c.slug}`.slice(0, 64), W / 2, Math.min(H - 70, by + 124 + 66));
  ctx.textAlign = "left";

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("RENDER_FAILED"))), "image/png"));
}

export function ShareCampaign({ campaign }: { campaign: ShareCampaignInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" style={{ justifySelf: "start", width: "auto", gap: 8 }} onClick={() => setOpen(true)}><Share2 size={16} />Bagikan</button>
      {open && <ShareSheet campaign={campaign} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareSheet({ campaign: c, onClose }: { campaign: ShareCampaignInfo; onClose: () => void }) {
  const url = useMemo(() => campaignUrl(c.slug), [c.slug]);
  const caption = useMemo(() => campaignCaption(c), [c]);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const made = useRef(false);
  useEffect(() => {
    if (made.current) return; made.current = true;
    renderStory(c).then((b) => { setBlob(b); setPreview(URL.createObjectURL(b)); }).catch(() => setError("Gambar belum bisa dibuat. Coba lagi."));
  }, [c]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const file = blob ? new File([blob], `${c.slug}-story.png`, { type: "image/png" }) : null;
  const canShareFile = Boolean(file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
  const flash = (text: string) => { setMsg(text); window.setTimeout(() => setMsg(""), 2400); };
  const copy = async () => { try { await navigator.clipboard.writeText(url); flash("Link disalin."); } catch { window.prompt("Salin link", url); } };
  const shareLink = async () => {
    if (navigator.share) { try { await navigator.share({ title: c.title, text: caption, url }); } catch { /* dibatalkan */ } } else await copy();
  };
  const shareImage = async () => {
    if (!file) return;
    if (canShareFile) { try { await navigator.share({ files: [file], title: c.title, text: `${caption} ${url}` }); } catch { /* dibatalkan */ } }
    else download();
  };
  const download = () => {
    if (!blob) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${c.slug}-story.png`; document.body.appendChild(a); a.click(); a.remove();
    flash("Gambar diunduh. Unggah ke Instagram Story.");
  };
  const text = encodeURIComponent(`${caption} ${url}`);
  const links: Array<[string, string]> = [
    ["WhatsApp", `https://wa.me/?text=${text}`], ["Telegram", `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(caption)}`],
    ["X", `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`], ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
  ];
  return (
    <KxSheet title="Bagikan kampanye" onClose={onClose}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ justifySelf: "center", width: "min(190px, 52vw)", aspectRatio: "9 / 16", borderRadius: 18, overflow: "hidden", background: "#e4e8f1", boxShadow: "0 10px 30px rgba(15,35,71,.18)" }}>
          {preview ? <img src={preview} alt="Pratinjau gambar Instagram Story kampanye" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div className="kx-sub" style={{ display: "grid", placeItems: "center", height: "100%", textAlign: "center", padding: 12 }}>{error || "Membuat gambar…"}</div>}
        </div>
        <p className="kx-sub" style={{ margin: 0, textAlign: "center" }}>Format Instagram Story 1080 × 1920, lengkap dengan foto kampanye dan reward.</p>
        <div className="kx-row2">
          <button type="button" className="kx-btn" disabled={!blob} onClick={() => void shareImage()}><Share2 size={17} style={{ marginRight: 8 }} />{canShareFile ? "Bagikan gambar" : "Unduh gambar"}</button>
          <button type="button" className="kx-btn kx-btn--ghost" disabled={!blob} onClick={download}><Download size={17} style={{ marginRight: 8 }} />Unduh</button>
        </div>
        <div className="kx-group">
          <div className="kx-kv" style={{ alignItems: "center" }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url.replace(/^https?:\/\//, "")}</span>
            <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" style={{ width: "auto", flex: "none" }} onClick={() => void copy()}><Link2 size={15} style={{ marginRight: 6 }} />Salin</button></div>
        </div>
        <button type="button" className="kx-btn kx-btn--ghost" onClick={() => void shareLink()}><Share2 size={17} style={{ marginRight: 8 }} />Bagikan link</button>
        <div className="kx-chips" style={{ marginTop: 0 }}>{links.map(([name, href]) => <a key={name} className="kx-chip2" style={{ minHeight: 40, padding: "0 14px" }} href={href} target="_blank" rel="noreferrer">{name}</a>)}</div>
        {msg && <p role="status" className="kx-note" style={{ margin: 0 }}>{msg}</p>}
      </div>
    </KxSheet>
  );
}
