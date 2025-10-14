import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Sentry to avoid issues in tests
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  showReportDialog: vi.fn(),
  withSentryReactRouterV6Routing: (component: any) => component,
  browserProfilingIntegration: vi.fn(() => ({})),
  reactRouterV6BrowserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
}));

// Setup JSdom environment
const { configure } = require("@testing-library/react");
configure({ testIdAttribute: "data-testid" });