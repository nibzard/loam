import { useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import {
  cacheVideoPosterUrls,
  getCachedVideoPosterUrls,
  getVideoPosterFallbackUrl,
  type CacheableVideoPoster,
} from "./videoPosterCache";

type ProjectPosterVideo = CacheableVideoPoster & {
  _id: Id<"videos">;
};

type FetchedPosterEntry = {
  muxPlaybackId: string;
  posterUrl: string;
};

type FetchedPosterEntries = Record<string, FetchedPosterEntry>;

function fetchedPosterEntriesEqual(
  left: FetchedPosterEntries,
  right: FetchedPosterEntries,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftEntry = left[key];
    const rightEntry = right[key];
    return (
      leftEntry?.muxPlaybackId === rightEntry?.muxPlaybackId &&
      leftEntry?.posterUrl === rightEntry?.posterUrl
    );
  });
}

export function pruneFetchedPosterEntries(args: {
  previous: FetchedPosterEntries;
  videos: ProjectPosterVideo[] | undefined;
}) {
  const videosById = new Map<string, ProjectPosterVideo>(
    (args.videos ?? []).map((video) => [video._id, video]),
  );
  const nextEntries: FetchedPosterEntries = {};

  for (const [videoId, entry] of Object.entries(args.previous)) {
    const video = videosById.get(videoId);
    if (!video) {
      continue;
    }

    if (
      video.status !== "ready" ||
      !video.muxPlaybackId ||
      getVideoPosterFallbackUrl(video) ||
      entry.muxPlaybackId !== video.muxPlaybackId
    ) {
      continue;
    }

    nextEntries[videoId] = entry;
  }

  return nextEntries;
}

export function getMissingPosterVideoIds(args: {
  cachedPosterUrls: Record<string, string>;
  fetchedPosterEntries: FetchedPosterEntries;
  videos: ProjectPosterVideo[] | undefined;
}) {
  return (args.videos ?? [])
    .filter((video) =>
      video.status === "ready" &&
      Boolean(video.muxPlaybackId) &&
      !getVideoPosterFallbackUrl(video) &&
      !args.cachedPosterUrls[video._id] &&
      args.fetchedPosterEntries[video._id]?.muxPlaybackId !== video.muxPlaybackId,
    )
    .map((video) => video._id);
}

export function useProjectVideoPosterUrls(args: {
  projectId: Id<"projects"> | undefined;
  videos: ProjectPosterVideo[] | undefined;
}) {
  const getProjectVideoPosters = useAction(api.videoActions.getProjectVideoPosters);
  const [fetchedPosterEntries, setFetchedPosterEntries] = useState<FetchedPosterEntries>({});
  const posterRequestKeyRef = useRef(0);

  const cachedPosterUrls = useMemo(
    () => getCachedVideoPosterUrls({ videos: args.videos ?? [] }),
    [args.videos],
  );

  useEffect(() => {
    setFetchedPosterEntries((previous) => {
      const nextEntries = pruneFetchedPosterEntries({
        previous,
        videos: args.videos,
      });

      if (fetchedPosterEntriesEqual(previous, nextEntries)) {
        return previous;
      }

      return nextEntries;
    });
  }, [args.videos]);

  useEffect(() => {
    const requestKey = ++posterRequestKeyRef.current;

    if (!args.projectId || !args.videos) {
      return;
    }

    const videosById = new Map<string, ProjectPosterVideo>(
      args.videos.map((video) => [video._id, video]),
    );
    const missingPosterVideoIds = getMissingPosterVideoIds({
      cachedPosterUrls,
      fetchedPosterEntries,
      videos: args.videos,
    });

    if (missingPosterVideoIds.length === 0) {
      return;
    }
    const projectId = args.projectId;

    void (async () => {
      try {
        const posters = await getProjectVideoPosters({
          projectId,
          videoIds: missingPosterVideoIds,
        });

        if (requestKey !== posterRequestKeyRef.current) {
          return;
        }

        cacheVideoPosterUrls({
          posters,
          videosById,
        });
        setFetchedPosterEntries((previous) => ({
          ...previous,
          ...Object.fromEntries(
            posters.flatMap(({ videoId, posterUrl }) => {
              const video = videosById.get(videoId);
              if (!video?.muxPlaybackId) {
                return [];
              }

              return [[videoId, { muxPlaybackId: video.muxPlaybackId, posterUrl }]];
            }),
          ),
        }));
      } catch (error) {
        if (requestKey !== posterRequestKeyRef.current) {
          return;
        }

        console.error("Failed to load project video posters:", error);
      }
    })();
  }, [
    args.projectId,
    args.videos,
    cachedPosterUrls,
    fetchedPosterEntries,
    getProjectVideoPosters,
  ]);

  const fetchedPosterUrls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fetchedPosterEntries).map(([videoId, entry]) => [
          videoId,
          entry.posterUrl,
        ]),
      ),
    [fetchedPosterEntries],
  );

  return useMemo(
    () => ({
      ...cachedPosterUrls,
      ...fetchedPosterUrls,
    }),
    [cachedPosterUrls, fetchedPosterUrls],
  );
}
