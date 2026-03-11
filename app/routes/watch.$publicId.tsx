import { createFileRoute } from "@tanstack/react-router";
import { preloadVideoPlayer } from "@/components/video-player/lazy";
import { PublicAppProviders } from "@/lib/appProviders";
import { prefetchHlsRuntime, prefetchPlaybackSource } from "@/lib/muxPlayback";
import { convex } from "@/lib/convex";
import { muxPreconnectLinks, seoHead } from "@/lib/seo";
import { loadWatchRouteBootstrap } from "./-publicPlaybackLoaders";
import WatchPage from "./-watch";

export const Route = createFileRoute("/watch/$publicId")({
  head: () => {
    const head = seoHead({
      title: "Watch video",
      description: "Watch this video on loam.",
      path: "/watch",
      noIndex: true,
    });

    return {
      ...head,
      links: [...head.links, ...muxPreconnectLinks],
    };
  },
  loader: async ({ params, preload }) => {
    preloadVideoPlayer();

    const bootstrap = await loadWatchRouteBootstrap(convex, {
      publicId: params.publicId,
    });

    if (bootstrap.state === "ready") {
      if (!preload) {
        prefetchHlsRuntime(bootstrap.playbackSession.url);
      }
      prefetchPlaybackSource(bootstrap.playbackSession.url);
    }

    return bootstrap;
  },
  component: WatchRoute,
});

function WatchRoute() {
  return (
    <PublicAppProviders>
      <WatchPage />
    </PublicAppProviders>
  );
}
