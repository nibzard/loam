import { createFileRoute } from "@tanstack/react-router";
import { AppProviders } from "@/lib/appProviders";
import { muxPreconnectLinks, seoHead } from "@/lib/seo";
import SharePage from "./-share";

export const Route = createFileRoute("/share/$token")({
  head: () => {
    const head = seoHead({
      title: "Shared video",
      description: "Review this shared video on lawn.",
      path: "/share",
      noIndex: true,
    });

    return {
      ...head,
      links: [...head.links, ...muxPreconnectLinks],
    };
  },
  component: ShareRoute,
});

function ShareRoute() {
  return (
    <AppProviders>
      <SharePage />
    </AppProviders>
  );
}
