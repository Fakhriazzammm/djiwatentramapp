export const CAMPAIGN_PROOF_PLATFORMS = ["TikTok", "Instagram", "YouTube", "Threads", "Lainnya"] as const;
const platformHosts: Readonly<Record<string, readonly string[]>> = {
  TikTok: ["tiktok.com"], Instagram: ["instagram.com", "instagr.am"],
  YouTube: ["youtube.com", "youtu.be"], Threads: ["threads.net", "threads.com"],
};

export function campaignProofMatchesPlatform(value: string, platform: string) {
  const hosts = platformHosts[platform];
  if (!hosts) return true;
  try {
    const link = new URL(value);
    return (link.protocol === "https:" || link.protocol === "http:") && !link.username && !link.password
      && hosts.some((host) => link.hostname === host || link.hostname.endsWith("." + host));
  } catch { return false; }
}

export type CampaignSow = { title: string; sections: { title: string; items: string[] }[]; closing?: string; days?: number };
export type CampaignFields = {
  application_mode: "invite" | "open" | "visit";
  cover_url: string | null;
  terms: string[];
  sow: CampaignSow | null;
  proof_platforms: string[];
};
export type CampaignDraft = { description: string; deliverableSummary: string };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const lines = (value: unknown, limit: number, max: number) =>
  Array.isArray(value) ? value.slice(0, limit).map((v) => clean(v, max)).filter(Boolean) : [];

export function parseCampaignFields(body: Record<string, unknown>): CampaignFields {
  const mode = body.applicationMode === "open" || body.applicationMode === "visit" ? body.applicationMode : "invite";
  const terms = lines(body.terms, 20, 600);
  const cover = clean(body.coverUrl, 2048);
  if (cover && !/^\/campaign-images\/[a-z0-9][a-z0-9.-]*\.(webp|png|jpe?g)$/i.test(cover)) {
    let parsed: URL | undefined;
    try { parsed = new URL(cover); } catch { /* invalid URL */ }
    if (parsed?.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Gunakan URL gambar HTTPS yang valid.");
  }

  const raw = record(body.sow);
  const sections = Array.isArray(raw.sections) ? raw.sections.slice(0, 12).map(record).map((section) => ({
    title: clean(section.title, 120),
    items: lines(section.items, 40, 500),
  })).filter((section) => section.title && section.items.length) : [];
  const days = raw.days == null || raw.days === "" ? undefined : Number(raw.days);
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 60)) {
    throw new Error("Batas tayang harus 1–60 hari.");
  }
  const sow = sections.length ? { title: clean(raw.title, 160) || "Scope of Work", sections, closing: clean(raw.closing, 1000), days: days ?? (mode === "visit" ? 7 : undefined) } : null;
  const proof = [...new Set(lines(body.proofPlatforms, 5, 30))];
  if (proof.some((p) => !CAMPAIGN_PROOF_PLATFORMS.some((platform) => platform === p))) throw new Error("Platform bukti konten tidak valid.");
  if (mode !== "invite" && body.status === "published" && (!terms.length || !sow)) {
    throw new Error("Lengkapi SOW dan syarat persetujuan sebelum menerbitkan kampanye yang menerima pendaftaran.");
  }
  return { application_mode: mode, cover_url: cover || null, terms, sow, proof_platforms: proof };
}

const editorKeys = {
  applicationMode: "application_mode",
  coverUrl: "cover_url",
  terms: "terms",
  sow: "sow",
  proofPlatforms: "proof_platforms",
} as const;

export function campaignFieldsForUpdate(body: Record<string, unknown>, previous: CampaignFields): Partial<CampaignFields> {
  const normalized = parseCampaignFields({
    applicationMode: previous.application_mode, coverUrl: previous.cover_url, terms: previous.terms,
    sow: previous.sow, proofPlatforms: previous.proof_platforms, ...body,
  });
  return Object.fromEntries(Object.entries(editorKeys)
    .filter(([field]) => Object.hasOwn(body, field))
    .map(([, column]) => [column, normalized[column]]));
}

export async function generateCampaignDraft(
  input: Record<string, unknown>,
  cfg: { key?: string | null; baseUrl: string; model: string },
  fetcher = fetch,
): Promise<CampaignDraft> {
  if (!cfg.key) throw new Error("Layanan AI kampanye belum dikonfigurasi.");
  const title = clean(input.title, 160);
  const brief = clean(input.brief, 6000);
  if (!title || !brief) throw new Error("Isi judul dan bahan draf terlebih dahulu.");
  let response: Response;
  try {
    response = await fetcher(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 900,
        ...(cfg.model.startsWith("qwen") ? { enable_thinking: false, response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: "Tulis ajakan kampanye creator dalam bahasa Indonesia yang natural. Deskripsi maksimal tiga kalimat dan ringkasan satu kalimat. Gunakan fakta yang diberikan saja. Jangan menambah promo, nominal, persetujuan, lokasi, atau kewajiban. Kembalikan objek JSON dengan description dan deliverableSummary, keduanya string teks biasa." },
          { role: "user", content: JSON.stringify({ title, brief }) },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error("Gateway AI belum bisa dijangkau. Draf masih bisa diedit manual.");
  }
  if (!response.ok) throw new Error("Layanan AI sedang tidak tersedia. Draf masih bisa diedit manual.");
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI belum menghasilkan draf yang bisa digunakan.");
  let draft: Record<string, unknown>;
  try { draft = record(JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1))); }
  catch { throw new Error("Format draf AI belum valid. Coba lagi."); }
  const description = clean(draft.description, 4000);
  const deliverableSummary = clean(draft.deliverableSummary, 2000);
  if (!description || !deliverableSummary) throw new Error("Isi draf AI belum lengkap. Coba lagi.");
  return { description, deliverableSummary };
}
