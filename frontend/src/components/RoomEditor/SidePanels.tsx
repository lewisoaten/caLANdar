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
  MAX_LABEL_LENGTH,
  MAX_OPACITY,
  MAX_ROWS,
  MIN_OPACITY,
  minRows,
  reserverName,
  type BackgroundStyle,
  type DeskCell,
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
  let desks = 0;
  let reserved = 0;
  for (const c of Object.values(room.cells))
    if (c.t === "desk") {
      desks++;
      if (c.reservedBy) reserved++;
    }
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
              Shown behind the grid so desks line up with the real room. PNG,
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
        <StatCell value={desks} label="Desks" tone="cyan" size="lg" />
        <StatCell value={reserved} label="Reserved" tone="violet" size="lg" />
      </StatGrid>

      {reserved === 0 ? (
        <Button variant="outlined" color="error" onClick={onDeleteRoom}>
          Delete room
        </Button>
      ) : (
        <Box sx={{ fontSize: 13, lineHeight: 1.5, color: colors.textMuted }}>
          Rooms with reserved desks can’t be deleted. Remove those desks first.
        </Box>
      )}
    </Box>
  );
}

export interface DeskPanelProps {
  desk: DeskCell | null;
  duplicate: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
}

export function DeskPanel({
  desk,
  duplicate,
  onRename,
  onRemove,
}: DeskPanelProps) {
  const id = useId();
  const described = [
    `${id}-help`,
    duplicate ? `${id}-dup` : "",
    desk && !desk.label ? `${id}-empty` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Box component="section" aria-labelledby={`${id}-title`} sx={panelSx}>
      <Kicker component="h2" id={`${id}-title`}>
        Selected desk
      </Kicker>
      {!desk ? (
        <Box sx={{ fontSize: 14, lineHeight: 1.5, color: colors.textMuted }}>
          Use Select and tap a desk to rename it or remove it.
        </Box>
      ) : (
        <>
          <Field label="Label" id={`${id}-label`}>
            <OutlinedInput
              id={`${id}-label`}
              value={desk.label}
              onChange={(e) => onRename(e.target.value)}
              error={duplicate || !desk.label}
              inputProps={{
                maxLength: MAX_LABEL_LENGTH,
                autoCapitalize: "characters",
                spellCheck: false,
                "aria-describedby": described,
                "aria-invalid": duplicate || !desk.label,
              }}
              sx={{
                ...inputSx,
                "& input": {
                  fontFamily: fonts.mono,
                  fontSize: 18,
                  fontWeight: 700,
                  textTransform: "uppercase",
                },
              }}
            />
            <Box
              id={`${id}-help`}
              sx={{ fontSize: 12, color: colors.textMuted }}
            >
              A–Z and 0–9, up to {MAX_LABEL_LENGTH} characters.
            </Box>
          </Field>
          {duplicate && (
            <Box id={`${id}-dup`} sx={{ fontSize: 13, color: colors.pinkText }}>
              Another desk in this room already uses that label.
            </Box>
          )}
          {!desk.label && (
            <Box
              id={`${id}-empty`}
              sx={{ fontSize: 13, color: colors.pinkText }}
            >
              The desk needs a label.
            </Box>
          )}
          {desk.reservedBy && (
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
                name={reserverName(desk.reservedBy)}
                src={desk.reservedBy.avatarUrl}
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
                  {reserverName(desk.reservedBy)}
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
                  RESERVED THIS DESK
                </Box>
              </Box>
            </Box>
          )}
          <Button
            variant="outlined"
            color="error"
            onClick={onRemove}
            startIcon={<DeleteSharp aria-hidden />}
          >
            Remove desk
          </Button>
        </>
      )}
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
      {item({ border: `1px solid ${colors.cyan}` }, "Desk")}
      {item(
        {
          background: tint("violet", 0.25),
          border: "1px solid rgba(165,139,255,0.6)",
        },
        "Reserved desk",
      )}
      {item({ background: tint("violet", 0.4) }, "Screen / feature")}
      {item(
        {
          background: tint("lime", 0.3),
          border: `1px solid ${tint("lime", 0.6)}`,
        },
        "Entrance",
      )}
      {item({ border: `1px dashed ${colors.pink}` }, "Duplicate label")}
    </Box>
  );
}
