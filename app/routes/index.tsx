import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, seoHead } from "@/lib/seo";
import Homepage from "./-home";

export const Route = createFileRoute("/")({
  head: () => ({
    ...seoHead({
      title: "loam — async video sharing for teams",
      description:
        "Async video sharing for teams. Share screen recordings, walkthroughs, and video feedback with fast playback and simple links.",
      path: "/",
      ogImage: "/og/home.png",
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "loam",
          description:
            "Async video sharing for teams. Share screen recordings, walkthroughs, and video feedback with fast playback and simple links.",
          url: SITE_URL,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          offers: [
            {
              "@type": "Offer",
              name: "Starter",
              price: "15.00",
              priceCurrency: "USD",
              description:
                "Unlimited seats, 100GB storage, 5,000 shared-link watch minutes, and 4,000 member watch minutes per month",
            },
            {
              "@type": "Offer",
              name: "Pro",
              price: "49.00",
              priceCurrency: "USD",
              description:
                "Unlimited seats, 500GB storage, 15,000 shared-link watch minutes, and 10,000 member watch minutes per month",
            },
          ],
        }),
      },
    ],
  }),
  component: Homepage,
});
