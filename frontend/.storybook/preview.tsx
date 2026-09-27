import type { Preview } from "@storybook/react-vite";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "../src/theme";
import React from "react";

import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";

/*
 * Starts MSW. msw-storybook-addon 3 no longer has initialize(); a custom
 * setup function passed to the loader replaces it.
 * See https://github.com/mswjs/msw-storybook-addon#custom-worker-setup
 */
const startWorker = async () => {
  const worker = setupWorker();
  await worker.start({
    quiet: true,
    onUnhandledRequest: ({ url, method }) => {
      const pathname = new URL(url).pathname;
      if (pathname.startsWith("/api")) {
        console.error(`Unhandled ${method} request to ${url}.

        This exception has been only logged in the console, however, it's strongly recommended to resolve this error as you don't want unmocked data in Storybook stories.

        If you wish to mock an error response, please refer to this guide: https://mswjs.io/docs/recipes/mocking-error-responses
      `);
      }
    },
  });
  return worker;
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  loaders: [mswLoader(startWorker)],
  decorators: [
    (Story) => (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
