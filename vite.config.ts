import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    proxy: process.env.VITE_DEV_API_ORIGIN
      ? {
          "/api": {
            target: process.env.VITE_DEV_API_ORIGIN,
            changeOrigin: true,
            secure: true,
          },
        }
      : undefined,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
