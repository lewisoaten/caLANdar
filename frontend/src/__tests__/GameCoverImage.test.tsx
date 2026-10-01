import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GameCoverImage from "../components/GameCoverImage";
import { UserContext } from "../UserProvider";
import { DEFAULT_EVENT_IMAGE } from "../utils/eventImage";
import { resetGameCoverCache, steamHeaderUrl } from "../utils/gameCover";

const HASHED =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3949040/abc/header.jpg";

function withToken(ui: React.ReactElement, token = "tkn") {
  return (
    <UserContext.Provider
      value={
        {
          email: "a@b.c",
          token,
          isSignedIn: true,
          isAdmin: false,
          userId: 1,
          signIn: vi.fn(),
          verifyEmail: vi.fn(),
          signOut: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
    >
      {ui}
    </UserContext.Provider>
  );
}

const imgs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img"));
const coverState = (container: HTMLElement) =>
  container.firstElementChild?.getAttribute("data-cover-state");

function respond(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("GameCoverImage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetGameCoverCache();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the legacy Steam header first, decoratively and lazily", () => {
    const { container } = render(
      withToken(<GameCoverImage appid={730} name="Counter-Strike 2" />),
    );
    const [img] = imgs(container);
    expect(img).toHaveAttribute("src", steamHeaderUrl(730));
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the server when the legacy header fails and uses its URL", async () => {
    fetchMock.mockReturnValue(respond(200, { headerUrl: HASHED }));
    const { container } = render(
      withToken(<GameCoverImage appid={3949040} name="RV There Yet?" />),
    );
    fireEvent.error(imgs(container)[0]);

    await waitFor(() =>
      expect(imgs(container)[0]).toHaveAttribute("src", HASHED),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/steam-game/3949040/cover");
    expect(init.headers.Authorization).toBe("Bearer tkn");
  });

  it("falls back to the default banner with the game's name", async () => {
    fetchMock.mockReturnValue(respond(200, { headerUrl: null }));
    const { container, getByTestId } = render(
      withToken(<GameCoverImage appid={3949040} name="RV There Yet?" />),
    );
    fireEvent.error(imgs(container)[0]);

    await waitFor(() => expect(coverState(container)).toBe("fallback"));
    expect(imgs(container)[0]).toHaveAttribute("src", DEFAULT_EVENT_IMAGE);
    expect(getByTestId("game-cover-caption")).toHaveTextContent(
      "RV There Yet?",
    );
    expect(getByTestId("game-cover-caption")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("falls back when the server's URL fails to load too", async () => {
    fetchMock.mockReturnValue(respond(200, { headerUrl: HASHED }));
    const { container } = render(
      withToken(<GameCoverImage appid={1} name="Game" />),
    );
    fireEvent.error(imgs(container)[0]);
    await waitFor(() =>
      expect(imgs(container)[0]).toHaveAttribute("src", HASHED),
    );
    fireEvent.error(imgs(container)[0]);
    expect(coverState(container)).toBe("fallback");
    expect(imgs(container)[0]).toHaveAttribute("src", DEFAULT_EVENT_IMAGE);
  });

  it("falls back on server errors", async () => {
    fetchMock.mockReturnValue(respond(502, { error: {} }));
    const { container } = render(
      withToken(<GameCoverImage appid={2} name="Game" />),
    );
    fireEvent.error(imgs(container)[0]);
    await waitFor(() => expect(coverState(container)).toBe("fallback"));
  });

  it("ignores a 401 without signing out, and retries later", async () => {
    const signOut = vi.fn();
    fetchMock.mockReturnValueOnce(respond(401, {}));
    const ctx = {
      token: "stale",
      signOut,
    };
    const { container, unmount } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <UserContext.Provider value={ctx as any}>
        <GameCoverImage appid={3} name="Game" />
      </UserContext.Provider>,
    );
    fireEvent.error(imgs(container)[0]);
    await waitFor(() => expect(coverState(container)).toBe("fallback"));
    expect(signOut).not.toHaveBeenCalled();
    unmount();

    // Not remembered: the next mount asks again (and skips the dead legacy URL).
    fetchMock.mockReturnValueOnce(respond(200, { headerUrl: HASHED }));
    const again = render(withToken(<GameCoverImage appid={3} name="Game" />));
    await waitFor(() =>
      expect(imgs(again.container)[0]).toHaveAttribute("src", HASHED),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks the server once for many covers of the same game", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const { container } = render(
      withToken(
        <>
          {Array.from({ length: 20 }, (_, i) => (
            <GameCoverImage key={i} appid={4} name="Game" />
          ))}
        </>,
      ),
    );
    imgs(container).forEach((img) => fireEvent.error(img));
    await act(async () => {
      release(
        new Response(JSON.stringify({ headerUrl: HASHED }), { status: 200 }),
      );
    });
    await waitFor(() =>
      expect(
        imgs(container).every((i) => i.getAttribute("src") === HASHED),
      ).toBe(true),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A later mount uses the cached answer straight away.
    const later = render(withToken(<GameCoverImage appid={4} name="Game" />));
    expect(imgs(later.container)[0]).toHaveAttribute("src", HASHED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores non-https URLs from the server", async () => {
    fetchMock.mockReturnValue(
      respond(200, { headerUrl: "javascript:alert(1)" }),
    );
    const { container } = render(
      withToken(<GameCoverImage appid={5} name="Game" />),
    );
    fireEvent.error(imgs(container)[0]);
    await waitFor(() => expect(coverState(container)).toBe("fallback"));
  });

  it("never shows a broken image when the default banner fails", async () => {
    fetchMock.mockReturnValue(respond(200, { headerUrl: null }));
    const { container, getByTestId } = render(
      withToken(<GameCoverImage appid={6} name="Game" />),
    );
    fireEvent.error(imgs(container)[0]);
    await waitFor(() => expect(coverState(container)).toBe("fallback"));
    fireEvent.error(imgs(container)[0]);
    expect(imgs(container)).toHaveLength(0);
    expect(getByTestId("game-cover-caption")).toHaveTextContent("Game");
  });

  it("keeps a fixed box: explicit size or Steam's header ratio", () => {
    const sized = render(
      withToken(<GameCoverImage appid={7} width={76} height={35} />),
    );
    const box = sized.container.firstElementChild as HTMLElement;
    expect(getComputedStyle(box).width).toBe("76px");
    expect(getComputedStyle(box).height).toBe("35px");

    const ratio = render(withToken(<GameCoverImage appid={8} />));
    expect(
      getComputedStyle(ratio.container.firstElementChild as HTMLElement)
        .aspectRatio,
    ).toMatch(/^460 ?\/ ?215$/);
  });

  it("does not ask the server when signed out", async () => {
    const { container } = render(
      withToken(<GameCoverImage appid={9} name="Game" />, ""),
    );
    fireEvent.error(imgs(container)[0]);
    await waitFor(() => expect(coverState(container)).toBe("fallback"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
