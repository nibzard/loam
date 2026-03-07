import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import CompareTella from "./-compare-tella";

export const Route = createFileRoute("/compare/tella")({
  head: () =>
    seoHead({
      title: "loam vs Tella.tv - faster team sharing, simpler pricing",
      description:
        "Compare loam and Tella.tv. loam starts at $15/month per workspace, keeps unlimited seats, and stays focused on async team updates instead of editing-heavy polish.",
      path: "/compare/tella",
      ogImage: "/og/default.png",
    }),
  component: CompareTella,
});
