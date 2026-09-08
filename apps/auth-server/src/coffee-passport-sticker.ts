import { execFileSync } from "node:child_process";

const STICKER_MODEL = process.env.COFFEE_PASSPORT_STICKER_MODEL || "cx/gpt-5.5-image";
const STICKER_PROMPT_VERSION = "v1";
const STICKER_PROVIDER_URL = (process.env.NINEROUTER_IMAGE_URL || "http://127.0.0.1:20128/v1/images/generations")
  .replace(/\/$/, "");
const STICKER_PROVIDER_KEY = process.env.NINEROUTER_API_KEY || "";
const NINEROUTER_KEY_DB = "/home/ubuntu/.9router/db/data.sqlite";
const STICKER_TIMEOUT_MS = 180_000;
const MAX_STICKER_BYTES = 12 * 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export type CoffeePassportStickerContext = {
  shopName: string;
  area: string | null;
  visitTitle: string;
};

export function buildCoffeePassportStickerPrompt(context: CoffeePassportStickerContext) {
  const shopName = context.shopName.trim().slice(0, 160);
  const area = (context.area || "Tasikmalaya").trim().slice(0, 80);
  const visitTitle = context.visitTitle.trim().slice(0, 120);
  return [
    "Create a collectible Coffee Passport sticker artwork.",
    `Coffee shop: ${shopName}.`,
    `Area: ${area}.`,
    `Visit theme: ${visitTitle}.`,
    "Style: youthful Tasikmalaya coffee culture, modern, friendly, premium, memorable.",
    "Centered composition, bold clean silhouette, polished sticker illustration, opaque background, generous safe margin.",
    "No watermark, no photorealistic UI, no extra paragraphs, no misleading brand logos.",
  ].join(" ").slice(0, 800);
}

export function isValidPng(raw: Uint8Array) {
  return raw.byteLength >= PNG_SIGNATURE.byteLength
    && PNG_SIGNATURE.every((value, index) => raw[index] === value);
}

export function stickerPromptVersion() {
  return STICKER_PROMPT_VERSION;
}

export function stickerModel() {
  return STICKER_MODEL;
}

function resolveNineRouterKey() {
  if (STICKER_PROVIDER_KEY) return STICKER_PROVIDER_KEY;
  try {
    return execFileSync("python3", ["-c", "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); row=db.execute(\"select key from apiKeys where isActive=1 order by case when name='mimo' then 0 else 1 end limit 1\").fetchone(); db.close(); print(row[0] if row and row[0] else '')", NINEROUTER_KEY_DB], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export async function generateCoffeePassportPng(prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STICKER_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "image/png" };
    const providerKey = resolveNineRouterKey();
    if (providerKey) headers.Authorization = `Bearer ${providerKey}`;
    const response = await fetch(`${STICKER_PROVIDER_URL}?response_format=binary`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: STICKER_MODEL,
        prompt,
        size: "1024x1024",
        quality: "high",
        background: "opaque",
        output_format: "png",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`provider_http_${response.status}`);
      (error as { providerStatus?: number }).providerStatus = response.status;
      throw error;
    }
    const raw = new Uint8Array(await response.arrayBuffer());
    if (raw.byteLength > MAX_STICKER_BYTES || !isValidPng(raw)) throw new Error("invalid_png");
    return raw;
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw new Error("provider_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const stickerLimits = {
  timeoutMs: STICKER_TIMEOUT_MS,
  maxBytes: MAX_STICKER_BYTES,
};
