const DEFAULT_SITE_URL = "https://loam.video";
const SITE_NAME = "loam";
const DEFAULT_OG_IMAGE = "/og/default.png";
const TWITTER_HANDLE = "";

const SITE_URL_ENV =
  import.meta.env.VITE_CONVEX_SITE_URL ?? DEFAULT_SITE_URL;

function normalizeSiteUrl(raw: string): string {
  const normalized = raw.trim();
  if (!normalized) return DEFAULT_SITE_URL;

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return DEFAULT_SITE_URL;
    }

    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = normalizeSiteUrl(SITE_URL_ENV);

export const muxPreconnectLinks = [
  { rel: "preconnect", href: "https://stream.mux.com", crossOrigin: "anonymous" },
  { rel: "preconnect", href: "https://image.mux.com", crossOrigin: "anonymous" },
  { rel: "dns-prefetch", href: "//stream.mux.com" },
  { rel: "dns-prefetch", href: "//image.mux.com" },
] as const;

type SeoOptions = {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  type?: string;
  noIndex?: boolean;
};

export function seoHead({
  title,
  description,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  type = "website",
  noIndex = false,
}: SeoOptions) {
  const fullTitle = title.toLowerCase().includes(SITE_NAME.toLowerCase())
    ? title
    : `${title} | ${SITE_NAME}`;
  const url = `${SITE_URL}${path}`;
  const imageUrl = ogImage.startsWith("http")
    ? ogImage
    : `${SITE_URL}${ogImage}`;

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    // Open Graph
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:image", content: imageUrl },
    { property: "og:url", content: url },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
  ];

  if (TWITTER_HANDLE) {
    meta.push({ name: "twitter:site", content: TWITTER_HANDLE });
  }

  if (noIndex) {
    meta.push({ name: "robots", content: "noindex,nofollow" });
  }

  const links = [{ rel: "canonical", href: url }];

  return { meta, links };
}
