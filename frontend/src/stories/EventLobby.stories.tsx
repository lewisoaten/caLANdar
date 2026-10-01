import type { Meta, StoryObj, Decorator } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import Dashboard from "../components/Dashboard";
import Event from "../components/Event";
import { mockResponse, stubImages, withRoute, withUser } from "./mockApi";
import { atPath, mockShellApi, SHELL_EVENT_ID } from "./shellMocks";
import { mockLobbyApi, type LobbyMockOptions } from "./lobbyMocks";

stubImages();

/**
 * The event lobby (HlLobby) inside the app shell: hero with countdown, the
 * viewer's RSVP panel, squad list and game vote. "Edit RSVP" opens the
 * wizard. Every API call is faked (see `lobbyMocks.ts`); votes, pitches and
 * suggestions round-trip through the fake API.
 */
const meta = {
  title: "Pages/Event lobby",
  component: Event,
  parameters: { layout: "fullscreen", router: false },
} satisfies Meta<typeof Event>;

export default meta;
type Story = StoryObj<typeof meta>;

const inShell = (
  opts: LobbyMockOptions = {},
  path = `/events/${SHELL_EVENT_ID}`,
): Decorator[] => [
  (Story) => {
    mockShellApi(opts.response === undefined ? "yes" : opts.response);
    mockLobbyApi(SHELL_EVENT_ID, opts);
    return (
      <Dashboard>
        <Routes>
          <Route path="/events/:id" element={<Story />} />
        </Routes>
      </Dashboard>
    );
  },
  withUser({ email: "sam@example.com" }),
  atPath(path),
];

/** RSVP'd yes with a seat: the design's main screenshot. */
export const Lobby: Story = { decorators: inShell() };

/** Invited but not responded: primary "RSVP now" CTA, squad and vote locked. */
export const NotResponded: Story = {
  decorators: inShell({ response: null }),
};

/** Tentative: amber status and attendance blocks. */
export const Maybe: Story = { decorators: inShell({ response: "maybe" }) };

/** Declined: squad and vote stay visible, "Update RSVP" CTA. */
export const NotGoing: Story = { decorators: inShell({ response: "no" }) };

/** Bring-your-own-desk (unspecified seat). */
export const OwnDesk: Story = { decorators: inShell({ seatId: null }) };

/** No seating configured for the event: no seat column or seat step. */
export const NoSeating: Story = {
  decorators: inShell({ hasSeating: false }),
};

/** The squad and vote requests fail: each panel offers a retry. */
export const ListsFailed: Story = {
  decorators: inShell({ failLists: true }),
};

/** Unknown event id. */
export const NotFound: Story = {
  decorators: [
    (Story) => {
      mockShellApi("yes");
      mockLobbyApi(976, {
        event: () => mockResponse(404, { error: { code: 404 } }),
      });
      return (
        <Dashboard>
          <Routes>
            <Route path="/events/:id" element={<Story />} />
          </Routes>
        </Dashboard>
      );
    },
    withUser({ email: "sam@example.com" }),
    atPath("/events/976"),
  ],
};

/** The page on its own (no shell), for quick iteration. */
export const WithoutShell: Story = {
  parameters: { router: true, layout: "padded" },
  decorators: [
    (Story) => {
      mockLobbyApi(975);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Story />
        </div>
      );
    },
    withUser({ email: "sam@example.com" }),
    withRoute("/events/:id", "/events/975"),
  ],
};
