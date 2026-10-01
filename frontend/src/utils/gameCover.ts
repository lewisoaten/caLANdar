/**
 * Where a game's Steam header art lives.
 *
 * Most games have it at the legacy CDN path. Newer games (e.g. RV There
 * Yet?) only have a hashed path that the store API knows, so when the
 * legacy image fails we ask our API, which looks it up and caches it.
 * Results are kept for the session so a page of 20 cards asks once per game.
 */

/** Legacy Steam header image URL for an appid. */
export const steamHeaderUrl = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

/** Appids whose legacy header image failed to load this session. */
const legacyFailed = new Set<number>();
/** Settled server answers: a cover URL, or `null` for "use the fallback". */
const resolved = new Map<number, string | null>();
/** Lookups in flight, shared by every cover showing the same game. */
const inflight = new Map<number, Promise<string | null>>();

export function markLegacyHeaderFailed(appid: number) {
  legacyFailed.add(appid);
}

export function legacyHeaderFailed(appid: number) {
  return legacyFailed.has(appid);
}

/** Settled answer for `appid`: a URL, `null`, or `undefined` if unknown. */
export function resolvedCover(appid: number): string | null | undefined {
  return resolved.get(appid);
}

/** Remember that the server's URL for `appid` failed to load too. */
export function markResolvedCoverFailed(appid: number) {
  resolved.set(appid, null);
}

/** Only https URLs from our API are used as image sources. */
function usableUrl(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://")
    ? value
    : null;
}

/**
 * Ask the API where `appid`'s header image is. Never rejects: any failure
 * means "no cover". A 401 is not remembered (and doesn't sign the user out:
 * a missing cover is not worth interrupting them for), so it is retried
 * once they are signed in again.
 */
export function resolveCover(
  appid: number,
  token: string,
): Promise<string | null> {
  const settled = resolved.get(appid);
  if (settled !== undefined) return Promise.resolve(settled);
  const pending = inflight.get(appid);
  if (pending) return pending;
  if (!token) return Promise.resolve(null);

  const lookup = fetch(`/api/steam-game/${appid}/cover`, {
    headers: { Accept: "application/json", Authorization: "Bearer " + token },
  })
    .then(async (response) => {
      if (response.status === 401) return { url: null, remember: false };
      if (!response.ok) return { url: null, remember: true };
      const body = (await response.json()) as { headerUrl?: unknown };
      return { url: usableUrl(body?.headerUrl), remember: true };
    })
    .catch(() => ({ url: null, remember: true }))
    .then(({ url, remember }) => {
      inflight.delete(appid);
      if (remember) resolved.set(appid, url);
      return url;
    });
  inflight.set(appid, lookup);
  return lookup;
}

/** Forget everything (tests only). */
export function resetGameCoverCache() {
  legacyFailed.clear();
  resolved.clear();
  inflight.clear();
}
