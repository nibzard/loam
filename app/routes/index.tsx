import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import Homepage from "./-home";

export const Route = createFileRoute("/")({
  head: () =>
    seoHead({
      title: "loam — async video sharing for teams",
      description:
        "Async video sharing for teams. Share screen recordings, walkthroughs, and video feedback with fast playback and simple links.",
      path: "/",
      ogImage: "/og/home.png",
    }),
  component: Homepage,
});
