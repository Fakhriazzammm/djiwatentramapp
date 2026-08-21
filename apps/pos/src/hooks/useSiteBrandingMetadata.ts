import { useEffect } from "react";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";

function upsertMeta(selector: string, attrs: Record<string, string>) {
	let el = document.head.querySelector(selector) as HTMLMetaElement | null;
	if (!el) {
		el = document.createElement("meta");
		document.head.appendChild(el);
	}
	Object.entries(attrs).forEach(([key, value]) => {
		el?.setAttribute(key, value);
	});
}

function upsertLink(selector: string, attrs: Record<string, string>) {
	let el = document.head.querySelector(selector) as HTMLLinkElement | null;
	if (!el) {
		el = document.createElement("link");
		document.head.appendChild(el);
	}
	Object.entries(attrs).forEach(([key, value]) => {
		el?.setAttribute(key, value);
	});
	return el;
}

export function useSiteBrandingMetadata() {
	const siteSettings = useHybridSiteSettings();

	useEffect(() => {
		if (!siteSettings) return;

		const appName = siteSettings.appName || "Djiwa Tentram Centrik";
		const fallbackDescription =
			siteSettings.landingDescription || "Aplikasi POS modern untuk bisnis Anda.";

		const seoTitle = siteSettings.seoMetaTitle || appName;
		const seoDescription = siteSettings.seoMetaDescription || fallbackDescription;
		const seoKeywords = siteSettings.seoMetaKeywords || "pos, kasir, restoran, cafe";
		const canonicalUrl = siteSettings.seoCanonicalUrl || window.location.origin;
		const shareTitle = siteSettings.seoShareTitle || seoTitle;
		const shareDescription = siteSettings.seoShareDescription || seoDescription;

		const headerLogo =
			siteSettings.headerLogoUrl || siteSettings.logoUrl || "/logo.png";
		const favicon = siteSettings.faviconUrl || headerLogo;
		const shareImage =
			siteSettings.seoShareImageUrl ||
			siteSettings.pwaIcon512Url ||
			headerLogo;

		const icon192 = siteSettings.pwaIcon192Url || favicon || "/pwa-192x192.png";
		const icon512 = siteSettings.pwaIcon512Url || favicon || "/pwa-512x512.png";
		const maskable512 =
			siteSettings.pwaMaskableIconUrl ||
			siteSettings.pwaIcon512Url ||
			favicon ||
			"/maskable-icon-512x512.png";

		document.title = seoTitle;

		upsertMeta('meta[name="description"]', {
			name: "description",
			content: seoDescription,
		});
		upsertMeta('meta[name="keywords"]', {
			name: "keywords",
			content: seoKeywords,
		});

		upsertMeta('meta[property="og:type"]', {
			property: "og:type",
			content: "website",
		});
		upsertMeta('meta[property="og:title"]', {
			property: "og:title",
			content: shareTitle,
		});
		upsertMeta('meta[property="og:description"]', {
			property: "og:description",
			content: shareDescription,
		});
		upsertMeta('meta[property="og:image"]', {
			property: "og:image",
			content: shareImage,
		});
		upsertMeta('meta[property="og:url"]', {
			property: "og:url",
			content: canonicalUrl,
		});

		upsertMeta('meta[name="twitter:card"]', {
			name: "twitter:card",
			content: "summary_large_image",
		});
		upsertMeta('meta[name="twitter:title"]', {
			name: "twitter:title",
			content: shareTitle,
		});
		upsertMeta('meta[name="twitter:description"]', {
			name: "twitter:description",
			content: shareDescription,
		});
		upsertMeta('meta[name="twitter:image"]', {
			name: "twitter:image",
			content: shareImage,
		});

		upsertLink('link[rel="canonical"]', {
			rel: "canonical",
			href: canonicalUrl,
		});
		upsertLink('link[rel="icon"]', {
			rel: "icon",
			href: favicon,
		});
		upsertLink('link[rel="apple-touch-icon"]', {
			rel: "apple-touch-icon",
			href: siteSettings.pwaIcon192Url || favicon,
		});

		const manifest = {
			name: appName,
			short_name: appName,
			description: seoDescription,
			theme_color: "#fefefe",
			background_color: "#ffffff",
			display: "standalone",
			start_url: "/",
			scope: "/",
			icons: [
				{
					src: icon192,
					sizes: "192x192",
					type: "image/png",
				},
				{
					src: icon512,
					sizes: "512x512",
					type: "image/png",
				},
				{
					src: maskable512,
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			],
		};

		const manifestBlob = new Blob([JSON.stringify(manifest)], {
			type: "application/manifest+json",
		});
		const manifestUrl = URL.createObjectURL(manifestBlob);
		const manifestLink = upsertLink('link[rel="manifest"]', {
			rel: "manifest",
			href: manifestUrl,
		});

		return () => {
			if (manifestLink?.href === manifestUrl) {
				URL.revokeObjectURL(manifestUrl);
			}
		};
	}, [siteSettings]);
}
