import { createFileRoute } from "@tanstack/react-router";
import { AppProviders } from "@/lib/appProviders";
import { seoHead } from "@/lib/seo";
import InvitePage from "./-invite";

export const Route = createFileRoute("/invite/$token")({
  head: () =>
    seoHead({
      title: "Join team",
      description: "Accept your team invitation on loam.",
      path: "/invite",
      noIndex: true,
    }),
  component: InviteRoute,
});

function InviteRoute() {
  return (
    <AppProviders>
      <InvitePage />
    </AppProviders>
  );
}
