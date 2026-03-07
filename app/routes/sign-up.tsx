import { createFileRoute } from "@tanstack/react-router";
import { ClerkClientProvider } from "@/lib/clerk";
import { seoHead } from "@/lib/seo";
import { AuthShell } from "./auth/-layout";
import SignUpPage from "./auth/-sign-up";

export const Route = createFileRoute("/sign-up")({
  head: () =>
    seoHead({
      title: "Start your 7-day trial",
      description:
        "Sign up for loam and start a 7-day trial with a card. Fast playback, simple links, and fewer meetings for async teams.",
      path: "/sign-up",
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect_url:
      typeof search.redirect_url === "string" ? search.redirect_url : undefined,
  }),
  component: SignUpRoute,
});

function SignUpRoute() {
  return (
    <ClerkClientProvider>
      <AuthShell>
        <SignUpPage />
      </AuthShell>
    </ClerkClientProvider>
  );
}
