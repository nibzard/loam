import { createFileRoute } from "@tanstack/react-router";
import { muxPreconnectLinks, seoHead } from "@/lib/seo";
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
  component: WatchPage,
});
