import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import ForAgencies from "./-for-agencies";

export const Route = createFileRoute("/for/agencies")({
  head: () =>
    seoHead({
      title: "Async video for agencies — flat pricing, no seat tax",
      description:
        "Async video built for agencies. Flat team pricing from $15/month, no per-user pricing, no client accounts needed, and clear storage and guest-sharing limits.",
      path: "/for/agencies",
      ogImage: "/og/for-agencies.png",
    }),
  component: ForAgencies,
});
