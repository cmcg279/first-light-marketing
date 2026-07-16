import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/first-light-marketing/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
