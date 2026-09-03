import type { StoryMediaType } from "./story-types";

export const STORY_MAX_VIDEO_SECONDS = 15;
export const STORY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const STORY_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function isStoryExpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

export function validateStoryFile(file: File, mediaType: StoryMediaType, durationSeconds?: number): string | null {
  const allowed = mediaType === "image" ? file.type.startsWith("image/") : file.type === "video/mp4" || file.type === "video/webm";
  if (!allowed) return mediaType === "image" ? "Pilih file gambar yang didukung." : "Pilih video MP4 atau WebM.";
  const limit = mediaType === "image" ? STORY_MAX_IMAGE_BYTES : STORY_MAX_VIDEO_BYTES;
  if (file.size > limit) return `Ukuran file terlalu besar. Maksimal ${mediaType === "image" ? "10 MB" : "50 MB"}.`;
  if (mediaType === "video" && durationSeconds !== undefined && durationSeconds > STORY_MAX_VIDEO_SECONDS) return "Durasi video maksimal 15 detik.";
  return null;
}

export function parseStoryDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
