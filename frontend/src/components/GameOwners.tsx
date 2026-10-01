import * as React from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import SentimentVeryDissatisfiedSharp from "@mui/icons-material/SentimentVeryDissatisfiedSharp";
import { Gamer } from "../types/game_suggestions";
import { UserAvatar, colors, fonts, hairline, tint, srOnly } from "./hl";
import { displayCallsign } from "../utils/callsign";

/** A gamer's callsign, or the shared fallback when they haven't picked one. */
export const gamerName = (gamer: Gamer) => displayCallsign(gamer.handle);

/** Who "you" are, to highlight your own chip. */
export interface OwnerIdentity {
  avatarUrl?: string | null;
  handle?: string | null;
}

/**
 * Whether `gamer` is the viewer. Avatars are per-email Gravatar URLs, so they
 * identify a person; the callsign is only a fallback (it isn't unique).
 */
export function isSameGamer(gamer: Gamer, me?: OwnerIdentity | null) {
  if (!me) return false;
  if (me.avatarUrl && gamer.avatarUrl) return me.avatarUrl === gamer.avatarUrl;
  return Boolean(me.handle && gamer.handle && me.handle === gamer.handle);
}

/** Put the viewer first, keep everyone else in server order. */
export function sortOwners(gamers: Gamer[], me?: OwnerIdentity | null) {
  const mine = gamers.filter((g) => isSameGamer(g, me));
  return mine.length
    ? [...mine, ...gamers.filter((g) => !isSameGamer(g, me))]
    : gamers;
}

export interface OwnerChipProps {
  gamer: Gamer;
  /** Highlight as the viewer (cyan). */
  me?: boolean;
  /** `lime` for the suggest dialog's "they own it" list. */
  tone?: "neutral" | "lime";
}

/** 28px chip: avatar + callsign. */
export function OwnerChip({
  gamer,
  me = false,
  tone = "neutral",
}: OwnerChipProps) {
  const name = gamerName(gamer);
  const border = me
    ? hairline.strong
    : tone === "lime"
      ? tint("lime", 0.4)
      : tint("neutral", 0.25);
  return (
    <Box
      component="span"
      title={name}
      sx={{
        height: 28,
        maxWidth: "100%",
        pl: "3px",
        pr: "9px",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        border: `1px solid ${border}`,
        fontSize: 12,
        lineHeight: 1,
        color: me ? colors.cyan : tone === "lime" ? colors.text : colors.text2,
      }}
    >
      <UserAvatar name={gamer.handle} src={gamer.avatarUrl} size={20} />
      <Box
        component="span"
        sx={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </Box>
      {me && (
        <Box component="span" sx={srOnly}>
          (you)
        </Box>
      )}
    </Box>
  );
}

export interface OwnerChipsProps {
  gamers: Gamer[];
  me?: OwnerIdentity | null;
  /** Show at most this many chips, then a "+N" chip listing the rest. */
  max?: number;
  tone?: OwnerChipProps["tone"];
  /** Accessible name of the list. */
  label?: string;
}

/** Wrapping list of owner chips, viewer first. */
export function OwnerChips({
  gamers,
  me,
  max,
  tone = "neutral",
  label = "Owners",
}: OwnerChipsProps) {
  const sorted = sortOwners(gamers, me);
  const shown = max && sorted.length > max ? sorted.slice(0, max - 1) : sorted;
  const hidden = sorted.slice(shown.length);
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px",
        minWidth: 0,
      }}
    >
      {shown.map((gamer, i) => (
        <Box
          component="li"
          key={`${gamer.avatarUrl ?? ""}-${gamer.handle ?? ""}-${i}`}
          sx={{ display: "flex", minWidth: 0, maxWidth: "100%" }}
        >
          <OwnerChip gamer={gamer} me={isSameGamer(gamer, me)} tone={tone} />
        </Box>
      ))}
      {hidden.length > 0 && (
        <Box component="li" sx={{ display: "flex" }}>
          <Box
            component="span"
            title={hidden.map(gamerName).join(", ")}
            sx={{
              height: 28,
              px: "9px",
              display: "inline-flex",
              alignItems: "center",
              border: `1px solid ${tint("neutral", 0.25)}`,
              fontFamily: fonts.mono,
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            <span aria-hidden="true">+{hidden.length}</span>
            <Box component="span" sx={srOnly}>
              and {hidden.length} more: {hidden.map(gamerName).join(", ")}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

interface GameOwnersProps {
  hideIfEmpty?: boolean;
  gamerOwned: Gamer[];
  gamerUnowned?: Gamer[];
  gamerUnknown?: Gamer[];
}

const OwnerSection = ({
  title,
  gamers,
}: {
  title: string;
  gamers: Gamer[];
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
    <Box
      component="span"
      sx={{
        fontFamily: fonts.mono,
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: colors.textMuted,
      }}
    >
      {title} · {gamers.length}
    </Box>
    <Box
      component="ul"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      {gamers.map((gamer, i) => (
        <Box
          component="li"
          key={`${gamer.handle ?? ""}-${i}`}
          sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13 }}
        >
          <UserAvatar name={gamer.handle} src={gamer.avatarUrl} size={22} />
          {gamerName(gamer)}
        </Box>
      ))}
    </Box>
  </Box>
);

/**
 * Compact stacked avatars of a game's owners, with a tooltip listing owners,
 * non-owners and unknowns. Focusable so the tooltip also works by keyboard.
 */
export default function GameOwners(props: GameOwnersProps) {
  const theme = useTheme();
  const lg = useMediaQuery(theme.breakpoints.up("lg"));
  const sm = useMediaQuery(theme.breakpoints.up("sm"));
  const { gamerOwned, gamerUnowned = [], gamerUnknown = [] } = props;

  if ((props.hideIfEmpty || false) && gamerOwned.length === 0) return null;

  const max = lg ? 7 : sm ? 5 : 3;
  const shown =
    gamerOwned.length > max ? gamerOwned.slice(0, max - 1) : gamerOwned;
  const extra = gamerOwned.length - shown.length;

  const summary =
    gamerOwned.length === 0
      ? "Nobody owns this game"
      : `Owned by ${gamerOwned.length}: ${gamerOwned.map(gamerName).join(", ")}`;

  return (
    <Tooltip
      disableInteractive
      title={
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 0.5 }}
        >
          {gamerOwned.length > 0 && (
            <OwnerSection title="Owners" gamers={gamerOwned} />
          )}
          {gamerUnowned.length > 0 && (
            <OwnerSection title="Unowned" gamers={gamerUnowned} />
          )}
          {gamerUnknown.length > 0 && (
            <OwnerSection title="Unknown" gamers={gamerUnknown} />
          )}
          {gamerOwned.length === 0 &&
            gamerUnowned.length === 0 &&
            gamerUnknown.length === 0 && <span>Nobody owns this yet</span>}
        </Box>
      }
    >
      <Box
        tabIndex={0}
        role="img"
        aria-label={summary}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 32,
          "&:focus-visible": {
            outline: `2px solid ${colors.cyan}`,
            outlineOffset: 2,
          },
          "& > *:not(:first-of-type)": { ml: "-6px" },
        }}
      >
        {gamerOwned.length === 0 ? (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
              border: `1px solid ${colors.pink}`,
              backgroundColor: tint("pink", 0.1),
              color: colors.pinkText,
            }}
          >
            <SentimentVeryDissatisfiedSharp fontSize="small" />
          </Box>
        ) : (
          <>
            {shown.map((gamer, i) => (
              <UserAvatar
                key={`${gamer.handle ?? ""}-${i}`}
                name={gamer.handle}
                src={gamer.avatarUrl}
                size={32}
              />
            ))}
            {extra > 0 && (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  width: 32,
                  height: 32,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: colors.surface2,
                  border: `1px solid ${hairline.control}`,
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: colors.text2,
                }}
              >
                +{extra}
              </Box>
            )}
          </>
        )}
      </Box>
    </Tooltip>
  );
}
