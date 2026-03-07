import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/ThemeToggle";
import { NotFound } from "@/components/ui/NotFound";
import appCss from "../app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "loam — async video sharing for teams" },
      {
        name: "description",
        content:
          "Async video sharing for teams. Share screen recordings, walkthroughs, and video feedback with fast playback and simple links.",
      },
      { property: "og:site_name", content: "loam" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/grass-logo.svg?v=4" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico?v=4" },
      { rel: "shortcut icon", href: "/favicon.ico?v=4" },
    ],
  }),
  component: RootComponent,
  errorComponent: ({ error }) => {
    return (
      <main className="pt-16 p-4 container mx-auto">
        <h1>Error</h1>
        <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
        {import.meta.env.DEV && error instanceof Error && error.stack ? (
          <pre className="w-full p-4 overflow-x-auto">
            <code>{error.stack}</code>
          </pre>
        ) : null}
      </main>
    );
  },
  notFoundComponent: () => <NotFound />,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const themeInitScript = `
    (() => {
      try {
        const stored = localStorage.getItem("loam-theme") ?? localStorage.getItem("lawn-theme");
        const storedLook = localStorage.getItem("loam-theme-look");
        if (stored === "light" || stored === "dark") {
          localStorage.setItem("loam-theme", stored);
          document.documentElement.setAttribute("data-theme", stored);
        }
        if (storedLook === "brutalist" || storedLook === "clean") {
          document.documentElement.setAttribute("data-look", storedLook);
        } else {
          document.documentElement.setAttribute("data-look", "brutalist");
        }
        if (stored === "light" || stored === "dark") return;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      } catch {}
    })();
  `;

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="h-full antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
