import { describe, test, expect } from "vitest";
import { render, screen } from "../test/test-utils";
import GamesList from "../components/GamesList";
import { EventGame } from "../types/game_suggestions";
import moment from "moment";

// Mock game data
const createMockGame = (appid: number, name: string): EventGame => ({
  appid,
  name,
  gamerOwned: [],
  playtimeForever: 0,
  lastModified: moment(),
});

const mockGames = new Map<number, EventGame[]>([
  [
    1,
    [
      createMockGame(1, "Game 1"),
      createMockGame(2, "Game 2"),
      createMockGame(3, "Game 3"),
    ],
  ],
]);

const mockLoadNewPage = () => {};

describe("GamesList", () => {
  test("shows ownership text by default", () => {
    render(
      <GamesList
        loadNewPage={mockLoadNewPage}
        games={mockGames}
        gamesCount={1}
        loading={false}
      />,
    );

    // Should show "Owned by 1 Gamers" text
    expect(screen.getByText("Owned by 1 Gamers")).toBeInTheDocument();
  });

  test("hides ownership text when showOwnership is false", () => {
    render(
      <GamesList
        loadNewPage={mockLoadNewPage}
        games={mockGames}
        gamesCount={1}
        loading={false}
        showOwnership={false}
      />,
    );

    // Should not show "Owned by 1 Gamers" text
    expect(screen.queryByText("Owned by 1 Gamers")).not.toBeInTheDocument();
  });

  test("shows ownership text when showOwnership is true", () => {
    render(
      <GamesList
        loadNewPage={mockLoadNewPage}
        games={mockGames}
        gamesCount={1}
        loading={false}
        showOwnership={true}
      />,
    );

    // Should show "Owned by 1 Gamers" text
    expect(screen.getByText("Owned by 1 Gamers")).toBeInTheDocument();
  });

  test("renders games correctly regardless of showOwnership setting", () => {
    const { rerender } = render(
      <GamesList
        loadNewPage={mockLoadNewPage}
        games={mockGames}
        gamesCount={1}
        loading={false}
        showOwnership={false}
      />,
    );

    // Games should still be rendered
    expect(screen.getByText("Game 1")).toBeInTheDocument();
    expect(screen.getByText("Game 2")).toBeInTheDocument();
    expect(screen.getByText("Game 3")).toBeInTheDocument();

    // Rerender with showOwnership true
    rerender(
      <GamesList
        loadNewPage={mockLoadNewPage}
        games={mockGames}
        gamesCount={1}
        loading={false}
        showOwnership={true}
      />,
    );

    // Games should still be rendered
    expect(screen.getByText("Game 1")).toBeInTheDocument();
    expect(screen.getByText("Game 2")).toBeInTheDocument();
    expect(screen.getByText("Game 3")).toBeInTheDocument();
  });
});
