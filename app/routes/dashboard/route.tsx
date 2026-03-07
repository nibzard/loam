import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import { AppProviders } from "@/lib/appProviders";
import DashboardLayout from "./-layout";

export const Route = createFileRoute("/dashboard")({
  head: () =>
    seoHead({
      title: "Dashboard",
      description: "Manage your videos on loam.",
      path: "/dashboard",
      noIndex: true,
    }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <AppProviders>
      <DashboardLayout />
    </AppProviders>
  );
}
