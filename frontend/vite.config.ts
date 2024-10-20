/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      // svgr options: https://react-svgr.com/docs/options/
      svgrOptions: {
        exportType: "default",
        ref: true,
        svgo: false,
        titleProp: true,
        icon: true,
      },
      include: "**/*.svg",
    }),
  ],
  build: {
    outDir: "./build",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.REACT_APP_API_PROXY,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    css: true,
    reporters: ["verbose"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*"],
      exclude: [],
    },
  },
});
