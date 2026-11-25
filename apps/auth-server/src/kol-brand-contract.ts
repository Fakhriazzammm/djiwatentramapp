export const BRAND_PLATFORMS = ["TikTok", "Instagram", "YouTube", "Threads", "X", "LinkedIn"] as const;
export type BrandPlatform = (typeof BRAND_PLATFORMS)[number];

const tidy = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : "";
export const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function validDate(value: string) {
  const date = new Date(value + "T00:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function parseBrandCampaign(body: Record<string, unknown>, today: string) {
  const title = tidy(body.title, 120);
  const brief = tidy(body.brief, 5000);
  const terms = tidy(body.terms, 3000);
  const applicationDeadline = tidy(body.applicationDeadline, 10);
  const deadline = tidy(body.deadline, 10);
  const quota = Number(body.quota);
  if (
    title.length < 2 ||
    brief.length < 10 ||
    !terms ||
    !validDate(applicationDeadline) ||
    !validDate(deadline) ||
    applicationDeadline < today ||
    deadline < applicationDeadline ||
    !Number.isInteger(quota) ||
    quota < 1 ||
    quota > 100 ||
    !Array.isArray(body.tasks) ||
    body.tasks.length < 1 ||
    body.tasks.length > 10
  )
    return null;
  const tasks = [];
  for (const item of body.tasks) {
    const task = objectOf(item);
    const label = tidy(task.label, 100);
    const platform = BRAND_PLATFORMS.find((candidate) => candidate === task.platform);
    const amount = Number(task.amount);
    if (
      !label ||
      !platform ||
      !Number.isSafeInteger(amount) ||
      amount < 1000 ||
      amount > 10000000 ||
      tasks.some(
        (existing) => existing.platform === platform && existing.label.toLowerCase() === label.toLowerCase(),
      )
    )
      return null;
    tasks.push({ label, platform, amount, requiresScreenshot: task.requiresScreenshot === true });
  }
  return { title, brief, terms, applicationDeadline, deadline, quota, tasks };
}

export function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

export function brandPost(value: unknown, platform: string) {
  const url = httpsUrl(value);
  if (!url) return null;
  const host = url.hostname;
  const path = url.pathname.replace(/\/$/, "");
  let id: string | undefined;
  switch (platform) {
    case "X":
      if (["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(host))
        id = path.match(/^\/(?:[\w]+\/status|i\/web\/status)\/(\d+)$/)?.[1];
      break;
    case "LinkedIn":
      if (["linkedin.com", "www.linkedin.com"].includes(host))
        id =
          path.match(/^\/posts\/[^/]*activity-(\d+)(?:-[^/]*)?$/)?.[1] ??
          path.match(/^\/feed\/update\/urn:li:activity:(\d+)$/)?.[1];
      break;
    case "TikTok":
      if (["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host))
        id = path.match(/^\/@[\w.]+\/video\/(\d+)$/)?.[1];
      break;
    case "Instagram":
      if (["instagram.com", "www.instagram.com"].includes(host))
        id = path.match(/^\/(?:p|reel|reels|tv)\/([\w-]+)$/)?.[1];
      break;
    case "YouTube":
      if (host === "youtu.be") id = path.match(/^\/([\w-]{11})$/)?.[1];
      if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host))
        id =
          path === "/watch"
            ? url.searchParams.get("v")?.match(/^[\w-]{11}$/)?.[0]
            : path.match(/^\/(?:shorts|live)\/([\w-]{11})$/)?.[1];
      break;
    case "Threads":
      if (["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(host))
        id = path.match(/^\/@[\w.]+\/post\/([\w-]+)$/)?.[1];
      break;
  }
  if (!id) return null;
  url.hash = "";
  if (platform === "YouTube" && path === "/watch") url.search = new URLSearchParams({ v: id }).toString();
  else url.search = "";
  return { key: `${platform.toLowerCase()}:${id}`, url: url.toString() };
}
