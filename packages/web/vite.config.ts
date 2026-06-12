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
      manifest: false,
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@village/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
});
