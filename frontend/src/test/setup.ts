import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// The redesigned screens are heavy to render; with many workers running at
// once, Testing Library's default 1s findBy/waitFor timeout is flaky on CI.
configure({ asyncUtilTimeout: 5000 });

// Cleanup after each test
afterEach(() => {
  cleanup();
});
