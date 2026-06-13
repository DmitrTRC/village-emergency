import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "sw.ts",
      injectRegister: null,
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"],
      manifest: {
        name: "village-emrg",
        short_name: "village-emrg",
        description: "Экстренная связь и инциденты посёлка",
        lang: "ru",
        display: "standalone",
        start_url: "/",
        scope: "/",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@village/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
});
