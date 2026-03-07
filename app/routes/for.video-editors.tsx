import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import ForVideoEditors from "./-for-video-editors";

export const Route = createFileRoute("/for/video-editors")({
  head: () =>
    seoHead({
      title: "Async video for teams — faster asynchronous updates",
      description:
        "Async video built for small teams. Fast playback, private-by-default sharing, unlimited seats, and flat team pricing from $15/month.",
      path: "/for/video-editors",
      ogImage: "/og/for-editors.png",
    }),
  component: ForVideoEditors,
});
