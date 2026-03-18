type VideoPosterCacheStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const VIDEO_POSTER_CACHE_STORAGE_KEY = "loam.videoPosterCache.v1";

export type CacheableVideoPoster = {
  _id: string;
  muxPlaybackId?: string | null;
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl?: string | null;
};

export type CacheableVideoPosterResponse = {
  expiresAt: number | null;
  posterUrl: string;
  videoId: string;
};

type VideoPosterCacheEntry = {
  expiresAt: number;
  posterUrl: string;
};

type VideoPosterCacheState = Record<string, VideoPosterCacheEntry>;

function getBrowserStorage(): VideoPosterCacheStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCacheState(
  storage: VideoPosterCacheStorage | null,
  now: number,
): {
  changed: boolean;
  state: VideoPosterCacheState;
} {
  if (!storage) {
    return { changed: false, state: {} };
  }

  const raw = storage.getItem(VIDEO_POSTER_CACHE_STORAGE_KEY);
  if (!raw) {
    return { changed: false, state: {} };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { changed: true, state: {} };
    }

    const nextState: VideoPosterCacheState = {};
    let changed = false;

    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        changed = true;
        continue;
      }

      const posterUrl = "posterUrl" in value ? value.posterUrl : undefined;
      const expiresAt = "expiresAt" in value ? value.expiresAt : undefined;

      if (
        typeof posterUrl !== "string" ||
        typeof expiresAt !== "number" ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now
      ) {
        changed = true;
        continue;
      }

      nextState[key] = {
        expiresAt,
        posterUrl,
      };
    }

    return { changed, state: nextState };
  } catch {
    return { changed: true, state: {} };
  }
}

function writeCacheState(
  storage: VideoPosterCacheStorage | null,
  state: VideoPosterCacheState,
) {
  if (!storage) {
    return;
  }

  if (Object.keys(state).length === 0) {
    storage.removeItem(VIDEO_POSTER_CACHE_STORAGE_KEY);
    return;
  }

  try {
    storage.setItem(VIDEO_POSTER_CACHE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures; poster loading should still work.
  }
}

export function buildVideoPosterCacheKey(video: CacheableVideoPoster): string | null {
  if (video.status !== "ready") {
    return null;
  }

  return video.muxPlaybackId ? `private:${video.muxPlaybackId}` : null;
}

export function getVideoPosterFallbackUrl(video: CacheableVideoPoster): string | undefined {
  return video.thumbnailUrl?.startsWith("http") ? video.thumbnailUrl : undefined;
}

export function getCachedVideoPosterUrls(args: {
  now?: number;
  storage?: VideoPosterCacheStorage | null;
  videos: CacheableVideoPoster[];
}) {
  const now = args.now ?? Date.now();
  const storage = args.storage ?? getBrowserStorage();
  const { changed, state } = readCacheState(storage, now);
  const posterUrls: Record<string, string> = {};

  for (const video of args.videos) {
    const fallbackUrl = getVideoPosterFallbackUrl(video);
    if (fallbackUrl) {
      posterUrls[video._id] = fallbackUrl;
      continue;
    }

    const cacheKey = buildVideoPosterCacheKey(video);
    if (!cacheKey) {
      continue;
    }

    const cached = state[cacheKey];
    if (cached) {
      posterUrls[video._id] = cached.posterUrl;
    }
  }

  if (changed) {
    writeCacheState(storage, state);
  }

  return posterUrls;
}

export function cacheVideoPosterUrls(args: {
  now?: number;
  posters: CacheableVideoPosterResponse[];
  storage?: VideoPosterCacheStorage | null;
  videosById: Map<string, CacheableVideoPoster>;
}) {
  if (args.posters.length === 0) {
    return;
  }

  const now = args.now ?? Date.now();
  const storage = args.storage ?? getBrowserStorage();
  const { state } = readCacheState(storage, now);
  let changed = false;

  for (const poster of args.posters) {
    if (poster.expiresAt === null || poster.expiresAt <= now) {
      continue;
    }

    const video = args.videosById.get(poster.videoId);
    if (!video) {
      continue;
    }

    const cacheKey = buildVideoPosterCacheKey(video);
    if (!cacheKey) {
      continue;
    }

    state[cacheKey] = {
      expiresAt: poster.expiresAt,
      posterUrl: poster.posterUrl,
    };
    changed = true;
  }

  if (changed) {
    writeCacheState(storage, state);
  }
}
