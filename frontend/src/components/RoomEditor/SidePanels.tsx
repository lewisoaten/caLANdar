import * as React from "react";
import { useId } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import OutlinedInput from "@mui/material/OutlinedInput";
import Slider from "@mui/material/Slider";
import type { SxProps, Theme } from "@mui/material/styles";
import UploadSharp from "@mui/icons-material/UploadSharp";
import SwapHorizSharp from "@mui/icons-material/SwapHorizSharp";
import DeleteSharp from "@mui/icons-material/DeleteSharp";
import AddSharp from "@mui/icons-material/AddSharp";
import RemoveSharp from "@mui/icons-material/RemoveSharp";
import CallMergeSharp from "@mui/icons-material/CallMergeSharp";
import CallSplitSharp from "@mui/icons-material/CallSplitSharp";
import LinkSharp from "@mui/icons-material/LinkSharp";
import {
  Kicker,
  StatCell,
  StatGrid,
  UserAvatar,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "../hl";
import {
  BACKGROUND_TYPES,
  MAX_DESCRIPTION_LENGTH,
  codePointLength,
  MAX_LABEL_LENGTH,
  MAX_OPACITY,
  MAX_ROWS,
  MIN_OPACITY,
  isValidIdentifier,
  minRows,
  reserverName,
  seatStats,
  type BackgroundStyle,
  type FeatureKind,
  type SeatCell,
  type EditorRoom,
} from "./layout";

const panelSx: SxProps<Theme> = {
  border: `1px solid ${hairline.panel}`,
  backgroundColor: colors.surface,
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const fieldLabelSx = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: "0.16em",
  color: colors.textMuted,
  textTransform: "uppercase",
} as const;

const smallCaps = {
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: "0.12em",
} as const;

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <Box component="label" htmlFor={id} sx={fieldLabelSx}>
        {label}
      </Box>
      {children}
    </Box>
  );
}

const inputSx = {
  minHeight: 46,
  backgroundColor: "rgba(6,7,11,0.6)",
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: tint("cyan", 0.3),
  },
} as const;

/** A visually hidden file input inside a styled `<label>`. */
function FilePicker({
  onPick,
  describedBy,
  sx,
  children,
  label,
}: {
  onPick: (file: File) => void;
  describedBy?: string;
  sx: SxProps<Theme>;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Box
      component="label"
      sx={[
        {
          cursor: "pointer",
          position: "relative",
          "&:focus-within": {
            outline: `2px solid ${colors.cyan}`,
            outlineOffset: "2px",
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
      <Box
        component="input"
        type="file"
        accept={BACKGROUND_TYPES.join(",")}
        aria-label={label}
        aria-describedby={describedBy}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
        sx={srOnly}
      />
    </Box>
  );
}

export interface RoomPanelProps {
  room: EditorRoom;
  onChange: (room: EditorRoom) => void;
  /** What is drawn behind the grid (pending upload, saved or legacy image). */
  backgroundSrc: string | null;
  /** A picked file waiting for Save. */
  pendingName: string | null;
  /** The background will be removed on Save. */
  pendingRemove: boolean;
  backgroundError: string | null;
  onPickBackground: (file: File) => void;
  onRemoveBackground: () => void;
  onDeleteRoom: () => void;
}

export function RoomPanel({
  room,
  onChange,
  backgroundSrc,
  pendingName,
  pendingRemove,
  backgroundError,
  onPickBackground,
  onRemoveBackground,
  onDeleteRoom,
}: RoomPanelProps) {
  const id = useId();
  const { seats, reserved } = seatStats(room);
  const lowest = minRows(room);
  const errorId = `${id}-bg-error`;
  const bgNoteId = `${id}-bg-note`;
  const setStyle = (backgroundStyle: BackgroundStyle) =>
    onChange({ ...room, backgroundStyle });

  return (
    <Box component="section" aria-labelledby={`${id}-title`} sx={panelSx}>
      <Kicker component="h2" id={`${id}-title`}>
        Room
      </Kicker>
      <Field label="Name" id={`${id}-name`}>
        <OutlinedInput
          id={`${id}-name`}
          value={room.name}
          onChange={(e) => onChange({ ...room, name: e.target.value })}
          error={!room.name.trim()}
          inputProps={{
            maxLength: 120,
            "aria-describedby": room.name.trim() ? undefined : `${id}-name-err`,
          }}
          sx={{ ...inputSx, "& input": { fontSize: 16 } }}
        />
        {!room.name.trim() && (
          <Box
            id={`${id}-name-err`}
            sx={{ fontSize: 13, color: colors.pinkText }}
          >
            Give the room a name.
          </Box>
        )}
      </Field>
      <Field label="Description" id={`${id}-desc`}>
        <OutlinedInput
          id={`${id}-desc`}
          value={room.description}
          onChange={(e) => onChange({ ...room, description: e.target.value })}
          sx={inputSx}
        />
      </Field>

      <Box
        role="group"
        aria-labelledby={`${id}-rows`}
        sx={{ display: "flex", alignItems: "center", gap: "10px" }}
      >
        <Box id={`${id}-rows`} sx={{ ...fieldLabelSx, flex: 1 }}>
          Grid rows
        </Box>
        <IconButton
          aria-label="Remove a row"
          disabled={room.rows <= lowest}
          onClick={() => onChange({ ...room, rows: room.rows - 1 })}
          sx={{ border: `1px solid ${hairline.control}`, color: colors.cyan }}
        >
          <RemoveSharp />
        </IconButton>
        <Box
          component="output"
          aria-live="polite"
          sx={{
            minWidth: 32,
            textAlign: "center",
            fontFamily: fonts.mono,
            fontSize: 16,
            fontWeight: 700,
            color: colors.text,
          }}
        >
          {room.rows}
        </Box>
        <IconButton
          aria-label="Add a row"
          disabled={room.rows >= MAX_ROWS}
          onClick={() => onChange({ ...room, rows: room.rows + 1 })}
          sx={{ border: `1px solid ${hairline.control}`, color: colors.cyan }}
        >
          <AddSharp />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Box component="span" sx={fieldLabelSx} id={`${id}-bg`}>
          Background plan
        </Box>
        {!backgroundSrc ? (
          <FilePicker
            onPick={onPickBackground}
            label="Upload floor plan or photo"
            describedBy={[bgNoteId, backgroundError ? errorId : ""]
              .filter(Boolean)
              .join(" ")}
            sx={{
              minHeight: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "12px",
              border: `1px dashed ${tint("cyan", 0.4)}`,
              backgroundColor: tint("cyan", 0.04),
              textAlign: "center",
              "&:hover": { backgroundColor: tint("cyan", 0.1) },
            }}
          >
            <UploadSharp
              aria-hidden
              sx={{ fontSize: 24, color: colors.cyan }}
            />
            <Box
              component="span"
              sx={{ fontSize: 14, fontWeight: 600, color: colors.cyan }}
            >
              Upload floor plan or photo
            </Box>
            <Box
              component="span"
              id={bgNoteId}
              sx={{ fontSize: 12, color: colors.textMuted }}
            >
              Shown behind the grid so seats line up with the real room. PNG,
              JPEG, WebP or GIF, up to 5 MB.
            </Box>
          </FilePicker>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "10px",
              border: `1px solid ${tint("cyan", 0.2)}`,
              backgroundColor: "rgba(6,7,11,0.5)",
            }}
          >
            <Box
              role="group"
              aria-label="Background style"
              sx={{ display: "flex", border: `1px solid ${hairline.control}` }}
            >
              {(
                [
                  ["retro", "Retro"],
                  ["original", "Original"],
                ] as const
              ).map(([value, label]) => {
                const on = room.backgroundStyle === value;
                return (
                  <Box
                    key={value}
                    component="button"
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStyle(value)}
                    sx={{
                      flex: 1,
                      minHeight: 44,
                      border: 0,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      fontFamily: fonts.ui,
                      ...smallCaps,
                      backgroundColor: on ? colors.cyan : "transparent",
                      color: on ? colors.ink : colors.textMuted,
                      "&:hover": on ? {} : { color: colors.text },
                      "&:focus-visible": {
                        outline: `2px solid ${colors.cyan}`,
                        outlineOffset: "2px",
                      },
                    }}
                  >
                    {label}
                  </Box>
                );
              })}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <Box
                id={`${id}-op`}
                sx={{ ...fieldLabelSx, fontSize: 10, color: colors.textDim }}
              >
                Opacity
              </Box>
              <Slider
                aria-labelledby={`${id}-op`}
                min={MIN_OPACITY}
                max={MAX_OPACITY}
                step={5}
                value={room.backgroundOpacity}
                getAriaValueText={(v) => `${v}%`}
                onChange={(_, v) =>
                  onChange({ ...room, backgroundOpacity: v as number })
                }
                sx={{ flex: 1, color: colors.cyan }}
              />
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  textAlign: "right",
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: colors.text,
                }}
              >
                {room.backgroundOpacity}%
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: "8px" }}>
              <FilePicker
                onPick={onPickBackground}
                label="Replace background plan"
                describedBy={backgroundError ? errorId : undefined}
                sx={{
                  flex: 1,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  border: `1px solid ${tint("cyan", 0.35)}`,
                  color: colors.cyan,
                  textTransform: "uppercase",
                  ...smallCaps,
                  "&:hover": { backgroundColor: tint("cyan", 0.08) },
                }}
              >
                <SwapHorizSharp aria-hidden sx={{ fontSize: 17 }} />
                Replace
              </FilePicker>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={onRemoveBackground}
                sx={{ flex: 1 }}
              >
                Remove
              </Button>
            </Box>
            {pendingName && (
              <Box sx={{ fontSize: 13, color: colors.textMuted }}>
                “{pendingName}” uploads when you save.
              </Box>
            )}
          </Box>
        )}
        {pendingRemove && (
          <Box sx={{ fontSize: 13, color: colors.textMuted }}>
            The background plan is removed when you save.
          </Box>
        )}
        {backgroundError && (
          <Box
            id={errorId}
            role="alert"
            sx={{ fontSize: 13, color: colors.pinkText, lineHeight: 1.45 }}
          >
            {backgroundError}
          </Box>
        )}
      </Box>

      <StatGrid columns={2}>
        <StatCell value={seats} label="Seats" tone="cyan" size="lg" />
        <StatCell value={reserved} label="Reserved" tone="violet" size="lg" />
      </StatGrid>

      {reserved === 0 ? (
        <Button variant="outlined" color="error" onClick={onDeleteRoom}>
          Delete room
        </Button>
      ) : (
        <Box sx={{ fontSize: 13, lineHeight: 1.5, color: colors.textMuted }}>
          Rooms with reserved seats can’t be deleted. Remove those seats first.
        </Box>
      )}
    </Box>
  );
}

export interface SeatPanelProps {
  seat: SeatCell | null;
  duplicate: boolean;
  /** Screens linked to this seat. */
  screens?: number;
  onRename: (label: string) => void;
  onDescribe: (description: string) => void;
  onRemove: () => void;
}

/** "3/8" under a field; turns pink at the limit. */
function Counter({ id, n, max }: { id: string; n: number; max: number }) {
  return (
    <Box
      component="span"
      id={id}
      sx={{
        flex: "none",
        fontFamily: fonts.mono,
        fontSize: 11,
        color: n >= max ? colors.pinkText : colors.textDim,
      }}
    >
      {n}/{max}
      <Box component="span" sx={srOnly}>
        {" "}
        characters
      </Box>
    </Box>
  );
}

const helpRowSx = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  fontSize: 12,
  lineHeight: 1.45,
  color: colors.textMuted,
} as const;

export function SeatPanel({
  seat,
  duplicate,
  screens = 0,
  onRename,
  onDescribe,
  onRemove,
}: SeatPanelProps) {
  const id = useId();
  const legacy = !!seat?.label && !isValidIdentifier(seat.label);
  const described = [
    `${id}-help`,
    `${id}-count`,
    duplicate ? `${id}-dup` : "",
    seat && !seat.label ? `${id}-empty` : "",
    legacy ? `${id}-legacy` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const description = seat?.description ?? "";
  return (
    <Box component="section" aria-labelledby={`${id}-title`} sx={panelSx}>
      <Kicker component="h2" id={`${id}-title`}>
        Selected seat
      </Kicker>
      {!seat ? (
        <Box sx={{ fontSize: 14, lineHeight: 1.5, color: colors.textMuted }}>
          Use Select and tap a seat to rename it, describe it or remove it, or a
          screen or entrance to merge, split or link it.
        </Box>
      ) : (
        <>
          <Field label="Identifier" id={`${id}-label`}>
            <OutlinedInput
              id={`${id}-label`}
              value={seat.label}
              onChange={(e) => onRename(e.target.value)}
              error={duplicate || !seat.label}
              inputProps={{
                // Legacy labels may be longer; they can still be shortened.
                maxLength: Math.max(MAX_LABEL_LENGTH, seat.label.length),
                spellCheck: false,
                autoComplete: "off",
                // Identifiers keep their case: no sentence-casing on phones.
                autoCapitalize: "none",
                autoCorrect: "off",
                "aria-describedby": described,
                "aria-invalid": duplicate || !seat.label,
              }}
              sx={{
                ...inputSx,
                "& input": {
                  fontFamily: fonts.mono,
                  fontSize: 18,
                  fontWeight: 700,
                },
              }}
            />
            <Box sx={helpRowSx}>
              <Box component="span" id={`${id}-help`}>
                Shown on the seat. Letters, digits, - _ and ., up to{" "}
                {MAX_LABEL_LENGTH} characters.
              </Box>
              <Counter
                id={`${id}-count`}
                n={seat.label.length}
                max={MAX_LABEL_LENGTH}
              />
            </Box>
          </Field>
          {duplicate && (
            <Box id={`${id}-dup`} sx={{ fontSize: 13, color: colors.pinkText }}>
              Another seat in this room already uses that identifier.
            </Box>
          )}
          {!seat.label && (
            <Box
              id={`${id}-empty`}
              sx={{ fontSize: 13, color: colors.pinkText }}
            >
              The seat needs an identifier.
            </Box>
          )}
          {legacy && (
            <Box
              id={`${id}-legacy`}
              sx={{ fontSize: 13, lineHeight: 1.45, color: colors.amber }}
            >
              This older label is kept as it is. If you edit it, it must follow
              the rules above; put longer text in the description.
            </Box>
          )}
          <Field label="Description (optional)" id={`${id}-about`}>
            <OutlinedInput
              id={`${id}-about`}
              value={description}
              onChange={(e) => onDescribe(e.target.value)}
              placeholder="e.g. Window seat next to the fridge"
              multiline
              minRows={2}
              inputProps={{
                // No maxLength: it counts UTF-16 units, the API counts code
                // points. `describeSeat` clips by code point instead.
                "aria-describedby": `${id}-about-help ${id}-about-count`,
              }}
              sx={{ ...inputSx, fontSize: 15, alignItems: "flex-start" }}
            />
            <Box sx={helpRowSx}>
              <Box component="span" id={`${id}-about-help`}>
                Shown to attendees when they pick a seat.
              </Box>
              <Counter
                id={`${id}-about-count`}
                n={codePointLength(description)}
                max={MAX_DESCRIPTION_LENGTH}
              />
            </Box>
          </Field>
          {seat.reservedBy && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                border: "1px solid rgba(165,139,255,0.35)",
                backgroundColor: tint("violet", 0.08),
              }}
            >
              <UserAvatar
                name={reserverName(seat.reservedBy)}
                src={seat.reservedBy.avatarUrl}
                size={32}
              />
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  minWidth: 0,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    overflowWrap: "anywhere",
                  }}
                >
                  {reserverName(seat.reservedBy)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: colors.violetText,
                  }}
                >
                  RESERVED THIS SEAT
                </Box>
              </Box>
            </Box>
          )}
          {screens > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              <LinkSharp
                aria-hidden
                sx={{ fontSize: 16, color: colors.amber }}
              />
              {screens === 1
                ? "A screen is linked to this seat."
                : `${screens} screens are linked to this seat.`}
            </Box>
          )}
          <Button
            variant="outlined"
            color="error"
            onClick={onRemove}
            startIcon={<DeleteSharp aria-hidden />}
          >
            Remove seat
          </Button>
        </>
      )}
    </Box>
  );
}

export interface FeaturePanelProps {
  kind: FeatureKind;
  /** Squares in the shape. */
  squares: number;
  /** Another shape of the same type touches this one. */
  canMerge: boolean;
  onMergeAdjacent: () => void;
  onSplitAll: () => void;
  /** Screens: seats it may link to (key + accessible text). */
  seats: { key: string; label: string }[];
  /** Screens: the linked seat's key, or null. */
  linked: string | null;
  onLink: (seatKey: string | null) => void;
  /** Screens: pick the seat on the grid instead. */
  linking: boolean;
  onPickOnGrid: () => void;
  onRemove: () => void;
}

const panelButtonSx = {
  justifyContent: "flex-start",
  textAlign: "left",
} as const;

/** Side panel for a selected screen or entrance shape. */
export function FeaturePanel({
  kind,
  squares,
  canMerge,
  onMergeAdjacent,
  onSplitAll,
  seats,
  linked,
  onLink,
  linking,
  onPickOnGrid,
  onRemove,
}: FeaturePanelProps) {
  const id = useId();
  const name = kind === "screen" ? "screen" : "entrance";
  const screen = kind === "screen";
  return (
    <Box component="section" aria-labelledby={`${id}-title`} sx={panelSx}>
      <Kicker component="h2" id={`${id}-title`}>
        Selected {name}
      </Kicker>
      <Box sx={{ fontSize: 14, lineHeight: 1.5, color: colors.textMuted }}>
        {squares === 1
          ? `A single-square ${name}.`
          : `One ${name} of ${squares} squares.`}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Button
          variant="outlined"
          onClick={onMergeAdjacent}
          disabled={!canMerge}
          aria-describedby={canMerge ? undefined : `${id}-merge-note`}
          startIcon={<CallMergeSharp aria-hidden />}
          sx={panelButtonSx}
        >
          Merge with adjacent squares of the same type
        </Button>
        {!canMerge && (
          <Box
            id={`${id}-merge-note`}
            sx={{ fontSize: 12, lineHeight: 1.45, color: colors.textMuted }}
          >
            No other {name} squares touch this one by a side.
          </Box>
        )}
        <Button
          variant="outlined"
          onClick={onSplitAll}
          disabled={squares < 2}
          startIcon={<CallSplitSharp aria-hidden />}
          sx={panelButtonSx}
        >
          Split into single squares
        </Button>
      </Box>
      {screen && (
        <Field label="Linked seat" id={`${id}-link`}>
          <Box
            component="select"
            id={`${id}-link`}
            value={linked ?? ""}
            disabled={seats.length === 0 && !linked}
            aria-describedby={`${id}-link-help`}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onLink(e.target.value || null)
            }
            sx={{
              minHeight: 46,
              padding: "0 12px",
              fontFamily: fonts.ui,
              fontSize: 16,
              color: colors.text,
              backgroundColor: "rgba(6,7,11,0.6)",
              border: `1px solid ${tint("cyan", 0.3)}`,
              borderRadius: "4px",
              "&:focus-visible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: "2px",
              },
              "&:disabled": { color: colors.textMuted },
              "& option": { backgroundColor: colors.surfaceSolid },
            }}
          >
            <option value="">None</option>
            {seats.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Box>
          <Box
            id={`${id}-link-help`}
            sx={{ fontSize: 12, lineHeight: 1.45, color: colors.textMuted }}
          >
            {seats.length === 0
              ? "No seat touches this screen. Put a seat next to it (side or corner) to link them."
              : "Seats touching this screen by a side or corner. When the seat is reserved, the seat map shows the screen as taken."}
          </Box>
          {seats.length > 0 && (
            <Button
              variant={linking ? "contained" : "outlined"}
              onClick={onPickOnGrid}
              aria-pressed={linking}
              startIcon={<LinkSharp aria-hidden />}
              sx={panelButtonSx}
            >
              {linking ? "Cancel picking a seat" : "Pick the seat on the grid"}
            </Button>
          )}
        </Field>
      )}
      <Button
        variant="outlined"
        color="error"
        onClick={onRemove}
        startIcon={<DeleteSharp aria-hidden />}
      >
        Remove {name}
      </Button>
    </Box>
  );
}

/** Colour key under the grid. */
export function GridLegend() {
  const item = (swatch: React.CSSProperties, label: string) => (
    <Box
      component="li"
      sx={{ display: "flex", alignItems: "center", gap: "8px" }}
      key={label}
    >
      <Box aria-hidden sx={{ width: 14, height: 14, ...swatch }} />
      {label}
    </Box>
  );
  return (
    <Box
      component="ul"
      aria-label="Legend"
      sx={{
        listStyle: "none",
        m: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 18px",
        padding: "0 14px 14px",
        fontSize: 13,
        color: colors.textMuted,
      }}
    >
      {item({ border: `1px solid ${colors.cyan}` }, "Seat")}
      {item(
        {
          background: tint("violet", 0.25),
          border: "1px solid rgba(165,139,255,0.6)",
        },
        "Reserved seat",
      )}
      {item({ background: tint("violet", 0.4) }, "Screen / feature")}
      {item(
        {
          background: tint("lime", 0.3),
          border: `1px solid ${tint("lime", 0.6)}`,
        },
        "Entrance",
      )}
      {item(
        {
          height: 2,
          alignSelf: "center",
          background: colors.amber,
        },
        "Screen linked to a seat",
      )}
      {item({ border: `1px dashed ${colors.pink}` }, "Duplicate label")}
    </Box>
  );
}
