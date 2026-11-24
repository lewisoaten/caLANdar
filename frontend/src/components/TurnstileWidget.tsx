import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

/**
 * Cloudflare Turnstile site key, set at build time. Unset means no CAPTCHA:
 * the widget renders nothing and the server (which only enforces Turnstile
 * when it has the matching secret) is not asked for a token.
 */
export const TURNSTILE_SITE_KEY: string | undefined =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || undefined;

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not load"));
    script.onerror = () => {
      // Forget the failure so a retry can try again from scratch.
      scriptPromise = null;
      script.remove();
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Renders the Turnstile challenge and reports its token (or `null` while
 * there is none: before solving, after expiry, or on error). Tokens are single
 * use, so the parent remounts this (change its `key`) after each submit for a
 * fresh challenge. If the challenge can't load, it says so and offers a retry
 * rather than leaving the form silently blocked.
 */
export default function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    const el = ref.current;
    let widgetId: string | undefined;
    let cancelled = false;
    const fail = () => {
      onTokenRef.current(null);
      if (!cancelled) setFailed(true);
    };
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId = api.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [attempt]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Box ref={ref} data-testid="turnstile" sx={{ minHeight: 65 }} />
      {failed && (
        <Box
          role="alert"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography sx={{ fontSize: 14 }}>
            We couldn&apos;t load the human check, so you can&apos;t sign in
            yet. Check your connection and try again.
          </Typography>
          <Button
            type="button"
            size="small"
            variant="outlined"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </Box>
      )}
    </>
  );
}
