export function buildMuxPlaybackHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

type HlsCapableMediaElement = {
  canPlayType: (type: string) => string;
};

const prefetchedPlaybackSources = new Set<string>();
let hlsRuntimePrefetched = false;
let hlsRuntimePrefetchPromise: Promise<unknown> | null = null;

export function isHlsPlaybackSource(url: string): boolean {
  return url.includes(".m3u8");
}

export function browserSupportsNativeHls(
  mediaElement?: HlsCapableMediaElement | null,
): boolean {
  const media =
    mediaElement ??
    (typeof document !== "undefined" ? document.createElement("video") : null);

  if (!media) {
    return false;
  }

  return Boolean(
    media.canPlayType("application/vnd.apple.mpegurl") ||
      media.canPlayType("application/x-mpegURL"),
  );
}

export function shouldLoadHlsJsForSource(
  url: string,
  mediaElement?: HlsCapableMediaElement | null,
): boolean {
  return isHlsPlaybackSource(url) && !browserSupportsNativeHls(mediaElement);
}

export function prefetchPlaybackSource(url: string) {
  if (typeof window === "undefined") return;
  if (prefetchedPlaybackSources.has(url)) return;
  prefetchedPlaybackSources.add(url);
  fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  }).catch(() => {
    // Best effort only; route transitions should not depend on this.
  });
}

export function prefetchMuxPlaybackManifest(playbackId: string) {
  prefetchPlaybackSource(buildMuxPlaybackHlsUrl(playbackId));
}

export function prefetchHlsRuntime(url?: string) {
  if (typeof window === "undefined") return;
  if (url && !shouldLoadHlsJsForSource(url)) return;
  if (!url && browserSupportsNativeHls()) return;
  if (hlsRuntimePrefetched) return;
  hlsRuntimePrefetched = true;

  const loadRuntime = () => {
    if (!hlsRuntimePrefetchPromise) {
      hlsRuntimePrefetchPromise = import("hls.js").catch(() => {
        hlsRuntimePrefetched = false;
        hlsRuntimePrefetchPromise = null;
      });
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      loadRuntime();
    }, { timeout: 1500 });
    return;
  }

  window.setTimeout(loadRuntime, 0);
}
