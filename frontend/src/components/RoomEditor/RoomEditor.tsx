import * as React from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import ArrowBackSharp from "@mui/icons-material/ArrowBackSharp";
import AddSharp from "@mui/icons-material/AddSharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import LockSharp from "@mui/icons-material/LockSharp";
import LinkOffSharp from "@mui/icons-material/LinkOffSharp";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { ApiError, userFacingReason } from "../../utils/apiError";
import {
  EmptyState,
  Tag,
  bracket,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "../hl";
import {
  TOOLS,
  TOOL_HINTS,
  TOOL_LABELS,
  TOOL_SHORTCUTS,
  applyTool,
  canMergeAdjacent,
  convertAllLegacySeats,
  convertLegacySeat,
  describeSeat,
  fromLayout,
  groupKeys,
  isFeature,
  isSeat,
  isDuplicateLabel,
  isReserved,
  linkCandidates,
  linkedSeat,
  mergeAdjacent,
  mergePath,
  moveItem,
  newRoom,
  parseKey,
  removeShape,
  removedReservations,
  nameSeat,
  renameSeat,
  reserverName,
  screensLinkedTo,
  setScreenLink,
  splitAll,
  snapshot,
  toSubmit,
  toolForShortcut,
  validateBackgroundFile,
  validateRooms,
  type EditorRoom,
  type Tool,
} from "./layout";
import {
  UnauthorizedError,
  clearLegacyImage,
  deleteBackground,
  fetchEventTitle,
  fetchLayout,
  saveLayout,
  uploadBackground,
  uploadErrorMessage,
} from "./api";
import { EditorGrid } from "./EditorGrid";
import {
  FeaturePanel,
  GridLegend,
  LegacyLabelsBanner,
  RoomPanel,
  SeatPanel,
} from "./SidePanels";
import { TOOL_ICONS } from "./icons";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

type PendingBackground = { file: File; preview: string } | "remove";

type Confirm =
  | { kind: "seat"; key: string }
  | { kind: "room" }
  | { kind: "conflict"; message: string }
  | { kind: "leave"; to: string }
  | null;

interface Status {
  tone: "ok" | "error" | "info";
  text: string;
  details?: string[];
}

const SAVED_TEXT = "Saved · seat map updated";

let roomKeyCounter = 0;

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const id = useId();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id={`${id}-t`}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-d`} component="div">
          {body}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Page column: the design's 18-24px gap between blocks. */
const Page = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      gap: "clamp(18px,2.4vw,24px)",
      minWidth: 0,
    }}
  >
    {children}
  </Box>
);

/** Admin page: edit an event's rooms as 12-column grids of seats and features. */
const RoomEditor = () => {
  const { id } = useParams();
  const eventId = Number(id);
  const navigate = useNavigate();
  const user = useContext(UserContext);
  const { signOut } = useContext(UserDispatchContext);
  const token = user?.token;
  const uid = useId();

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string>("");
  const [reload, setReload] = useState(0);
  const [eventTitle, setEventTitle] = useState("");
  const [rooms, setRooms] = useState<EditorRoom[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [baselineRooms, setBaselineRooms] = useState<EditorRoom[]>([]);
  const [pending, setPending] = useState<Record<string, PendingBackground>>({});
  const [bgErrors, setBgErrors] = useState<Record<string, string>>({});
  const [cur, setCur] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState({ col: 0, row: 0 });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [saving, setSaving] = useState(false);
  // Edits are locked while a save is in flight: the save replaces `rooms`
  // with the server's copy, which would silently drop anything typed meanwhile.
  const savingRef = useRef(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** Screen being linked to a seat on the grid (its square's key). */
  const [linking, setLinking] = useState<string | null>(null);
  /** Screen links the last edit cleared (shown as a note under the hint). */
  const [linkNotes, setLinkNotes] = useState<string[]>([]);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const toolRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const room: EditorRoom | undefined = rooms[cur];
  const dirty =
    phase === "ready" &&
    (snapshot(rooms) !== baseline || Object.keys(pending).length > 0);

  const handleUnauthorized = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) {
        signOut();
        return true;
      }
      return false;
    },
    [signOut],
  );

  // Load --------------------------------------------------------------------
  useEffect(() => {
    if (!Number.isFinite(eventId)) return;
    let live = true;
    fetchEventTitle(eventId, token)
      .then((t) => live && setEventTitle(t))
      .catch(() => undefined);
    fetchLayout(eventId, token)
      .then((layout) => {
        if (!live) return;
        const loaded = fromLayout(layout);
        setRooms(loaded);
        setBaseline(snapshot(loaded));
        setBaselineRooms(loaded);
        setPending({});
        setCur(0);
        setSel(null);
        setLinking(null);
        setLinkNotes([]);
        setPhase("ready");
      })
      .catch((e) => {
        if (!live || handleUnauthorized(e)) return;
        setLoadError(
          userFacingReason(e) ??
            "The rooms couldn't be loaded. Check your connection and try again.",
        );
        setPhase("error");
      });
    return () => {
      live = false;
    };
  }, [eventId, token, reload, handleUnauthorized]);

  // Revoke preview URLs on unmount.
  useEffect(
    () => () => {
      for (const p of Object.values(pendingRef.current))
        if (p !== "remove") URL.revokeObjectURL(p.preview);
    },
    [],
  );

  // Leaving -----------------------------------------------------------------
  const backTo = `/admin/events/${id}?tab=seating`;
  useUnsavedChangesGuard(dirty, (to) => setConfirm({ kind: "leave", to }));
  const goBack = () => {
    if (dirty) setConfirm({ kind: "leave", to: backTo });
    else navigate(backTo);
  };

  // Edits -------------------------------------------------------------------
  const announce = (text: string) => {
    // Re-announce identical messages by clearing first.
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(text), 30);
  };

  const updateRoom = (next: EditorRoom, notes: string[] = []) => {
    if (savingRef.current) return;
    setRooms((rs) => rs.map((r, i) => (i === cur ? next : r)));
    setLinkNotes(notes);
    if (status?.tone !== "error") setStatus(null);
  };

  const selectRoom = (index: number, focusTab = false) => {
    setCur(index);
    setSel(null);
    setLinking(null);
    setLinkNotes([]);
    setFocus({ col: 0, row: 0 });
    if (focusTab) tabRefs.current[rooms[index]?.key]?.focus();
  };

  const pickTool = (t: Tool, fromKeyboardShortcut = false) => {
    setTool(t);
    setLinking(null);
    if (fromKeyboardShortcut)
      announce(`${TOOL_LABELS[t]} tool. ${TOOL_HINTS[t]}`);
  };

  const selectedText = (key: string) => {
    if (!room) return "";
    const c = room.cells[key];
    if (isSeat(c))
      return `Selected seat ${c.label}${c.reservedBy ? `, reserved by ${reserverName(c.reservedBy)}` : ""}.`;
    if (isFeature(c)) {
      const n = groupKeys(room, key).length;
      const link = linkedSeat(room, key);
      const seat = link ? room.cells[link] : undefined;
      return `Selected ${c.t}${n > 1 ? ` of ${n} squares` : ""}${isSeat(seat) ? `, linked to seat ${seat.label}` : ""}. Its settings are in the side panel.`;
    }
    return "";
  };

  const activate = (key: string) => {
    if (!room || savingRef.current || tool === "move") return;
    const out = applyTool(room, tool, key, sel);
    if (out.type === "select") {
      setSel(out.sel);
      if (out.announce) announce(out.announce);
      else if (out.sel) announce(selectedText(out.sel));
    } else if (out.type === "update") {
      updateRoom(out.room, out.notes);
      setSel(out.sel);
      announce(out.announce);
    } else if (out.type === "confirm") {
      setSel(out.key);
      setConfirm({ kind: "seat", key: out.key });
    }
  };

  /** Drag-and-drop or keyboard move of a seat / feature shape. */
  const move = (from: string, to: { col: number; row: number }) => {
    if (!room || savingRef.current) return;
    const wasSelected = sel != null && moveGroupHas(from, sel);
    const out = moveItem(room, from, to);
    if (!out.ok) {
      announce(out.announce);
      return;
    }
    updateRoom(out.room, out.notes);
    if (isSeat(out.room.cells[out.key]) || wasSelected) setSel(out.key);
    else if (sel && !out.room.cells[sel]) setSel(null);
    setFocus(parseKey(out.key));
    announce(out.announce);
  };

  /** Whether `key` is part of the item (seat or shape) at `from`. */
  const moveGroupHas = (from: string, key: string) =>
    !!room &&
    (from === key ||
      (isFeature(room.cells[from]) && groupKeys(room, from).includes(key)));

  const erase = (key: string) => {
    if (!room || !room.cells[key] || savingRef.current) return;
    const out = applyTool(room, "erase", key, sel);
    if (out.type === "update") {
      updateRoom(out.room, out.notes);
      setSel(out.sel);
      announce(out.announce);
    } else if (out.type === "confirm") {
      setSel(out.key);
      setConfirm({ kind: "seat", key: out.key });
    }
  };

  const removeSelected = () => {
    if (!room || !sel) return;
    if (isReserved(room.cells[sel])) setConfirm({ kind: "seat", key: sel });
    else erase(sel);
  };

  const forceRemoveSeat = (key: string) => {
    if (!room || savingRef.current) return;
    const c = room.cells[key];
    const out = removeShape(room, key);
    updateRoom(out.room, out.notes);
    setSel(null);
    setConfirm(null);
    if (isSeat(c))
      announce([`Removed seat ${c.label}.`, ...out.notes].join(" "));
  };

  /** Apply a merge / split / link result to the current room. */
  const applyShapeEdit = (
    r:
      | { ok: true; room: EditorRoom; announce: string; notes: string[] }
      | {
          ok: false;
          announce: string;
        },
    nextSel: string | null = sel,
  ) => {
    if (r.ok) {
      updateRoom(r.room, r.notes);
      setSel(nextSel);
    }
    announce(r.announce);
  };

  const mergeAlong = (keys: string[]) => {
    if (!room || savingRef.current) return;
    applyShapeEdit(mergePath(room, keys), keys[0]);
  };

  const removeSelectedShape = () => {
    if (!room || !sel || savingRef.current) return;
    const c = room.cells[sel];
    if (!isFeature(c)) return;
    const n = groupKeys(room, sel).length;
    const out = removeShape(room, sel);
    updateRoom(out.room, out.notes);
    setSel(null);
    setLinking(null);
    announce(`Removed the ${c.t}${n > 1 ? ` (${n} squares)` : ""}.`);
  };

  const link = (seatKey: string | null) => {
    if (!room || !sel || savingRef.current) return;
    applyShapeEdit(setScreenLink(room, sel, seatKey));
  };

  const startLinking = () => {
    if (!room || !sel) return;
    if (linking) {
      setLinking(null);
      announce("Stopped picking a seat.");
      return;
    }
    const options = linkCandidates(room, sel);
    if (!options.length) {
      announce("No seat touches this screen.");
      return;
    }
    setLinking(sel);
    setFocus(parseKey(options[0]));
    const names = options
      .map((k) => {
        const c = room.cells[k];
        return isSeat(c) ? c.label : "";
      })
      .join(", ");
    announce(
      `Pick the seat for this screen: ${names}. They are highlighted on the grid. Escape cancels.`,
    );
  };

  const pickLinkedSeat = (seatKey: string | null) => {
    const screenKey = linking;
    setLinking(null);
    if (!room || !screenKey) return;
    if (!seatKey) {
      announce("Linking cancelled.");
      return;
    }
    applyShapeEdit(setScreenLink(room, screenKey, seatKey), screenKey);
  };

  const addRoom = () => {
    if (savingRef.current) return;
    const key = `new-${++roomKeyCounter}`;
    const r = newRoom(rooms, key);
    setRooms((rs) => [...rs, r]);
    setCur(rooms.length);
    setSel(null);
    setFocus({ col: 0, row: 0 });
    setTool("seat");
    setLinking(null);
    setLinkNotes([]);
    setStatus(null);
    announce(`Added ${r.name}. Seat tool selected.`);
  };

  const deleteRoom = () => {
    if (!room || savingRef.current) return;
    const p = pending[room.key];
    if (p && p !== "remove") URL.revokeObjectURL(p.preview);
    setPending(({ [room.key]: _drop, ...rest }) => rest);
    setRooms((rs) => rs.filter((_, i) => i !== cur));
    setCur((c) => Math.max(0, c - 1));
    setSel(null);
    // Room-scoped state must not leak into the room that takes its place.
    setLinking(null);
    setLinkNotes([]);
    setConfirm(null);
    setStatus(null);
    announce(`Deleted ${room.name.trim() || "room"}. Save to apply.`);
  };

  // Backgrounds -------------------------------------------------------------
  const pickBackground = (file: File) => {
    if (!room || savingRef.current) return;
    const problem = validateBackgroundFile(file);
    if (problem) {
      setBgErrors((e) => ({ ...e, [room.key]: problem }));
      return;
    }
    setBgErrors(({ [room.key]: _drop, ...rest }) => rest);
    const old = pending[room.key];
    if (old && old !== "remove") URL.revokeObjectURL(old.preview);
    setPending((p) => ({
      ...p,
      [room.key]: { file, preview: URL.createObjectURL(file) },
    }));
    setStatus(null);
    announce(`Background plan “${file.name}” added. It uploads when you save.`);
  };

  const removeBackground = () => {
    if (!room || savingRef.current) return;
    const old = pending[room.key];
    if (old && old !== "remove") URL.revokeObjectURL(old.preview);
    setBgErrors(({ [room.key]: _drop, ...rest }) => rest);
    setPending(({ [room.key]: _drop, ...rest }) =>
      room.backgroundUrl || room.legacyImage
        ? { ...rest, [room.key]: "remove" }
        : rest,
    );
    setStatus(null);
    announce("Background plan removed.");
  };

  const backgroundSrc = (r: EditorRoom) => {
    const p = pending[r.key];
    if (p === "remove") return null;
    if (p) return p.preview;
    return r.backgroundUrl ?? r.legacyImage;
  };

  // Save --------------------------------------------------------------------
  const save = async (forceRelease = false) => {
    if (savingRef.current) return;
    setConfirm(null);
    const problems = validateRooms(rooms);
    if (problems.length) {
      setStatus({
        tone: "error",
        text: "Fix these before saving:",
        details: problems,
      });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus({ tone: "info", text: "Saving…" });
    const release =
      forceRelease || removedReservations(baselineRooms, rooms).length > 0;
    try {
      const data = await saveLayout(eventId, toSubmit(rooms, release), token);
      const next = fromLayout(
        data,
        rooms.map((r) => r.key),
      );
      const failures: string[] = [];
      const stillPending: Record<string, PendingBackground> = {};
      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        const p = pending[r.key];
        if (!p || r.id == null) continue;
        try {
          if (p === "remove") {
            if (r.backgroundUrl) await deleteBackground(eventId, r.id, token);
            if (r.legacyImage)
              await clearLegacyImage(
                eventId,
                {
                  id: r.id,
                  name: r.name,
                  description: r.description || null,
                  sortOrder: i,
                },
                token,
              );
            next[i] = { ...r, backgroundUrl: null, legacyImage: null };
          } else {
            const updated = await uploadBackground(
              eventId,
              r.id,
              p.file,
              token,
            );
            URL.revokeObjectURL(p.preview);
            next[i] = {
              ...r,
              backgroundUrl: updated.backgroundUrl,
              legacyImage: null,
            };
          }
        } catch (e) {
          if (e instanceof UnauthorizedError) throw e;
          failures.push(`${r.name}: ${uploadErrorMessage(e)}`);
          stillPending[r.key] = p;
        }
      }
      setRooms(next);
      setBaseline(snapshot(next));
      setBaselineRooms(next);
      setPending(stillPending);
      if (sel && !next[cur]?.cells[sel]) setSel(null);
      setStatus(
        failures.length
          ? {
              tone: "error",
              text: "Rooms saved, but a background plan didn't upload:",
              details: failures,
            }
          : { tone: "ok", text: SAVED_TEXT },
      );
    } catch (e) {
      if (handleUnauthorized(e)) return;
      if (e instanceof ApiError && e.status === 409) {
        setStatus(null);
        setConfirm({
          kind: "conflict",
          message:
            e.description ??
            "Some reserved seats would be removed by this save.",
        });
      } else {
        setStatus({
          tone: "error",
          text:
            userFacingReason(e) ??
            "The rooms couldn't be saved. Check your connection and try again.",
        });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Keyboard: tabs and toolbar ------------------------------------------------
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = rooms.length - 1;
    const to =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to == null) return;
    e.preventDefault();
    selectRoom(to, true);
  };

  const onToolKeyDown = (e: React.KeyboardEvent) => {
    const i = TOOLS.indexOf(tool);
    let next: Tool | undefined;
    if (e.key === "ArrowRight") next = TOOLS[(i + 1) % TOOLS.length];
    else if (e.key === "ArrowLeft")
      next = TOOLS[(i - 1 + TOOLS.length) % TOOLS.length];
    else if (e.key === "Home") next = TOOLS[0];
    else if (e.key === "End") next = TOOLS[TOOLS.length - 1];
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1)
      next = toolForShortcut(e.key);
    if (!next) return;
    e.preventDefault();
    pickTool(next);
    toolRefs.current[next]?.focus();
  };

  // Render ------------------------------------------------------------------
  const selCell = room && sel ? room.cells[sel] : undefined;
  const selSeat = isSeat(selCell) ? selCell : null;
  const confirmSeat =
    confirm?.kind === "seat" && room ? room.cells[confirm.key] : undefined;
  const hintId = `${uid}-hint`;
  const kbdId = `${uid}-kbd`;
  const title = eventTitle || (phase === "loading" ? "" : `Event ${id}`);

  const header = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <Box
        component="button"
        type="button"
        onClick={goBack}
        sx={{
          alignSelf: "flex-start",
          minHeight: 44,
          padding: 0,
          border: 0,
          background: "none",
          color: colors.textMuted,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: fonts.mono,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          "&:hover": { color: colors.cyan },
          "&:focus-visible": {
            outline: `2px solid ${colors.cyan}`,
            outlineOffset: "2px",
          },
        }}
      >
        <ArrowBackSharp aria-hidden sx={{ fontSize: 18 }} />
        <span>
          {title ? `${title} · Seating` : "Back to event"}
          <Box component="span" sx={srOnly}>
            {" "}
            (back to event management)
          </Box>
        </span>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "12px 20px",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "12px 20px",
          }}
        >
          <Typography
            variant="h1"
            sx={{ fontSize: "clamp(30px,4vw,46px)", lineHeight: 1 }}
          >
            Room editor
          </Typography>
          <Tag tone="amber">Admin only</Tag>
        </Box>
        {phase === "ready" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              rowGap: "8px",
            }}
          >
            <Box
              role="status"
              aria-live="polite"
              sx={{
                fontSize: 14,
                mr: "12px",
                "&:empty": { mr: 0 },
                color: status?.tone === "ok" ? colors.lime : colors.textMuted,
              }}
            >
              {status && status.tone !== "error"
                ? status.text
                : dirty
                  ? "Unsaved changes"
                  : ""}
            </Box>
            <Button
              variant="contained"
              onClick={() => save()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save rooms"}
            </Button>
          </Box>
        )}
      </Box>
      {status?.tone === "error" && (
        <Box
          role="alert"
          sx={{
            display: "flex",
            gap: "10px",
            padding: "12px 14px",
            border: `1px solid ${tint("pink", 0.45)}`,
            backgroundColor: tint("pink", 0.07),
            color: colors.text,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <ErrorOutlineSharp
            aria-hidden
            sx={{ color: colors.pinkText, mt: "1px" }}
          />
          <Box>
            {status.text}
            {status.details && (
              <Box component="ul" sx={{ m: "4px 0 0", pl: "18px" }}>
                {status.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );

  if (!user?.isAdmin)
    return (
      <Page>
        {header}
        <EmptyState
          variant="panel"
          icon={<LockSharp />}
          title="Admins only"
          description="Only event admins can edit rooms."
        />
      </Page>
    );

  if (phase === "loading")
    return (
      <Page>
        {header}
        <Box
          aria-busy="true"
          aria-label="Loading rooms"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Skeleton variant="rectangular" height={44} sx={{ maxWidth: 420 }} />
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <Skeleton
              variant="rectangular"
              height={420}
              sx={{ flex: "2 1 540px" }}
            />
            <Skeleton
              variant="rectangular"
              height={420}
              sx={{ flex: "1 1 280px" }}
            />
          </Box>
        </Box>
      </Page>
    );

  if (!Number.isFinite(eventId) || phase === "error")
    return (
      <Page>
        {header}
        <EmptyState
          variant="panel"
          icon={<ErrorOutlineSharp />}
          title="Couldn't load the rooms"
          description={
            Number.isFinite(eventId)
              ? loadError
              : "That event link isn't valid."
          }
          action={
            <Button
              variant="outlined"
              onClick={() => {
                setPhase("loading");
                setReload((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      </Page>
    );

  return (
    <Page>
      {header}

      {/* Locked while saving (see savingRef). */}
      <Box
        inert={saving}
        aria-busy={saving}
        data-testid="room-editor-body"
        sx={{
          display: "contents",
          "& > *": { opacity: saving ? 0.6 : 1, transition: "opacity 120ms" },
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {rooms.length > 0 && (
            <Box
              role="tablist"
              aria-label="Rooms"
              sx={{
                display: "flex",
                flexWrap: "wrap",
                border: `1px solid ${hairline.control}`,
                backgroundColor: "rgba(12,15,24,0.8)",
              }}
            >
              {rooms.map((r, i) => {
                const on = i === cur;
                const n = Object.values(r.cells).filter(
                  (c) => c.t === "seat",
                ).length;
                return (
                  <Box
                    key={r.key}
                    component="button"
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${r.key}`}
                    aria-selected={on}
                    aria-controls={`${uid}-panel`}
                    tabIndex={on ? 0 : -1}
                    ref={(el: HTMLButtonElement | null) => {
                      tabRefs.current[r.key] = el;
                    }}
                    onClick={() => selectRoom(i)}
                    onKeyDown={(e: React.KeyboardEvent) => onTabKeyDown(e, i)}
                    sx={{
                      minHeight: 44,
                      padding: "0 16px",
                      border: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontFamily: fonts.ui,
                      fontWeight: 600,
                      fontSize: 13,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      backgroundColor: on ? colors.cyan : "transparent",
                      color: on ? colors.ink : colors.textMuted,
                      "&:hover": on ? {} : { color: colors.text },
                      "&:focus-visible": {
                        outline: `2px solid ${colors.cyan}`,
                        outlineOffset: "2px",
                        zIndex: 1,
                      },
                    }}
                  >
                    {r.name.trim() || "Untitled"}
                    <Box
                      component="span"
                      sx={{ fontFamily: fonts.mono, fontSize: 11 }}
                    >
                      <Box component="span" sx={srOnly}>
                        ,{" "}
                      </Box>
                      {n}
                      <Box component="span" sx={srOnly}>
                        {n === 1 ? " seat" : " seats"}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={addRoom}
            startIcon={<AddSharp aria-hidden />}
            sx={{ borderStyle: "dashed", fontSize: 12 }}
          >
            Add room
          </Button>
        </Box>

        {!room ? (
          <EmptyState
            variant="panel"
            title="No rooms yet"
            description="Add a room, then drop seats, screens and entrances on its grid. Attendees pick their seats from this plan."
            action={
              <Button
                variant="contained"
                onClick={addRoom}
                startIcon={<AddSharp aria-hidden />}
              >
                Add room
              </Button>
            }
          />
        ) : (
          <Box
            id={`${uid}-panel`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${room.key}`}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: "clamp(16px,2vw,24px)",
              alignItems: "flex-start",
            }}
          >
            <Box
              component="section"
              aria-label="Floor plan editor"
              sx={{
                flex: "2 1 540px",
                minWidth: 0,
                position: "relative",
                border: `1px solid ${tint("cyan", 0.2)}`,
                backgroundColor: colors.surface,
                ...bracket(),
              }}
            >
              <Box
                role="toolbar"
                aria-label="Tools"
                aria-orientation="horizontal"
                onKeyDown={onToolKeyDown}
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  padding: "12px 14px",
                  borderBottom: `1px solid ${hairline.soft}`,
                }}
              >
                {TOOLS.map((t) => {
                  const on = t === tool;
                  const Icon = TOOL_ICONS[t];
                  return (
                    <Box
                      key={t}
                      component="button"
                      type="button"
                      aria-pressed={on}
                      aria-keyshortcuts={TOOL_SHORTCUTS[t]}
                      title={`${TOOL_HINTS[t]} (${TOOL_SHORTCUTS[t]})`}
                      tabIndex={on ? 0 : -1}
                      ref={(el: HTMLButtonElement | null) => {
                        toolRefs.current[t] = el;
                      }}
                      onClick={() => pickTool(t)}
                      sx={{
                        minHeight: 44,
                        padding: "0 12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "7px",
                        fontFamily: fonts.ui,
                        fontWeight: 600,
                        fontSize: 13,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        border: `1px solid ${on ? colors.cyan : tint("cyan", 0.2)}`,
                        backgroundColor: on
                          ? tint("cyan", 0.14)
                          : "transparent",
                        color: on ? colors.cyan : colors.textMuted,
                        "&:hover": on
                          ? {}
                          : {
                              color: colors.text,
                              borderColor: hairline.strong,
                            },
                        "&:focus-visible": {
                          outline: `2px solid ${colors.cyan}`,
                          outlineOffset: "2px",
                        },
                      }}
                    >
                      <Icon aria-hidden sx={{ fontSize: 19 }} />
                      {TOOL_LABELS[t]}
                    </Box>
                  );
                })}
              </Box>
              <Box
                id={hintId}
                sx={{
                  padding: "10px 14px 0",
                  fontSize: 13,
                  color: colors.textMuted,
                }}
              >
                <Box component="span" sx={srOnly}>
                  {TOOL_LABELS[tool]} tool:{" "}
                </Box>
                {TOOL_HINTS[tool]}
                {linkNotes.length > 0 && (
                  <Box
                    data-testid="link-note"
                    sx={{
                      mt: "8px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: colors.amber,
                    }}
                  >
                    <LinkOffSharp
                      aria-hidden
                      sx={{ fontSize: 17, mt: "1px" }}
                    />
                    <span>{linkNotes.join(" ")}</span>
                  </Box>
                )}
              </Box>
              <Box id={kbdId} sx={srOnly}>
                Use the arrow keys to move between squares and Enter or Space to
                use the tool. Delete clears a square. To move a seat, screen or
                entrance, press M on it, use the arrow keys to choose where it
                goes, then Enter to drop it or Escape to cancel. To merge, use
                the Merge tool: press Enter on a square, then on a touching
                square of the same type. Select a screen to link it to a seat in
                the side panel. Tool shortcuts: V select, M move, D seat, S
                screen, E entrance, G merge, U split, X erase.
              </Box>
              <LegacyLabelsBanner
                room={room}
                onConvertAll={() => {
                  const out = convertAllLegacySeats(room);
                  if (out.count) updateRoom(out.room);
                  announce(out.announce);
                }}
              />
              <EditorGrid
                room={room}
                tool={tool}
                sel={sel}
                focus={focus}
                onFocusChange={setFocus}
                onActivate={activate}
                onErase={erase}
                onToolShortcut={(t) => pickTool(t, true)}
                onMove={move}
                onAnnounce={announce}
                onMergePath={mergeAlong}
                linking={
                  linking && room.cells[linking]
                    ? {
                        screen: linking,
                        candidates: linkCandidates(room, linking),
                      }
                    : null
                }
                onLinkPick={pickLinkedSeat}
                describedBy={`${hintId} ${kbdId}`}
                background={(() => {
                  const src = backgroundSrc(room);
                  return src
                    ? {
                        src,
                        style: room.backgroundStyle,
                        opacity: room.backgroundOpacity,
                      }
                    : null;
                })()}
              />
              <GridLegend />
            </Box>

            <Box
              component="aside"
              aria-label="Room settings"
              sx={{
                flex: "1 1 280px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <RoomPanel
                room={room}
                onChange={updateRoom}
                backgroundSrc={backgroundSrc(room)}
                pendingName={(() => {
                  const p = pending[room.key];
                  return p && p !== "remove" ? p.file.name : null;
                })()}
                pendingRemove={pending[room.key] === "remove"}
                backgroundError={bgErrors[room.key] ?? null}
                onPickBackground={pickBackground}
                onRemoveBackground={removeBackground}
                onDeleteRoom={() => setConfirm({ kind: "room" })}
              />
              {isFeature(selCell) && sel ? (
                <FeaturePanel
                  kind={selCell.t}
                  squares={groupKeys(room, sel).length}
                  canMerge={canMergeAdjacent(room, sel)}
                  onMergeAdjacent={() =>
                    applyShapeEdit(mergeAdjacent(room, sel))
                  }
                  onSplitAll={() => applyShapeEdit(splitAll(room, sel))}
                  seats={linkCandidates(room, sel).map((k) => {
                    const c = room.cells[k];
                    const about = isSeat(c) && c.description?.trim();
                    const named = isSeat(c) && c.name?.trim();
                    return {
                      key: k,
                      label: isSeat(c)
                        ? `${c.label || "(no label)"}${named ? ` · ${named}` : ""}${about ? ` – ${about}` : ""}`
                        : k,
                    };
                  })}
                  linked={linkedSeat(room, sel)}
                  onLink={link}
                  linking={linking != null}
                  onPickOnGrid={startLinking}
                  onRemove={removeSelectedShape}
                />
              ) : (
                <SeatPanel
                  seat={selSeat}
                  duplicate={!!sel && isDuplicateLabel(room, sel)}
                  screens={sel ? screensLinkedTo(room, sel).length : 0}
                  onRename={(v) => sel && updateRoom(renameSeat(room, sel, v))}
                  onName={(v) => sel && updateRoom(nameSeat(room, sel, v))}
                  onDescribe={(v) =>
                    sel && updateRoom(describeSeat(room, sel, v))
                  }
                  onUseAsName={() => {
                    if (!sel) return;
                    const out = convertLegacySeat(room, sel);
                    if (out.count) updateRoom(out.room);
                    announce(out.announce);
                  }}
                  onRemove={removeSelected}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Box aria-live="polite" sx={srOnly}>
        {announcement}
      </Box>

      <ConfirmDialog
        open={confirm?.kind === "seat"}
        title={`Remove seat ${isSeat(confirmSeat) ? confirmSeat.label : ""}?`}
        body={
          isSeat(confirmSeat) && confirmSeat.reservedBy
            ? `${reserverName(confirmSeat.reservedBy)} will lose their seat and will need to pick another. This happens when you save.`
            : "This seat is removed when you save."
        }
        cancelLabel="Keep"
        confirmLabel="Remove anyway"
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm?.kind === "seat" && forceRemoveSeat(confirm.key)
        }
      />
      <ConfirmDialog
        open={confirm?.kind === "room"}
        title={`Delete ${room?.name.trim() || "this room"}?`}
        body="The room and its seats are removed when you save."
        cancelLabel="Keep room"
        confirmLabel="Delete room"
        onCancel={() => setConfirm(null)}
        onConfirm={deleteRoom}
      />
      <ConfirmDialog
        open={confirm?.kind === "conflict"}
        title="Remove reserved seats?"
        body={
          <>
            {confirm?.kind === "conflict" && confirm.message}
            <Box component="p" sx={{ mb: 0 }}>
              Saving anyway frees those seats: the attendees keep their RSVP but
              will need to pick another seat.
            </Box>
          </>
        }
        cancelLabel="Cancel"
        confirmLabel="Save anyway"
        onCancel={() => setConfirm(null)}
        onConfirm={() => save(true)}
      />
      <ConfirmDialog
        open={confirm?.kind === "leave"}
        title="Leave without saving?"
        body="Your room changes haven't been saved and will be lost."
        cancelLabel="Stay"
        confirmLabel="Discard changes"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "leave") return;
          const to = confirm.to;
          setConfirm(null);
          // Clear dirty state first so the guard lets this navigation through.
          for (const p of Object.values(pending))
            if (p !== "remove") URL.revokeObjectURL(p.preview);
          setBaseline(snapshot(rooms));
          setPending({});
          navigate(to);
        }}
      />
    </Page>
  );
};

export default RoomEditor;
