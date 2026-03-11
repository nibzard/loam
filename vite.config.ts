import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "use-sync-external-store/shim/with-selector.js",
        replacement: fileURLToPath(
          new URL(
            "./src/lib/use-sync-external-store-with-selector-shim.ts",
            import.meta.url,
          ),
        ),
      },
      {
        find: "use-sync-external-store/shim/with-selector",
        replacement: fileURLToPath(
          new URL(
            "./src/lib/use-sync-external-store-with-selector-shim.ts",
            import.meta.url,
          ),
        ),
      },
      {
        find: "use-sync-external-store/shim",
        replacement: fileURLToPath(
          new URL("./src/lib/use-sync-external-store-shim.ts", import.meta.url),
        ),
      },
    ],
  },
  plugins: [
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "app",
      spa: {
        enabled: true,
        maskPath: "/mono",
        prerender: {
          outputPath: "/_shell",
          crawlLinks: false,
        },
      },
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
      },
      pages: [
        { path: "/" },
        { path: "/compare/loom" },
        { path: "/compare/tella" },
        { path: "/for/video-editors" },
        { path: "/for/agencies" },
        { path: "/pricing" },
      ],
    }),
    viteReact(),
  ],
});
