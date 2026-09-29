import globals from "globals";
import { includeIgnoreFile } from "@eslint/compat";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { fileURLToPath } from "node:url";

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

export default [
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
  },
  {
    ignores: ["build/*", "public/mockServiceWorker.js"],
  },
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  // Registers the plugin and enables its recommended rules: rules-of-hooks,
  // exhaustive-deps and the React Compiler-derived checks. It was previously
  // registered with no rules enabled, so none of these ran.
  pluginReactHooks.configs.flat.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      // Recommended is "error". Downgraded while the existing violations are
      // refactored: each one (mostly resetting or deriving state inside an
      // effect) needs a behavioural change to fix properly, not a mechanical
      // one. Restore "error" once `eslint .` reports none.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
