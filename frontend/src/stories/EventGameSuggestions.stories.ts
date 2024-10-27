import type { Meta, StoryObj } from "@storybook/react";
import { http, HttpResponse } from "msw";

import EventGameSuggestions from "../components/EventGameSuggestions";
import {
  Game,
  GameSuggestion,
  GameVote,
  defaultGamer,
  defaultGame,
  defaultGameSuggestion,
} from "../types/game_suggestions";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: "Example/EventGameSuggestions",
  component: EventGameSuggestions,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: "centered",
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ["autodocs"],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    event_id: { control: "number" },
    responded: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof EventGameSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

// 👇 The mocked data that will be used in the story
const games: GameSuggestion[] = [
  {
    ...defaultGameSuggestion,
    appid: 1,
    name: "Game 1",
    selfVote: GameVote.yes,
    gamerOwned: [
      {
        ...defaultGamer,
        handle: "Gamer 1",
      },
      {
        ...defaultGamer,
        handle: "Gamer 2",
      },
    ],
    gamerUnowned: [
      {
        ...defaultGamer,
        handle: "Gamer 3",
      },
      {
        ...defaultGamer,
        handle: "Gamer 4",
      },
    ],
    gamerUnknown: [
      {
        ...defaultGamer,
        handle: "Gamer 5",
      },
      {
        ...defaultGamer,
        handle: "Gamer 6",
      },
      {
        ...defaultGamer,
        handle: "Gamer 7",
      },
    ],
    votes: 3,
  },
  {
    ...defaultGameSuggestion,
    appid: 2,
    name: "Game 2",
    selfVote: GameVote.no,
    votes: 2,
    gamerOwned: [
      {
        ...defaultGamer,
        handle: "Gamer 1",
      },
      {
        ...defaultGamer,
        handle: "Gamer 2",
      },
      {
        ...defaultGamer,
        handle: "Gamer 3",
      },
      {
        ...defaultGamer,
        handle: "Gamer 4",
      },
      {
        ...defaultGamer,
        handle: "Gamer 5",
      },
      {
        ...defaultGamer,
        handle: "Gamer 6",
      },
      {
        ...defaultGamer,
        handle: "Gamer 7",
      },
    ],
  },
];

const gameSearchResult: Game[] = [
  {
    ...defaultGame,
    appid: 1,
    name: "Game 1",
    rank: 1,
  },
  {
    ...defaultGame,
    appid: 2,
    name: "Game 2",
    rank: 2,
  },
  {
    ...defaultGame,
    appid: 3,
    name: "Game 3",
    rank: 3,
  },
];

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Default: Story = {
  args: {
    event_id: 1,
    responded: true,
    disabled: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(`/api/steam-game`, () => {
          return HttpResponse.json(gameSearchResult);
        }),
        http.get(`/api/events/1/games`, () => {
          return HttpResponse.json(games);
        }),
      ],
    },
  },
};
