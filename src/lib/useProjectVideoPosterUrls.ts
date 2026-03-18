import { useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import {
  cacheVideoPosterUrls,
  getCachedVideoPosterUrls,
  type CacheableVideoPoster,
} from "./videoPosterCache";

type ProjectPosterVideo = CacheableVideoPoster & {
  _id: Id<"videos">;
};

export function useProjectVideoPosterUrls(args: {
  projectId: Id<"projects"> | undefined;
  videos: ProjectPosterVideo[] | undefined;
}) {
  const getProjectVideoPosters = useAction(api.videoActions.getProjectVideoPosters);
  const [fetchedPosterUrls, setFetchedPosterUrls] = useState<Record<string, string>>({});
  const posterRequestKeyRef = useRef(0);

  const cachedPosterUrls = useMemo(
    () => getCachedVideoPosterUrls({ videos: args.videos ?? [] }),
    [args.videos],
  );

  useEffect(() => {
    const validVideoIds = new Set((args.videos ?? []).map((video) => video._id));
    setFetchedPosterUrls((previous) => {
      const nextEntries = Object.entries(previous).filter(([videoId]) =>
        validVideoIds.has(videoId as Id<"videos">),
      );

      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }

      return Object.fromEntries(nextEntries);
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
    const missingPosterVideoIds = args.videos
      .filter((video) =>
        video.status === "ready" &&
        Boolean(video.muxPlaybackId) &&
        !cachedPosterUrls[video._id] &&
        !fetchedPosterUrls[video._id],
      )
      .map((video) => video._id);

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
        setFetchedPosterUrls((previous) => ({
          ...previous,
          ...Object.fromEntries(
            posters.map(({ videoId, posterUrl }) => [videoId, posterUrl]),
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
    fetchedPosterUrls,
    getProjectVideoPosters,
  ]);

  return useMemo(
    () => ({
      ...cachedPosterUrls,
      ...fetchedPosterUrls,
    }),
    [cachedPosterUrls, fetchedPosterUrls],
  );
}
