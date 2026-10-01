/**
 * Client-side check of what the Account page accepts as a Steam account.
 * Mirrors `parse_steam_id_input` in `api/src/controllers/profile.rs`, so the
 * form only rejects what the server would reject (the server still resolves
 * vanity names and has the final say).
 */

export type SteamIdInput =
  { kind: "id"; steamId: string } | { kind: "vanity"; vanity: string };

export const STEAM_ID_HELP =
  "Enter a 17-digit SteamID64 or a steamcommunity.com/id/… or /profiles/… link.";

const isSteamId64 = (value: string) => /^\d{17}$/.test(value);

/** Parse a SteamID64 or a steamcommunity.com profile URL; `null` if invalid. */
export function parseSteamIdInput(input: string): SteamIdInput | null {
  const value = input.trim();
  if (isSteamId64(value)) return { kind: "id", steamId: value };

  let rest = value;
  const lower = value.toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (lower.startsWith(prefix)) {
      rest = value.slice(prefix.length);
      break;
    }
  }
  if (rest.toLowerCase().startsWith("www.")) rest = rest.slice(4);

  const host = rest.slice(0, 18);
  if (host.length < 18 || host.toLowerCase() !== "steamcommunity.com")
    return null;
  let path = rest.slice(18);
  if (!path.startsWith("/")) return null;
  path = path.slice(1);
  if (path.endsWith("/")) path = path.slice(0, -1);

  const slash = path.indexOf("/");
  if (slash < 0) return null;
  const kind = path.slice(0, slash);
  const segment = path.slice(slash + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;

  if (kind === "profiles" && isSteamId64(segment))
    return { kind: "id", steamId: segment };
  if (kind === "id") return { kind: "vanity", vanity: segment };
  return null;
}

export const isValidSteamIdInput = (input: string) =>
  parseSteamIdInput(input) !== null;
