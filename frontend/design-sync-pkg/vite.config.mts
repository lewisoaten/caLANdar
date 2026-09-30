// Library-mode build of the app's components for design-sync. Uses the app's own
// toolchain (svgr etc.) so .svg-as-component imports compile the way they do in
// production. React is NOT bundled: it resolves to the page's shared
// window.React / window.ReactDOM (the converter supplies one copy), through
// virtual modules rather than `external`, because Vite 8's bundler turns an
// external `require("react")` inside bundled CommonJS into a runtime require
// that a browser IIFE can't satisfy.
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireHere = createRequire(import.meta.url);
const identifier = /^[A-Za-z_$][\w$]*$/;
const namedExports = (from: string, global: string, names: string[]) =>
  [
    `const G = window.${global};`,
    "export default G;",
    ...names.map((n) => `export const ${n} = G.${n};`),
  ].join("\n");

const windowReact = (): Plugin => {
  const exportsOf = (id: string) =>
    Object.keys(requireHere(id)).filter(
      (k) => identifier.test(k) && k !== "default",
    );
  const modules: Record<string, () => string> = {
    "\0ds:react": () => namedExports("react", "React", exportsOf("react")),
    "\0ds:react-dom": () =>
      namedExports("react-dom", "ReactDOM", exportsOf("react-dom")),
    "\0ds:react-dom-client": () =>
      namedExports(
        "react-dom/client",
        "ReactDOM",
        exportsOf("react-dom/client"),
      ),
    // Automatic-runtime jsx -> createElement (key is the third argument).
    "\0ds:jsx": () => `
const R = window.React;
const withKey = (p, k) => { const o = {}; for (const x in p) if (x !== "children") o[x] = p[x]; if (k !== undefined) o.key = k; return o; };
export const Fragment = R.Fragment;
export const jsx = (t, p, k) => { const c = p && p.children; return c === undefined ? R.createElement(t, withKey(p, k)) : R.createElement(t, withKey(p, k), c); };
export const jsxs = (t, p, k) => R.createElement.apply(R, [t, withKey(p, k)].concat(p.children));
export const jsxDEV = (t, p, k, s) => (s ? jsxs : jsx)(t, p, k);`,
  };
  const ids: Record<string, string> = {
    react: "\0ds:react",
    "react/jsx-runtime": "\0ds:jsx",
    "react/jsx-dev-runtime": "\0ds:jsx",
    "react-dom": "\0ds:react-dom",
    "react-dom/client": "\0ds:react-dom-client",
  };
  return {
    name: "ds-window-react",
    enforce: "pre",
    resolveId: (source) => ids[source],
    load: (id) => modules[id]?.(),
  };
};

export default defineConfig({
  root: resolve(__dirname, ".."),
  plugins: [
    windowReact(),
    react(),
    svgr({
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
  publicDir: false,
  define: { "process.env.NODE_ENV": '"development"' },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "entry.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
  },
});
