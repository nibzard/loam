import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import PricingPage from "./-pricing";

export const Route = createFileRoute("/pricing")({
  head: () =>
    seoHead({
      title: "Pricing — flat team plans from $15/month",
      description:
        "loam pricing is simple. Starter is $15/month and Pro is $49/month, with unlimited seats, private-by-default sharing, and workspace-level watch-minute limits.",
      path: "/pricing",
      ogImage: "/og/pricing.png",
    }),
  component: PricingPage,
});
