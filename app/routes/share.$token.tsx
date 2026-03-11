import { createFileRoute } from "@tanstack/react-router";
import { preloadVideoPlayer } from "@/components/video-player/lazy";
import { PublicAppProviders } from "@/lib/appProviders";
import { prefetchHlsRuntime, prefetchPlaybackSource } from "@/lib/muxPlayback";
import { convex } from "@/lib/convex";
import { muxPreconnectLinks, seoHead } from "@/lib/seo";
import { loadShareRouteBootstrap } from "./-publicPlaybackLoaders";
import SharePage from "./-share";

export const Route = createFileRoute("/share/$token")({
  head: () => {
    const head = seoHead({
      title: "Shared video",
      description: "Open this shared video on loam.",
      path: "/share",
      noIndex: true,
    });

    return {
      ...head,
      links: [...head.links, ...muxPreconnectLinks],
    };
  },
  loader: async ({ params, preload }) => {
    preloadVideoPlayer();

    const bootstrap = await loadShareRouteBootstrap(convex, {
      token: params.token,
      preload,
    });

    if (bootstrap.state === "ready") {
      prefetchHlsRuntime();
      prefetchPlaybackSource(bootstrap.playbackSession.url);
    }

    return bootstrap;
  },
  component: ShareRoute,
});

function ShareRoute() {
  return (
    <PublicAppProviders>
      <SharePage />
    </PublicAppProviders>
  );
}
