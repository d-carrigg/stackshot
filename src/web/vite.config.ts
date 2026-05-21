import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      manifest: {
        name: "stackshot",
        short_name: "stackshot",
        description: "Quickly create multi-panel code screenshots in your browser.",
        theme_color: "#16161e",
        background_color: "#16161e",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Shiki language chunks can each weigh several hundred KB; keep
        // the precache realistic (don't fail the SW install).
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
    }),
  ],
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
  },
  server: {
    port: 5173,
    fs: {
      // THIRD_PARTY_LICENSES.md lives at the repo root, two levels above
      // the vite root. The ?raw import for the licenses modal needs
      // read access to it.
      allow: ["..", "../.."],
    },
  },
});
