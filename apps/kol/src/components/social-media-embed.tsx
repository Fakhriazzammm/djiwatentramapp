import { ExternalLink } from "lucide-react";

type SocialEmbed = {
  provider: string;
  src: string;
  ratio: "video" | "portrait";
};

const isHost = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

export function resolveSocialEmbed(value: string): SocialEmbed | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (isHost(host, "youtube.com") || host === "youtu.be" || isHost(host, "youtube-nocookie.com")) {
    const id = host === "youtu.be"
      ? path.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") || path.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) {
      return { provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, ratio: "video" };
    }
  }

  if (isHost(host, "tiktok.com")) {
    const id = path.match(/\/@[^/]+\/video\/(\d{16,20})/)?.[1] || path.match(/^\/video\/(\d{16,20})/)?.[1];
    if (id) return { provider: "TikTok", src: `https://www.tiktok.com/embed/v2/${id}`, ratio: "portrait" };
  }

  if (isHost(host, "instagram.com")) {
    const match = path.match(/^\/(p|reel|reels|tv)\/([\w-]{5,20})\/?/);
    if (match) {
      const kind = match[1] === "reels" ? "reel" : match[1];
      return { provider: "Instagram", src: `https://www.instagram.com/${kind}/${match[2]}/embed/`, ratio: "portrait" };
    }
  }

  if (isHost(host, "threads.net") || isHost(host, "threads.com")) {
    const match = path.match(/^(\/@[^/]+\/post\/[\w-]{5,32})\/?/);
    if (match) return { provider: "Threads", src: `https://www.threads.net${match[1]}/embed`, ratio: "portrait" };
  }

  if (isHost(host, "x.com") || isHost(host, "twitter.com")) {
    const id = path.match(/^\/[^/]+\/status\/(\d{5,25})/)?.[1];
    if (id) return { provider: "X", src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=light`, ratio: "portrait" };
  }

  if (isHost(host, "facebook.com") || host === "fb.watch") {
    const permalink = `${url.origin}${url.pathname}${url.search}`;
    const isVideo = host === "fb.watch" || /\/(?:watch|videos?|reel)\b/i.test(path);
    const params = new URLSearchParams({ href: permalink, show_text: "0", width: "500" });
    const plugin = isVideo ? "video.php" : "post.php";
    return { provider: "Facebook", src: `https://www.facebook.com/plugins/${plugin}?${params}`, ratio: isVideo ? "video" : "portrait" };
  }

  return null;
}

export function SocialMediaEmbed({ url, title }: { url: string; title: string }) {
  const embed = resolveSocialEmbed(url);
  if (!embed) return null;
  return (
    <div className={`relative mt-3 w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50 ${embed.ratio === "video" ? "aspect-video" : "aspect-[4/5]"}`}>
      <iframe
        src={embed.src}
        title={`${embed.provider}: ${title}`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
      <span className="sr-only">Konten ditampilkan dari {embed.provider}.</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm">
        Buka {embed.provider} <ExternalLink size={12} />
      </a>
    </div>
  );
}
