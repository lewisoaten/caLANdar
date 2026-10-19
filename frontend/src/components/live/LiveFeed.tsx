/**
 * The feed (README §1d): open votes pinned first (rendered by the caller),
 * then the history as a vertical timeline in four tiers: T1 results, T2
 * lobby events, T3 actions and T4 presence, newest first, with day breaks.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import { Panel } from "../hl/Panel";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LiveLogEntry } from "../../live/types";
import { clock, gameColor, personFor } from "../../live/selectors";
import { AvatarRow, Cover, Mono } from "./liveUi";

const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const RESULT_COLORS: Record<string, string> = {
  unanimous: colors.lime,
  backed: colors.lime,
  admin_pick: colors.amber,
  admin_split: colors.amber,
  everyone_split: colors.violetLight,
  deadline: colors.cyan,
  vetoed: colors.pink,
};

/** Accent for an entry. */
export function entryColor(row: LiveLogEntry): string {
  const p = row.payload ?? {};
  if (row.kind === "toast.admin" || p.admin) return colors.amber;
  if (row.tier === 1) return RESULT_COLORS[p.resolution] ?? colors.cyan;
  if (p.lobbyKind === "food") return colors.violetLight;
  if (p.gameId) return gameColor({ gameId: p.gameId, kind: "game" });
  return colors.textMuted;
}

/** `ProGamer123 moved` + object, the T3 sentence parts. */
export function entrySentence(row: LiveLogEntry): {
  who: string;
  verb: string;
  object: string | null;
} {
  const p = row.payload ?? {};
  if (row.kind === "toast.admin")
    return { who: "Admin", verb: "posted", object: p.text ?? "" };
  const who = p.admin && !p.actorName ? "Admin" : (p.actorName ?? "Someone");
  let verb: string = p.text ?? p.type ?? "";
  if (p.type === "lobby.moved" && p.start)
    verb = `${verb} to ${clock(p.start)}`;
  return {
    who: p.admin ? `${who} (admin)` : who,
    verb,
    object: p.name ?? null,
  };
}

function ResultCard({ row, state }: { row: LiveLogEntry; state: LiveState }) {
  const p = row.payload ?? {};
  const c = entryColor(row);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any[] = p.options ?? [];
  return (
    <Box
      sx={{ border: `2px solid ${c}`, backgroundColor: colors.surfaceSolid }}
    >
      <Box
        sx={{
          position: "relative",
          minHeight: 76,
          p: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          justifyContent: "flex-end",
          backgroundImage: p.gameId
            ? `linear-gradient(90deg, ${colors.surfaceSolid} 30%, rgba(11,14,22,0.4)), url("https://cdn.cloudflare.steamstatic.com/steam/apps/${p.gameId}/header.jpg")`
            : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Mono
            size={10}
            color={colors.ink}
            sx={{ backgroundColor: c, px: "6px", py: "1px" }}
          >
            {p.badge ?? "FINAL"}
          </Mono>
          {p.voteType && (
            <Mono size={10} color={colors.textMuted}>
              {String(p.voteType).toUpperCase()}
            </Mono>
          )}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 20,
            fontWeight: 700,
            textTransform: "uppercase",
            color: colors.text,
          }}
        >
          {p.title ?? p.name}
        </Box>
      </Box>
      {options.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {options.map((o) => (
            <Box
              key={o.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: "6px 12px",
                borderTop: `1px solid ${tint("cyan", 0.08)}`,
                opacity:
                  o.id === p.winnerOptionId || (p.winners ?? []).includes(o.id)
                    ? 1
                    : 0.55,
              }}
            >
              <Box
                component="span"
                sx={{ width: 14, color: colors.lime, fontWeight: 700 }}
              >
                {o.id === p.winnerOptionId || (p.winners ?? []).includes(o.id)
                  ? "✓"
                  : ""}
              </Box>
              <Box
                component="span"
                sx={{ flex: 1, fontSize: 13, color: colors.text }}
              >
                {o.name}
              </Box>
              <AvatarRow
                people={(o.voters ?? []).map((pid: string) =>
                  personFor(state, pid),
                )}
                size={18}
                me={state.me}
              />
            </Box>
          ))}
        </Box>
      )}
      {p.actorName && (
        <Mono
          size={10}
          color={colors.textMuted}
          weight={500}
          sx={{ display: "block", p: "6px 12px" }}
        >
          CALLED BY {String(p.actorName).toUpperCase()}
        </Mono>
      )}
    </Box>
  );
}

function LobbyCard({ row, state }: { row: LiveLogEntry; state: LiveState }) {
  const p = row.payload ?? {};
  const c = entryColor(row);
  return (
    <Box
      sx={{
        display: "flex",
        border: `1px solid ${tint("cyan", 0.16)}`,
        backgroundColor: colors.surfaceSolid,
      }}
    >
      <Box sx={{ width: 4, flex: "none", backgroundColor: c }} />
      <Cover
        gameId={p.gameId ?? null}
        kind={p.lobbyKind ?? "game"}
        width={104}
        height="auto"
        sx={{ minHeight: 56 }}
      />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          p: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <Mono size={9} color={c} spacing="0.14em">
          {String(p.kicker ?? p.text ?? "").toUpperCase()}
        </Mono>
        <Box
          component="span"
          sx={{
            fontSize: 15,
            fontWeight: 700,
            textTransform: "uppercase",
            color: colors.text,
          }}
        >
          {p.title ?? p.name}
        </Box>
        {p.sub && (
          <Mono size={10} color={colors.textMuted} weight={500}>
            {p.sub}
          </Mono>
        )}
        {(p.people ?? []).length > 0 && (
          <AvatarRow
            people={(p.people as string[]).map((pid) => personFor(state, pid))}
            size={20}
            me={state.me}
          />
        )}
      </Box>
    </Box>
  );
}

function ActionLine({ row, state }: { row: LiveLogEntry; state: LiveState }) {
  const p = row.payload ?? {};
  const actor = personFor(state, p.actor);
  const { who, verb, object } = entrySentence(row);
  const c = entryColor(row);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        minHeight: 28,
      }}
    >
      {actor ? (
        <UserAvatar name={actor.handle} src={actor.avatarUrl} size={20} />
      ) : (
        <Box
          sx={{ width: 20, height: 20, backgroundColor: tint("amber", 0.3) }}
        />
      )}
      <Box component="span" sx={{ fontSize: 13, color: colors.text2 }}>
        <Box component="strong" sx={{ color: colors.text }}>
          {who}
        </Box>{" "}
        {verb}
      </Box>
      {object && (
        <Mono
          size={10}
          color={c}
          sx={{ border: `1px solid ${c}`, px: "5px", whiteSpace: "normal" }}
        >
          {object}
        </Mono>
      )}
    </Box>
  );
}

function PresenceLine({ row, state }: { row: LiveLogEntry; state: LiveState }) {
  const p = row.payload ?? {};
  const actor = personFor(state, p.actor);
  const { who, verb, object } = entrySentence(row);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        opacity: 0.85,
        color: "#8a94b0",
        fontSize: 12,
      }}
    >
      {actor && (
        <UserAvatar name={actor.handle} src={actor.avatarUrl} size={16} />
      )}
      <span>
        {who} {verb}
        {object ? ` ${object}` : ""}
      </span>
    </Box>
  );
}

const NODE = { 1: 14, 2: 10, 3: 7, 4: 5 } as Record<number, number>;

export function HistoryRail({
  state,
  rows,
}: {
  state: LiveState;
  rows: LiveLogEntry[];
}) {
  const items: React.ReactNode[] = [];
  let lastDay = "";
  for (const row of rows) {
    const d = new Date(Date.parse(row.at));
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (day !== lastDay) {
      lastDay = day;
      items.push(
        <Box
          key={`day-${day}`}
          sx={{ display: "flex", alignItems: "center", gap: 0, height: 30 }}
        >
          <Box sx={{ width: 56 }} />
          <Box sx={{ width: 33, display: "grid", placeItems: "center" }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                transform: "rotate(45deg)",
                backgroundColor: colors.cyan,
              }}
            />
          </Box>
          <Mono size={11} color={colors.cyan} spacing="0.22em">
            {DAY_NAMES[d.getDay()]}
          </Mono>
        </Box>,
      );
    }
    const tier = row.kind === "toast.admin" ? 3 : (row.tier ?? 4);
    const node = NODE[tier] ?? 5;
    const c = tier === 4 ? colors.textDim : entryColor(row);
    items.push(
      <Box
        key={row.seq}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          py: tier <= 2 ? 1 : 0.5,
        }}
      >
        <Mono
          size={10}
          color={colors.textDim}
          weight={500}
          sx={{
            width: 48,
            pr: 1,
            textAlign: "right",
            pt: "5px",
            boxSizing: "content-box",
          }}
        >
          {clock(row.at)}
        </Mono>
        <Box
          sx={{
            width: 33,
            flex: "none",
            display: "flex",
            justifyContent: "center",
            pt: tier <= 2 ? "8px" : "8px",
          }}
        >
          <Box
            sx={{
              width: node,
              height: node,
              borderRadius: "50%",
              backgroundColor: c,
              boxShadow: tier === 1 ? `0 0 10px ${c}` : "none",
              position: "relative",
              zIndex: 1,
            }}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {tier === 1 ? (
            <ResultCard row={row} state={state} />
          ) : tier === 2 ? (
            <LobbyCard row={row} state={state} />
          ) : tier === 3 ? (
            <ActionLine row={row} state={state} />
          ) : (
            <PresenceLine row={row} state={state} />
          )}
        </Box>
      </Box>,
    );
  }
  return (
    <Box sx={{ position: "relative" }}>
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 72,
          width: "1px",
          backgroundColor: tint("cyan", 0.35),
        }}
      />
      {items}
    </Box>
  );
}

export function LiveFeed({
  state,
  openVotes,
}: {
  state: LiveState;
  /** Open vote cards, pinned above the history (phase 3). */
  openVotes?: React.ReactNode;
}) {
  const rows = [...state.feed].reverse();
  return (
    <Panel kicker="Votes · actions · results" title="Feed" padding="compact">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {openVotes}
        {rows.length === 0 ? (
          <Box sx={{ color: colors.textMuted, fontSize: 14 }}>
            Nothing has happened yet. Check in when you arrive!
          </Box>
        ) : (
          <HistoryRail state={state} rows={rows} />
        )}
      </Box>
    </Panel>
  );
}

export default LiveFeed;
