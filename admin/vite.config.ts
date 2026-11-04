import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The console is mounted under /backoffice/ both in dev and when the backend
// serves the built assets, so every asset URL and route is base-relative.
export default defineConfig({
  base: "/backoffice/",
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/backoffice/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Storefront imagery lives on the storefront dev server; the API host
      // serves it in the mounted build. VITE_ASSET_BASE overrides both.
      "/img": {
        target: "http://localhost:5173",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
