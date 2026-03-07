import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import CompareLoom from "./-compare-loom";

export const Route = createFileRoute("/compare/loom")({
  head: () =>
    seoHead({
      title: "loam vs Loom - flat team pricing, lighter async video",
      description:
        "Compare loam and Loom. loam starts at $15/month per workspace instead of Loom's per-seat pricing, with fast playback, open source ownership, and a narrower async workflow.",
      path: "/compare/loom",
      ogImage: "/og/default.png",
    }),
  component: CompareLoom,
});
