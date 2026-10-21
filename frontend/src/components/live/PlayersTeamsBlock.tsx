/**
 * Players & teams (README §2): shared by the propose sheet and the Steam
 * "new game" setup. Teams are optional: `No teams` shows a max-players
 * stepper; 2/3/4/5+ teams show one row per team with an editable name and
 * a size stepper (teams can be uneven, e.g. 1 v 4).
 */
import * as React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import AddSharp from "@mui/icons-material/AddSharp";
import RemoveSharp from "@mui/icons-material/RemoveSharp";
import { colors, fonts, tint } from "../hl/tokens";
import type { Team } from "../../live/types";
import { Mono } from "./liveUi";
import { teamColor } from "./TeamCards";

export interface PlayersTeams {
  maxPlayers: number | null;
  teams: Team[] | null;
}

const PLACEHOLDERS = ["Survivors", "Killers", "Red", "Blue", "Gold", "Green"];

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${tint("cyan", 0.25)}`,
      }}
    >
      <IconButton
        size="small"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <RemoveSharp fontSize="small" />
      </IconButton>
      <Box
        component="output"
        aria-label={label}
        sx={{
          minWidth: 34,
          textAlign: "center",
          fontFamily: fonts.mono,
          fontSize: 14,
          color: colors.text,
        }}
      >
        {value}
      </Box>
      <IconButton
        size="small"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <AddSharp fontSize="small" />
      </IconButton>
    </Box>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ButtonBase
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        px: "12px",
        py: "7px",
        fontFamily: fonts.mono,
        fontSize: 13,
        color: selected ? colors.text : colors.textMuted,
        border: `${selected ? 2 : 1}px solid ${selected ? colors.cyan : tint("cyan", 0.25)}`,
        backgroundColor: selected ? tint("cyan", 0.1) : "transparent",
      }}
    >
      {children}
    </ButtonBase>
  );
}

/** `4 v 4 · 8 players`, or `Up to 6 players`. */
export function summary(value: PlayersTeams): string {
  if (value.teams?.length) {
    const total = value.teams.reduce((n, t) => n + t.size, 0);
    return `${value.teams.map((t) => t.size).join(" v ")} · ${total} players`;
  }
  return value.maxPlayers
    ? `Up to ${value.maxPlayers} players`
    : "Any number of players";
}

export function PlayersTeamsBlock({
  value,
  onChange,
}: {
  value: PlayersTeams;
  onChange: (v: PlayersTeams) => void;
}) {
  const count = value.teams?.length ?? 0;
  const setCount = (n: number) => {
    if (n === 0) {
      onChange({ maxPlayers: value.maxPlayers ?? 4, teams: null });
      return;
    }
    const teams = [...(value.teams ?? [])];
    while (teams.length < n) teams.push({ name: "", size: 4 });
    onChange({ maxPlayers: null, teams: teams.slice(0, n) });
  };
  const setTeam = (i: number, t: Partial<Team>) => {
    const teams = (value.teams ?? []).map((x, n) =>
      n === i ? { ...x, ...t } : x,
    );
    onChange({ ...value, teams });
  };

  return (
    <Box
      component="fieldset"
      sx={{
        border: 0,
        m: 0,
        p: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
      }}
    >
      <Mono
        component="legend"
        size={10}
        color={colors.textDim}
        spacing="0.16em"
        sx={{ mb: 1 }}
      >
        PLAYERS & TEAMS
      </Mono>
      <Box
        sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}
      >
        <Chip selected={count === 0} onClick={() => setCount(0)}>
          No teams
        </Chip>
        {[2, 3, 4].map((n) => (
          <Chip key={n} selected={count === n} onClick={() => setCount(n)}>
            {n}
          </Chip>
        ))}
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <InputBase
            type="number"
            inputProps={{
              min: 5,
              max: 12,
              "aria-label": "Number of teams (5 or more)",
            }}
            value={count >= 5 ? count : ""}
            placeholder="5+"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 5 && n <= 12) setCount(n);
            }}
            sx={{
              width: 58,
              px: 1,
              fontFamily: fonts.mono,
              border: `${count >= 5 ? 2 : 1}px solid ${count >= 5 ? colors.cyan : tint("cyan", 0.25)}`,
            }}
          />
          <Mono size={10} color={colors.textMuted} weight={500}>
            TEAMS
          </Mono>
        </Box>
      </Box>

      {count === 0 ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box component="span" sx={{ fontSize: 14, color: colors.text2 }}>
            Max players
          </Box>
          <Stepper
            value={value.maxPlayers ?? 4}
            min={1}
            max={64}
            label="max players"
            onChange={(maxPlayers) => onChange({ maxPlayers, teams: null })}
          />
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {(value.teams ?? []).map((t, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 4,
                  alignSelf: "stretch",
                  backgroundColor: teamColor(i),
                }}
              />
              <InputBase
                value={t.name}
                placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]}
                inputProps={{
                  "aria-label": `Team ${i + 1} name`,
                  maxLength: 24,
                }}
                onChange={(e) => setTeam(i, { name: e.target.value })}
                sx={{
                  flex: 1,
                  px: 1,
                  py: "4px",
                  border: `1px solid ${tint("cyan", 0.25)}`,
                  fontSize: 14,
                }}
              />
              <Stepper
                value={t.size}
                min={1}
                max={32}
                label={`players in team ${i + 1}`}
                onChange={(size) => setTeam(i, { size })}
              />
            </Box>
          ))}
        </Box>
      )}
      <Mono size={10} color={colors.cyan} weight={500}>
        {summary(value).toUpperCase()}
      </Mono>
    </Box>
  );
}

/** The teams to send: placeholders fill blank names. */
export function teamsForSave(value: PlayersTeams): PlayersTeams {
  if (!value.teams?.length)
    return { maxPlayers: value.maxPlayers, teams: null };
  return {
    maxPlayers: null,
    teams: value.teams.map((t, i) => ({
      name: t.name.trim() || PLACEHOLDERS[i % PLACEHOLDERS.length],
      size: t.size,
    })),
  };
}

export default PlayersTeamsBlock;
