import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import EventsAdmin from "../components/EventsAdmin";
import Dashboard from "../components/Dashboard";
import { sectionGap } from "../components/hl";
import { mockApi, mockResponse, withUser, type MockRequest } from "./mockApi";
import { atPath, mockShellApi } from "./shellMocks";
import {
  adminEvents,
  adminEventsHandler,
  eventsScenario,
} from "./adminEventFixtures";

const registerApi = () =>
  mockApi({
    "GET /api/events": adminEventsHandler,
    "POST /api/events": ({ body }: MockRequest) =>
      mockResponse(201, {
        ...adminEvents[0],
        ...(body as object),
        id: 999,
      }),
  });
registerApi();

const scenario = (mode: typeof eventsScenario.mode): Decorator =>
  function Scenario(Story) {
    eventsScenario.mode = mode;
    return <Story />;
  };

const meta = {
  title: "Components/EventsAdmin",
  component: EventsAdmin,
  parameters: {
    layout: "padded",
  },
  decorators: [
    withUser({ isAdmin: true }),
    // The shell's <main> lays pages out as a column with the section gap.
    (Story) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: sectionGap,
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof EventsAdmin>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 15 events, 6 per page, with status counts and RSVP bars. */
export const Default: Story = { decorators: [scenario("data")] };

/** The inline new-event form, opened from the header button. */
export const NewEventOpen: Story = {
  decorators: [scenario("data")],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /new event/i }),
    );
    await expect(await canvas.findByLabelText(/title/i)).toBeVisible();
  },
};

/** Filtered to drafts via the status chips. */
export const DraftsOnly: Story = {
  decorators: [scenario("data")],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /draft/i }),
    );
  },
};

/** A search with no results. */
export const NoMatches: Story = {
  decorators: [scenario("data")],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole("searchbox", { name: "Search events" }),
      "zzz",
    );
  },
};

/** No events exist yet. */
export const Empty: Story = { decorators: [scenario("empty")] };

/** The list request fails. */
export const LoadError: Story = { decorators: [scenario("error")] };

/** First load still in flight. */
export const Loading: Story = { decorators: [scenario("slow")] };

/** The page inside the app shell (sidebar, breadcrumb), as in the design. */
export const InShell: Story = {
  parameters: { layout: "fullscreen", router: false },
  decorators: [
    (Story) => {
      eventsScenario.mode = "data";
      mockShellApi("yes");
      registerApi();
      return (
        <Dashboard>
          <Story />
        </Dashboard>
      );
    },
    atPath("/admin/events"),
  ],
};
