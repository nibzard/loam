import { createFileRoute } from "@tanstack/react-router";
import { AppProviders } from "@/lib/appProviders";
import { muxPreconnectLinks, seoHead } from "@/lib/seo";
import WatchPage from "./-watch";

export const Route = createFileRoute("/watch/$publicId")({
  head: () => {
    const head = seoHead({
      title: "Watch video",
      description: "Watch and review this video on lawn.",
      path: "/watch",
      noIndex: true,
    });

    return {
      ...head,
      links: [...head.links, ...muxPreconnectLinks],
    };
  },
  component: WatchRoute,
});

function WatchRoute() {
  return (
    <AppProviders>
      <WatchPage />
    </AppProviders>
  );
}
