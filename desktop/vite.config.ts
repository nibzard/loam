import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  clearScreen: false,
  plugins: [
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
    react(),
  ],
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
  build: {
    target: ["es2022", "chrome115", "safari17"],
    sourcemap: true,
  },
});
