import { createFileRoute } from "@tanstack/react-router";
import { muxPreconnectLinks } from "@/lib/seo";
import VideoPage from "./-video";

export const Route = createFileRoute("/dashboard/$teamSlug/$projectId/$videoId")({
  head: () => ({
    links: [...muxPreconnectLinks],
  }),
  component: VideoPage,
});
