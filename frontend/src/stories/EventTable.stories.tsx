import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import EventTable from "../components/EventTable";
import { mockApi, withUser } from "./mockApi";
import { adminEventsHandler, eventsScenario } from "./adminEventFixtures";

mockApi({ "GET /api/events": adminEventsHandler });

const scenario = (mode: typeof eventsScenario.mode): Decorator =>
  function Scenario(Story) {
    eventsScenario.mode = mode;
    return <Story />;
  };

const meta = {
  title: "Components/EventTable",
  component: EventTable,
  parameters: {
    layout: "padded",
  },
  decorators: [withUser({ isAdmin: true })],
  tags: ["autodocs"],
} satisfies Meta<typeof EventTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdminView: Story = {
  args: { asAdmin: true, pageSize: 6 },
  decorators: [scenario("data")],
};

/** Narrow container: rows stack (as on mobile). */
export const Narrow: Story = {
  args: { asAdmin: true, pageSize: 6 },
  decorators: [
    scenario("data"),
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};

export const EmptyState: Story = {
  args: { asAdmin: true },
  decorators: [scenario("empty")],
};

export const LoadError: Story = {
  args: { asAdmin: true },
  decorators: [scenario("error")],
};
