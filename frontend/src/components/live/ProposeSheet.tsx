/**
 * The propose / vote sheet (README §2): a right-hand drawer opened from
 * Call vote, "+ Add an option" or a lobby's actions.
 *
 * | mode    | what                                                    |
 * |---------|---------------------------------------------------------|
 * | game    | search (suggested first, then all of Steam) → players & teams → start → length |
 * | food    | name / free text → start → length                       |
 * | add     | the same picker; the start comes from the vote          |
 * | extend  | keep playing for +30m / +1h / +1h 30 / +2h              |
 * | delay   | delay by +15m / +30m / +45m / +1h                       |
 * | change  | start −30m / as now / +30m / +1h; length likewise       |
 * | kickoff | start the first lobby earlier                           |
 */
import * as React from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CloseSharp from "@mui/icons-material/CloseSharp";
import { UserContext } from "../../UserProvider";
import { colors, fonts, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView, VoteView } from "../../live/types";
import {
  activePrejoins,
  clock,
  currentMembers,
  lengthLabel,
  personFor,
  plannedEnd,
  visibleLobbies,
} from "../../live/selectors";
import { AvatarRow, Cover, Mono } from "./liveUi";
import {
  PlayersTeamsBlock,
  teamsForSave,
  type PlayersTeams,
} from "./PlayersTeamsBlock";
import type { LiveCommand } from "./LobbyActions";

export type SheetMode =
  "game" | "food" | "add" | "extend" | "delay" | "change" | "kickoff";

export interface SheetRequest {
  mode: SheetMode;
  lobby?: LobbyView | null;
  vote?: VoteView | null;
  /** Prefill the game (Propose again). */
  gameId?: number | null;
}

const MIN = 60_000;
const HALF_HOUR = 30 * MIN;

const TITLES: Record<SheetMode, [string, string]> = {
  game: ["NEW VOTE", "Propose a game"],
  food: ["NEW VOTE", "Propose food"],
  add: ["ADDING TO", "Add an option"],
  extend: ["NEW VOTE · PEOPLE IN THE LOBBY", "Keep playing"],
  delay: ["NEW VOTE · EVERYONE WHO'S IN FOR IT", "Delay start"],
  change: ["NEW VOTE · PEOPLE PRE-JOINED", "Change a lobby"],
  kickoff: ["NEW VOTE · EVERYONE AT THE START", "Kick off early"],
};

function Chip({
  selected,
  onClick,
  children,
  accent = colors.cyan,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <ButtonBase
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      sx={{
        px: "12px",
        py: "7px",
        fontFamily: fonts.mono,
        fontSize: 13,
        color: selected ? colors.text : colors.textMuted,
        border: `${selected ? 2 : 1}px solid ${selected ? accent : tint("cyan", 0.25)}`,
        backgroundColor: selected ? `${accent}1f` : "transparent",
        "&.Mui-disabled": { opacity: 0.4 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Mono size={10} color={colors.textDim} spacing="0.16em">
        {label}
      </Mono>
      {children}
    </Box>
  );
}

interface GameHit {
  gameId: number;
  name: string;
  suggested: boolean;
}

interface Knowledge {
  maxPlayers: number | null;
  teams: { name: string; size: number }[] | null;
  typical: { minutes: number; sessions: number };
  newGame: boolean;
}

function useGameSearch(eventId: number, q: string) {
  const { token } = useContext(UserContext);
  const [hits, setHits] = useState<GameHit[]>([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/events/${eventId}/live/games?q=${encodeURIComponent(q)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!cancelled) setHits(data);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId, q, token]);
  return hits;
}

function useKnowledge(gameId: number | null) {
  const { token } = useContext(UserContext);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  useEffect(() => {
    if (!gameId) return undefined;
    let cancelled = false;
    fetch(`/api/games/${gameId}/lobby-defaults`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setKnowledge(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gameId, token]);
  return gameId ? knowledge : null;
}

/** Start times on offer: now, then the next half hours. */
function startChoices(now: number, eventEnd: number): number[] {
  const first = Math.ceil((now + MIN) / HALF_HOUR) * HALF_HOUR;
  const out = [now];
  for (let t = first; t < eventEnd && out.length < 9; t += HALF_HOUR)
    out.push(t);
  return out;
}

interface PlaceHit {
  placeId: string;
  name: string;
  rating: number | null;
  address: string | null;
  photoUrl: string | null;
  distanceM: number | null;
}

/** Google Places results near the venue (README §2 food mode). */
function PlacesPicker({
  eventId,
  venue,
  picked,
  onPick,
}: {
  eventId: number;
  venue: string;
  picked: string | null;
  onPick: (p: PlaceHit) => void;
}) {
  const { token } = useContext(UserContext);
  const [q, setQ] = useState("pizza");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/events/${eventId}/live/places?q=${encodeURIComponent(q)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })
        .then((r) => (r.ok ? r.json() : { places: [] }))
        .then((data) => {
          if (!cancelled) setHits(data.places ?? []);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId, q, token]);
  return (
    <Field label={`NEAR ${venue.toUpperCase()}`}>
      <TextField
        size="small"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        slotProps={{
          htmlInput: { "aria-label": "Search food near the venue" },
        }}
      />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          maxHeight: 260,
          overflowY: "auto",
          border: `1px solid ${tint("violet", 0.3)}`,
        }}
      >
        {hits?.length === 0 && (
          <Box sx={{ p: 1.5, color: colors.textMuted, fontSize: 13 }}>
            Nothing found nearby.
          </Box>
        )}
        {(hits ?? []).map((p) => (
          <ButtonBase
            key={p.placeId}
            onClick={() => onPick(p)}
            aria-pressed={picked === p.placeId}
            sx={{
              display: "flex",
              gap: 1.25,
              alignItems: "center",
              justifyContent: "flex-start",
              p: "6px 8px",
              borderTop: `1px solid ${tint("violet", 0.12)}`,
              backgroundColor:
                picked === p.placeId ? tint("violet", 0.18) : "transparent",
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 64,
                height: 44,
                flex: "none",
                backgroundColor: tint("violet", 0.15),
                backgroundImage: p.photoUrl ? `url("${p.photoUrl}")` : "none",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <Box sx={{ fontSize: 14, color: colors.text, fontWeight: 700 }}>
                {p.name}
              </Box>
              <Mono
                size={10}
                color={colors.textMuted}
                weight={500}
                sx={{ whiteSpace: "normal" }}
              >
                {p.rating != null ? `★ ${p.rating.toFixed(1)} · ` : ""}
                {p.distanceM != null
                  ? p.distanceM < 1000
                    ? `${Math.round(p.distanceM)} M`
                    : `${(p.distanceM / 1000).toFixed(1)} KM`
                  : ""}
                {p.address ? ` · ${p.address}` : ""}
              </Mono>
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Field>
  );
}

function LobbyHeader({ lobby, tone }: { lobby: LobbyView; tone: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        alignItems: "center",
        p: "8px",
        border: `1px solid ${tone}`,
        backgroundColor: `${tone}14`,
      }}
    >
      <Cover gameId={lobby.gameId} kind={lobby.kind} width={84} height={40} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontWeight: 700, fontSize: 15, color: colors.text }}>
          {lobby.name}
        </Box>
        <Mono size={10} color={colors.textMuted} weight={500}>
          {clock(lobby.start)}–{clock(plannedEnd(lobby))} ·{" "}
          {lengthLabel(lobby.minutes)}
        </Mono>
      </Box>
    </Box>
  );
}

export function ProposeSheet(props: {
  request: SheetRequest | null;
  state: LiveState;
  now: number;
  busy?: boolean;
  command: LiveCommand;
  onClose: () => void;
}) {
  const { request } = props;
  // A fresh body per request: its state starts from the request.
  const requestKey = request
    ? `${request.mode}:${request.lobby?.id}:${request.vote?.id}:${request.gameId}`
    : "closed";
  return <SheetBody key={requestKey} {...props} />;
}

function SheetBody({
  request,
  state,
  now,
  busy,
  command,
  onClose,
}: {
  request: SheetRequest | null;
  state: LiveState;
  now: number;
  busy?: boolean;
  command: LiveCommand;
  onClose: () => void;
}) {
  const open = request != null;
  const fromLobby =
    request?.lobby != null &&
    (request.mode === "game" || request.mode === "food");
  const [mode, setMode] = useState<SheetMode>(request?.mode ?? "game");
  const [query, setQuery] = useState("");
  // Propose again: start from the game played.
  const [game, setGame] = useState<GameHit | null>(() => {
    if (!request?.gameId) return null;
    const played = Object.values(state.lobbies).find(
      (l) => l.gameId === request.gameId,
    );
    return played
      ? { gameId: request.gameId, name: played.name, suggested: false }
      : null;
  });
  const [foodName, setFoodName] = useState("");
  const [foodNote, setFoodNote] = useState("");
  // From a lobby: propose something else for its slot.
  const [start, setStart] = useState(() =>
    fromLobby && request?.lobby
      ? Math.max(Date.now(), Date.parse(request.lobby.start))
      : Date.now(),
  );
  const [minutes, setMinutes] = useState<number | null>(null);
  const [edited, setPlayers] = useState<PlayersTeams | null>(null);
  const [delta, setDelta] = useState(request?.mode === "delay" ? 15 : 60);
  const [startDelta, setStartDelta] = useState(0);
  const [lengthDelta, setLengthDelta] = useState(0);
  const [asOption, setAsOption] = useState<boolean | null>(
    fromLobby ? true : null,
  );
  const [addKind, setAddKind] = useState<"game" | "food">("game");
  const [place, setPlace] = useState<PlaceHit | null>(null);

  const eventId = state.eventId;
  const pickingGame = mode === "game" || (mode === "add" && addKind === "game");
  const pickingFood = mode === "food" || (mode === "add" && addKind === "food");
  const hits = useGameSearch(eventId, open && pickingGame ? query : "");
  const knowledge = useKnowledge(game?.gameId ?? null);
  // Saved players and teams pre-fill the block until you change them.
  const players: PlayersTeams =
    edited ??
    (knowledge
      ? {
          maxPlayers: knowledge.maxPlayers ?? (knowledge.teams ? null : 4),
          teams: knowledge.teams,
        }
      : { maxPlayers: 4, teams: null });

  const lobby = request?.lobby ?? null;
  const vote = request?.vote ?? null;
  const [kicker, title] = TITLES[mode];
  const eventEnd = state.event
    ? Date.parse(state.event.timeEnd)
    : now + 48 * 3600e3;
  // The typical length pre-selects until you pick one (§5.6).
  const length = minutes ?? knowledge?.typical.minutes ?? 120;

  // Does the chosen time overlap a planned lobby? Then offer to challenge it.
  const clash = useMemo(() => {
    if (mode !== "game" && mode !== "food") return null;
    const end = start + length * MIN;
    return (
      visibleLobbies(state).find(
        (l) =>
          (l.status === "planned" || l.status === "confirmed") &&
          Date.parse(l.start) < end &&
          start < plannedEnd(l),
      ) ?? null
    );
  }, [mode, start, length, state]);
  // Overlapping a plan adds an option to its vote unless "Run alongside"
  // is picked explicitly.
  const challenging = clash != null && asOption !== false;

  const whoVotes =
    lobby && (mode === "extend" || mode === "delay" || mode === "change")
      ? [
          ...new Set([
            ...currentMembers(lobby).map((m) => m.pid),
            ...(mode === "extend"
              ? []
              : activePrejoins(lobby).map((p) => p.pid)),
          ]),
        ]
      : [];

  const submit = async () => {
    let ok: unknown = null;
    const what = pickingFood
      ? {
          kind: "food",
          food: {
            name: foodName.trim(),
            freeText: foodNote.trim() || null,
            ...(place && place.name === foodName.trim()
              ? {
                  placeId: place.placeId,
                  photoUrl: place.photoUrl,
                  rating: place.rating,
                  address: place.address,
                }
              : {}),
          },
        }
      : { kind: "game", gameId: game?.gameId, ...teamsForSave(players) };
    switch (mode) {
      case "game":
      case "food":
        ok = await command("/lobbies", {
          ...what,
          start: new Date(start).toISOString(),
          durationMin: length,
          mode: challenging ? "option" : "alongside",
          lobbyId: challenging ? clash?.id : undefined,
        });
        break;
      case "add":
        ok = await command(`/votes/${vote?.id}/options`, {
          ...what,
          durationMin: length,
        });
        break;
      case "extend":
        ok = await command("/votes", {
          type: "extend",
          lobbyId: lobby?.id,
          minutes: delta,
        });
        break;
      case "delay":
        ok = await command("/votes", {
          type: "delay",
          lobbyId: lobby?.id,
          minutes: delta,
        });
        break;
      case "change":
        ok = await command("/votes", {
          type: "change",
          lobbyId: lobby?.id,
          startDelta,
          minutesDelta: lengthDelta,
        });
        break;
      case "kickoff":
        ok = await command("/votes", {
          type: "kickoff",
          lobbyId: lobby?.id,
          newStart: new Date(
            Date.parse(lobby?.start ?? "") - delta * MIN,
          ).toISOString(),
        });
        break;
    }
    if (ok) onClose();
  };

  const picker = pickingGame && (
    <>
      <Field label="GAME">
        <TextField
          size="small"
          placeholder="Search games (suggested first)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Search games" } }}
        />
        <Box
          role="listbox"
          aria-label="Games"
          sx={{
            display: "flex",
            flexDirection: "column",
            maxHeight: 220,
            overflowY: "auto",
            border: `1px solid ${tint("cyan", 0.12)}`,
          }}
        >
          {hits.length === 0 && (
            <Box sx={{ p: 1.5, color: colors.textMuted, fontSize: 13 }}>
              {query.length < 2
                ? "Type to search all of Steam"
                : "No games found"}
            </Box>
          )}
          {hits.map((h) => (
            <ButtonBase
              key={h.gameId}
              role="option"
              aria-selected={game?.gameId === h.gameId}
              onClick={() => {
                setGame(h);
                setMinutes(null);
                setPlayers(null);
              }}
              sx={{
                display: "flex",
                gap: 1.25,
                alignItems: "center",
                justifyContent: "flex-start",
                p: "6px 8px",
                borderTop: `1px solid ${tint("cyan", 0.06)}`,
                backgroundColor:
                  game?.gameId === h.gameId
                    ? tint("cyan", 0.12)
                    : "transparent",
              }}
            >
              <Cover gameId={h.gameId} kind="game" width={64} height={30} />
              <Box
                component="span"
                sx={{
                  flex: 1,
                  textAlign: "left",
                  fontSize: 14,
                  color: colors.text,
                }}
              >
                {h.name}
              </Box>
              {h.suggested && (
                <Mono size={9} color={colors.violetText}>
                  SUGGESTED
                </Mono>
              )}
            </ButtonBase>
          ))}
        </Box>
      </Field>
      {game && (
        <Box sx={{ p: "10px 12px", border: `1px solid ${tint("cyan", 0.2)}` }}>
          {knowledge?.newGame && (
            <Mono
              size={10}
              color={colors.cyan}
              sx={{ display: "block", mb: 1, whiteSpace: "normal" }}
            >
              NEW HERE · SET IT UP ONCE, SAVED FOR EVERYONE
            </Mono>
          )}
          <PlayersTeamsBlock value={players} onChange={setPlayers} />
        </Box>
      )}
    </>
  );

  const food = pickingFood && (
    <>
      {state.event?.placesEnabled && (
        <PlacesPicker
          eventId={eventId}
          venue={state.event.venueName ?? "the venue"}
          picked={place?.placeId ?? null}
          onPick={(p) => {
            setPlace(p);
            setFoodName(p.name);
          }}
        />
      )}
      <Field label="WHAT">
        <TextField
          size="small"
          placeholder="Pizza from Mario's"
          value={foodName}
          onChange={(e) => setFoodName(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Food", maxLength: 80 } }}
        />
        <TextField
          size="small"
          placeholder="Details: walk into town for take-out, order by 19:30…"
          value={foodNote}
          onChange={(e) => setFoodNote(e.target.value)}
          multiline
          minRows={2}
          slotProps={{ htmlInput: { "aria-label": "Details", maxLength: 280 } }}
        />
      </Field>
    </>
  );

  const startField = (mode === "game" || mode === "food") && (
    <Field label="START">
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {startChoices(now, eventEnd).map((t, i) => (
          <Chip
            key={t}
            selected={Math.abs(start - t) < MIN}
            onClick={() => setStart(t)}
          >
            {i === 0 ? "Now" : clock(t)}
          </Chip>
        ))}
      </Box>
    </Field>
  );

  const lengthField = (mode === "game" ||
    mode === "food" ||
    mode === "add") && (
    <Field label="LENGTH">
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {[30, 60, 90, 120, 180, 240].map((m) => (
          <Chip key={m} selected={length === m} onClick={() => setMinutes(m)}>
            {lengthLabel(m)}
          </Chip>
        ))}
      </Box>
      {knowledge && (
        <Mono size={10} color={colors.textMuted} weight={500}>
          {knowledge.typical.sessions >= 2
            ? `TYPICALLY ${lengthLabel(knowledge.typical.minutes)} · ${knowledge.typical.sessions} SESSIONS`
            : `USUALLY PLANNED FOR ${lengthLabel(knowledge.typical.minutes)}`}
        </Mono>
      )}
      {mode === "food" && (
        <Mono size={10} color={colors.textMuted} weight={500}>
          EATING TIME COUNTS AS BUSY
        </Mono>
      )}
    </Field>
  );

  const deltas =
    mode === "extend"
      ? [30, 60, 90, 120]
      : mode === "delay"
        ? [15, 30, 45, 60]
        : mode === "kickoff"
          ? [30, 60, 120]
          : [];

  const cta = (() => {
    switch (mode) {
      case "game":
      case "food":
        return challenging
          ? `Add as an option · ${clock(Date.parse(clash?.start ?? ""))}`
          : `Propose · start at ${clock(start)}`;
      case "add":
        return "Add option";
      case "extend":
        return `Call vote · keep playing +${lengthLabel(delta)}`;
      case "delay":
        return `Call vote · start at ${lobby ? clock(Date.parse(lobby.start) + delta * MIN) : ""}`;
      case "change":
        return `Call vote · ${lobby ? `${clock(Date.parse(lobby.start) + startDelta * MIN)} · ${lengthLabel(lobby.minutes + lengthDelta)}` : ""}`;
      case "kickoff":
        return `Call vote · start at ${lobby ? clock(Date.parse(lobby.start) - delta * MIN) : ""}`;
    }
  })();

  const valid = pickingFood
    ? foodName.trim().length > 0
    : pickingGame
      ? game != null
      : mode === "change"
        ? startDelta !== 0 || lengthDelta !== 0
        : lobby != null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-label": title,
          sx: {
            width: "min(560px, 100%)",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          p: "18px 20px",
          borderBottom: `1px solid ${tint("cyan", 0.14)}`,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Mono
            size={10}
            color={colors.cyan}
            spacing="0.16em"
            sx={{ whiteSpace: "normal" }}
          >
            {mode === "add" && vote
              ? `ADDING TO · ${vote.title.toUpperCase()}`
              : kicker}
          </Mono>
          <Box
            component="h2"
            sx={{
              m: 0,
              mt: "4px",
              fontSize: 24,
              fontWeight: 700,
              textTransform: "uppercase",
              color: colors.text,
            }}
          >
            {title}
          </Box>
        </Box>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ color: colors.text }}
        >
          <CloseSharp />
        </IconButton>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 2.25,
        }}
      >
        {(mode === "game" || mode === "food" || mode === "add") && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Chip
              selected={pickingGame}
              onClick={() =>
                mode === "add" ? setAddKind("game") : setMode("game")
              }
            >
              Game
            </Chip>
            <Chip
              selected={pickingFood}
              onClick={() =>
                mode === "add" ? setAddKind("food") : setMode("food")
              }
              accent={colors.violetLight}
            >
              Food
            </Chip>
          </Box>
        )}
        {lobby &&
          (mode === "extend" ||
            mode === "delay" ||
            mode === "change" ||
            mode === "kickoff") && (
            <LobbyHeader
              lobby={lobby}
              tone={mode === "delay" ? colors.pink : colors.cyan}
            />
          )}
        {picker}
        {food}
        {mode === "add" && vote?.slotStart && (
          <Field label="START">
            <Mono size={13} color={colors.text} weight={500}>
              {clock(vote.slotStart)} · FROM THE VOTE
            </Mono>
          </Field>
        )}
        {startField}
        {lengthField}
        {deltas.length > 0 && (
          <Field
            label={
              mode === "extend"
                ? "KEEP PLAYING FOR"
                : mode === "delay"
                  ? "DELAY BY"
                  : "START EARLIER BY"
            }
          >
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {deltas.map((d) => (
                <Chip
                  key={d}
                  selected={delta === d}
                  onClick={() => setDelta(d)}
                  accent={mode === "delay" ? colors.pink : colors.cyan}
                  disabled={
                    mode === "kickoff" &&
                    lobby != null &&
                    state.event != null &&
                    Date.parse(lobby.start) - d * MIN <
                      Date.parse(state.event.timeBegin)
                  }
                >
                  {mode === "kickoff" ? "-" : "+"}
                  {lengthLabel(d)}
                </Chip>
              ))}
            </Box>
          </Field>
        )}
        {mode === "change" && lobby && (
          <>
            <Field label="START">
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {[-30, 0, 30, 60].map((d) => (
                  <Chip
                    key={d}
                    selected={startDelta === d}
                    onClick={() => setStartDelta(d)}
                  >
                    {d === 0
                      ? "As now"
                      : `${d > 0 ? "+" : "−"}${lengthLabel(Math.abs(d))}`}
                  </Chip>
                ))}
              </Box>
            </Field>
            <Field label="LENGTH">
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {[0, -30, 30, 60].map((d) => (
                  <Chip
                    key={d}
                    selected={lengthDelta === d}
                    onClick={() => setLengthDelta(d)}
                    disabled={lobby.minutes + d < 15}
                  >
                    {d === 0
                      ? "As now"
                      : `${d > 0 ? "+" : "−"}${lengthLabel(Math.abs(d))}`}
                  </Chip>
                ))}
              </Box>
            </Field>
          </>
        )}
      </Box>

      <Box
        sx={{
          p: "14px 20px",
          borderTop: `1px solid ${tint("cyan", 0.14)}`,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {clash && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Mono
              size={10}
              color={colors.textMuted}
              weight={500}
              sx={{ whiteSpace: "normal" }}
            >
              {clash.name.toUpperCase()} IS PLANNED THEN
            </Mono>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Chip
                selected={asOption !== false}
                onClick={() => setAsOption(true)}
              >
                Add as an option to What&apos;s on at {clock(clash.start)}?
              </Chip>
              <Chip
                selected={asOption === false}
                onClick={() => setAsOption(false)}
                accent={colors.violetLight}
              >
                Run alongside
              </Chip>
            </Box>
          </Box>
        )}
        {whoVotes.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Mono size={10} color={colors.textMuted}>
              WHO VOTES
            </Mono>
            <AvatarRow
              people={whoVotes.map((pid) => personFor(state, pid))}
              size={22}
              max={10}
              me={state.me}
            />
          </Box>
        )}
        <Button
          variant="contained"
          size="large"
          disabled={!valid || busy}
          onClick={() => void submit()}
        >
          {cta}
        </Button>
      </Box>
    </Drawer>
  );
}

export default ProposeSheet;
