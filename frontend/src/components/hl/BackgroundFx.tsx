import * as React from "react";
import Box from "@mui/material/Box";
import { tint } from "./tokens";

const STORAGE_KEY = "calandar:background-fx";

interface BackgroundFxValue {
  /** Whether the grid + glow backdrop is shown. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

const BackgroundFxContext = React.createContext<BackgroundFxValue>({
  enabled: true,
  setEnabled: () => {},
  toggle: () => {},
});

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Holds the background-FX preference (default on), persisted in
 * localStorage. Mounted once near the root (App.tsx, Storybook preview).
 */
export function BackgroundFxProvider({
  children,
  defaultEnabled,
}: {
  children?: React.ReactNode;
  /** Overrides the stored preference (stories/tests). */
  defaultEnabled?: boolean;
}) {
  const [enabled, setEnabledState] = React.useState<boolean>(
    () => defaultEnabled ?? readStored(),
  );

  const setEnabled = React.useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Storage unavailable (private mode); keep the in-memory value.
    }
  }, []);

  const value = React.useMemo(
    () => ({ enabled, setEnabled, toggle: () => setEnabled(!enabled) }),
    [enabled, setEnabled],
  );

  return (
    <BackgroundFxContext.Provider value={value}>
      {children}
    </BackgroundFxContext.Provider>
  );
}

/** Read/toggle the background FX preference. */
export function useBackgroundFx(): BackgroundFxValue {
  return React.useContext(BackgroundFxContext);
}

/**
 * The fixed decorative backdrop: a 44px cyan grid at 3.5% plus a violet glow
 * top-right and a cyan glow bottom-left. Renders nothing when FX are off.
 */
export function BackgroundFx() {
  const { enabled } = useBackgroundFx();
  if (!enabled) return null;
  return (
    <Box
      aria-hidden="true"
      data-testid="hl-background-fx"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: [
          `radial-gradient(ellipse 55% 40% at 88% -8%, ${tint("violet", 0.2)}, transparent 70%)`,
          `radial-gradient(ellipse 45% 35% at -5% 105%, ${tint("cyan", 0.1)}, transparent 70%)`,
          `linear-gradient(${tint("cyan", 0.035)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${tint("cyan", 0.035)} 1px, transparent 1px)`,
        ].join(","),
        backgroundSize: "auto, auto, 44px 44px, 44px 44px",
      }}
    />
  );
}

export default BackgroundFx;
