import { lazy } from "react";

let videoPlayerModulePromise: Promise<typeof import("./VideoPlayer")> | null = null;

export function preloadVideoPlayer() {
  if (!videoPlayerModulePromise) {
    videoPlayerModulePromise = import("./VideoPlayer");
  }

  return videoPlayerModulePromise;
}

export const LazyVideoPlayer = lazy(async () => {
  const module = await preloadVideoPlayer();
  return { default: module.VideoPlayer };
});

export type { VideoPlayerHandle } from "./VideoPlayer";
