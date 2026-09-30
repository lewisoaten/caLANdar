// Library-mode build of the app's components for design-sync. Uses the app's own
// toolchain (svgr etc.) so .svg-as-component imports compile the way they do in
// production; React stays external (the converter supplies one shared copy).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, ".."),
  plugins: [
    react(),
    svgr({
      svgrOptions: { exportType: "default", ref: true, svgo: false, titleProp: true, icon: true },
      include: "**/*.svg",
    }),
  ],
  publicDir: false,
  define: { "process.env.NODE_ENV": '"development"' },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: { entry: resolve(__dirname, "entry.ts"), formats: ["es"], fileName: () => "index.js" },
    rollupOptions: { external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"] },
  },
});
