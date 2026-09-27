/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// API origin to proxy /api/* at, per Netlify deploy context.
//
// Redirects declared in netlify.toml are NOT context-aware - Netlify applies
// them globally - so a "[context.deploy-preview]" redirect block there is
// silently ignored and every context ends up on whichever /api/* rule was
// declared first. Emitting a _redirects file into the publish directory at
// build time is context-aware, because Netlify sets CONTEXT during the build.
//
// Overridable by environment variable so a self-hosted deployment does not
// have to patch this file.
const API_ORIGINS = {
  production:
    process.env.API_ORIGIN_PRODUCTION ??
    "https://calandar-api-production-tw2haqzuzq-nw.a.run.app",
  staging:
    process.env.API_ORIGIN_STAGING ??
    "https://calandar-api-staging-tw2haqzuzq-nw.a.run.app",
};

const apiOriginForContext = (context: string | undefined): string =>
  context === "production" ? API_ORIGINS.production : API_ORIGINS.staging;

/**
 * Emit Netlify's _redirects into the build output.
 *
 * Order matters: Netlify takes the first matching rule, so the API proxy must
 * precede the SPA fallback or "/api/*" would be swallowed by it. The trailing
 * "!" on the proxy rule forces it to win over any static file of the same path.
 */
const netlifyRedirects = (): Plugin => {
  // Resolved rather than hard-coded: Storybook 10 builds with this config's
  // plugins but its own outDir, and a literal "build/" does not exist there.
  let outDir = "build";
  return {
    name: "emit-netlify-redirects",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const context = process.env.CONTEXT;
      const apiOrigin = apiOriginForContext(context);
      const body = [
        `# Generated at build time for CONTEXT=${context ?? "(unset)"}.`,
        "# Edit vite.config.ts, not this file.",
        `/api/*  ${apiOrigin}/api/:splat  200!`,
        "/*      /                        200",
        "",
      ].join("\n");
      writeFileSync(join(outDir, "_redirects"), body);
      console.log(
        `[netlify] _redirects -> ${apiOrigin} (CONTEXT=${context ?? "unset"})`,
      );
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    netlifyRedirects(),
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
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("proxy error", err);
          });
          proxy.on("proxyReq", (_proxyReq, req, _res) => {
            console.log("Sending Request to the Target:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log(
              "Received Response from the Target:",
              proxyRes.statusCode,
              req.url,
            );
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Pin a non-UTC, DST-observing zone. Attendance buckets must be derived
    // from the UTC calendar to stay in step with the API; running the suite in
    // UTC would silently hide any regression back to local-calendar logic.
    env: {
      TZ: "Europe/London",
    },
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
    reporters: ["verbose"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*"],
      exclude: [],
    },
  },
});
