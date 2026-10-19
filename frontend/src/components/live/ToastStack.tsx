/**
 * The one toast stack (README §3): fixed top-right, alerts first. Alerts
 * can only be minimised; results, reminders and admin posts can be hidden.
 * Minimised and hidden ids are remembered per event (localStorage).
 */
import * as React from "react";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import CloseSharp from "@mui/icons-material/CloseSharp";
import RemoveSharp from "@mui/icons-material/RemoveSharp";
import ExpandMoreSharp from "@mui/icons-material/ExpandMoreSharp";
import { colors, fonts } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { Toast, ToastAction } from "../../live/toasts";
import { formatRemaining } from "../../live/clock";
import { personFor } from "../../live/selectors";
import { AvatarRow, Mono, coverBackground } from "./liveUi";

interface Prefs {
  minimised: string[];
  hidden: string[];
}

const load = (key: string): Prefs => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return { minimised: [], hidden: [], ...JSON.parse(raw) };
  } catch {
    // Private mode or blocked storage: start fresh.
  }
  return { minimised: [], hidden: [] };
};

const save = (key: string, prefs: Prefs) => {
  try {
    // Keep the lists short: old ids never come back.
    window.localStorage.setItem(
      key,
      JSON.stringify({
        minimised: prefs.minimised.slice(-100),
        hidden: prefs.hidden.slice(-200),
      }),
    );
  } catch {
    // ignore
  }
};

/** Remembered minimised/hidden toast ids for an event. */
export function useToastPrefs(eventId: number) {
  const key = `live:toasts:${eventId}`;
  const [prefs, setPrefs] = useState<Prefs>(() => load(key));
  useEffect(() => save(key, prefs), [key, prefs]);
  return {
    prefs,
    toggleMinimised: (id: string) =>
      setPrefs((p) => ({
        ...p,
        minimised: p.minimised.includes(id)
          ? p.minimised.filter((x) => x !== id)
          : [...p.minimised, id],
      })),
    hide: (id: string) =>
      setPrefs((p) => ({ ...p, hidden: [...p.hidden, id] })),
  };
}

function ToastCard({
  toast,
  state,
  now,
  minimised,
  onMinimise,
  onHide,
  onAction,
}: {
  toast: Toast;
  state: LiveState;
  now: number;
  minimised: boolean;
  onMinimise: () => void;
  onHide: () => void;
  onAction: (a: ToastAction) => void;
}) {
  const remaining =
    toast.countdownTo != null && Number.isFinite(toast.countdownTo)
      ? formatRemaining(toast.countdownTo, now)
      : null;
  const shadow = `0 0 0 3px rgba(6,7,11,.6), 0 18px 60px -14px ${toast.color}`;
  if (minimised) {
    return (
      <ButtonBase
        onClick={onMinimise}
        aria-label={`${toast.title}: expand`}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          justifyContent: "flex-start",
          p: "6px 10px",
          border: `2px solid ${toast.color}`,
          backgroundColor: toast.bg,
          boxShadow: shadow,
          width: "100%",
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: toast.color,
            flex: "none",
          }}
        />
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            fontSize: 13,
            fontWeight: 700,
            color: colors.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast.title}
        </Box>
        {remaining && (
          <Mono size={12} color={colors.text}>
            {remaining}
          </Mono>
        )}
        <ExpandMoreSharp fontSize="small" sx={{ color: colors.text }} />
      </ButtonBase>
    );
  }
  const progress =
    toast.progress && toast.progress[1] > toast.progress[0]
      ? Math.max(
          0,
          Math.min(
            1,
            (now - toast.progress[0]) / (toast.progress[1] - toast.progress[0]),
          ),
        )
      : null;
  return (
    <Box
      role={toast.cls === "alert" ? "alert" : "status"}
      sx={{
        position: "relative",
        border: `2px solid ${toast.color}`,
        backgroundColor: toast.bg,
        boxShadow: shadow,
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", gap: "12px", p: "12px 12px 10px" }}>
        {(toast.gameId || toast.kind === "food") && (
          <Box
            aria-hidden="true"
            sx={{
              width: 84,
              height: 42,
              flex: "none",
              backgroundImage: coverBackground(
                toast.gameId ?? null,
                toast.kind ?? "game",
              ),
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <Box>
            <Mono
              size={10}
              color={colors.ink}
              sx={{ backgroundColor: toast.color, px: "6px", py: "1px" }}
            >
              {toast.kicker}
            </Mono>
          </Box>
          <Box
            sx={{
              fontSize: 18,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "#fff",
              lineHeight: 1.15,
              overflowWrap: "anywhere",
            }}
          >
            {toast.title}
          </Box>
          {toast.sub && (
            <Box sx={{ fontSize: 13, color: colors.text2 }}>{toast.sub}</Box>
          )}
        </Box>
        {remaining && toast.cls !== "result" && (
          <Box
            sx={{
              fontFamily: fonts.mono,
              fontSize: 34,
              fontWeight: 700,
              color: "#fff",
              textShadow: `0 0 18px ${toast.color}`,
              lineHeight: 1,
              alignSelf: "center",
            }}
          >
            {remaining}
          </Box>
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            ml: "-4px",
            mt: "-6px",
            mr: "-6px",
          }}
        >
          <IconButton
            size="small"
            aria-label="Minimise"
            onClick={onMinimise}
            sx={{ color: colors.text }}
          >
            <RemoveSharp fontSize="small" />
          </IconButton>
          {toast.canHide && (
            <IconButton
              size="small"
              aria-label="Hide"
              onClick={onHide}
              sx={{ color: colors.text }}
            >
              <CloseSharp fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>
      {toast.people?.some((r) => r.pids.length) && (
        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            px: "12px",
            pb: "8px",
          }}
        >
          {toast.people
            .filter((r) => r.pids.length)
            .map((r) => (
              <Box
                key={r.label}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Mono size={9} color={colors.text2}>
                  {r.label}
                </Mono>
                <AvatarRow
                  people={r.pids.map((pid) => personFor(state, pid))}
                  size={20}
                  me={state.me}
                />
              </Box>
            ))}
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          px: "12px",
          pb: "12px",
        }}
      >
        {toast.actions.map((a) => (
          <Button
            key={a.label}
            size="small"
            variant={a.primary ? "contained" : "outlined"}
            color={
              toast.cls === "alert"
                ? "error"
                : toast.cls === "admin"
                  ? "warning"
                  : toast.cls === "own"
                    ? "secondary"
                    : toast.cls === "result"
                      ? "success"
                      : "primary"
            }
            onClick={() => onAction(a)}
          >
            {a.label}
          </Button>
        ))}
        <Box sx={{ flex: 1 }} />
        <Mono size={9} color={colors.text2} weight={500}>
          {toast.life}
          {toast.cls === "result" && remaining ? ` ${remaining}` : ""}
        </Mono>
      </Box>
      {progress != null && (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 4,
            width: `${progress * 100}%`,
            backgroundColor: toast.cls === "result" ? "#fff" : toast.color,
          }}
        />
      )}
    </Box>
  );
}

export function ToastStack({
  state,
  toasts,
  now,
  onAction,
  prefs,
}: {
  state: LiveState;
  toasts: Toast[];
  now: number;
  onAction: (toast: Toast, action: ToastAction) => void;
  prefs: ReturnType<typeof useToastPrefs>;
}) {
  const visible = toasts.filter((t) => !prefs.prefs.hidden.includes(t.id));
  if (!visible.length) return null;
  return (
    <Box
      aria-label="Notifications"
      component="section"
      sx={{
        position: "fixed",
        top: 12,
        right: 16,
        zIndex: 1400,
        width: "min(470px, calc(100% - 32px))",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {visible.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          state={state}
          now={now}
          minimised={prefs.prefs.minimised.includes(t.id)}
          onMinimise={() => prefs.toggleMinimised(t.id)}
          onHide={() => prefs.hide(t.id)}
          onAction={(a) => onAction(t, a)}
        />
      ))}
    </Box>
  );
}

export default ToastStack;
