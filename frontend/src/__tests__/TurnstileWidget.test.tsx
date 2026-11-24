import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The site key is read from the build environment when the module loads, so
// each test sets it and imports the component afresh.
async function loadWidget(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", siteKey ?? "");
  return (await import("../components/TurnstileWidget")).default;
}

describe("TurnstileWidget", () => {
  beforeEach(() => {
    delete window.turnstile;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("renders nothing without a site key", async () => {
    const TurnstileWidget = await loadWidget(undefined);
    const { container } = render(<TurnstileWidget onToken={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("reports the token once the challenge is solved", async () => {
    const TurnstileWidget = await loadWidget("site-key");
    let solved: (token: string) => void = () => {};
    window.turnstile = {
      render: (_el, options) => {
        solved = options.callback;
        return "widget-1";
      },
      remove: () => {},
    };
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);

    await waitFor(() => expect(window.turnstile).toBeDefined());
    solved("tok-123");
    expect(onToken).toHaveBeenLastCalledWith("tok-123");
  });

  test("explains a load failure and lets the user retry", async () => {
    const TurnstileWidget = await loadWidget("site-key");
    // jsdom never fetches scripts, so fail the first load and let the second
    // one succeed, as when connectivity comes back.
    let loads = 0;
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      loads += 1;
      const script = node as HTMLScriptElement;
      setTimeout(() => {
        if (loads === 1) {
          script.onerror?.(new Event("error"));
        } else {
          window.turnstile = { render: () => "widget-2", remove: () => {} };
          script.onload?.(new Event("load"));
        }
      });
      return node;
    });
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load the human check/i);
    expect(onToken).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(loads).toBe(2));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });
});
