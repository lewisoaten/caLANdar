/* eslint-disable  @typescript-eslint/no-explicit-any */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import RefreshGamesButton from "../components/RefreshGamesButton";
import { useState } from "react";

// Wrapper to provide state management for the button
const RefreshGamesButtonWrapper = (args: any) => {
  const loadingState = useState(false);
  const doneState = useState(false);

  return (
    <RefreshGamesButton
      loadingState={loadingState}
      doneState={doneState}
      {...args}
    />
  );
};

// Renders the button with its state pre-set. Hooks cannot be called from a
// story's render function directly, since that is not a component.
const RefreshGamesButtonInState = ({
  loading,
  done,
}: {
  loading: boolean;
  done: boolean;
}) => {
  const loadingState = useState(loading);
  const doneState = useState(done);

  return (
    <RefreshGamesButton loadingState={loadingState} doneState={doneState} />
  );
};

const meta = {
  title: "Components/RefreshGamesButton",
  component: RefreshGamesButtonWrapper,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof RefreshGamesButtonWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/api/steam-game-update-v2", () => {
          return HttpResponse.json({}, { status: 200 });
        }),
      ],
    },
  },
};

export const Loading: Story = {
  render: () => <RefreshGamesButtonInState loading={true} done={false} />,
  parameters: {
    msw: {
      handlers: [
        http.post("/api/steam-game-update-v2", () => {
          // Simulate a delayed response
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(HttpResponse.json({}, { status: 200 }));
            }, 10000);
          });
        }),
      ],
    },
  },
};

export const Done: Story = {
  render: () => <RefreshGamesButtonInState loading={false} done={true} />,
  parameters: {
    msw: {
      handlers: [
        http.post("/api/steam-game-update-v2", () => {
          return HttpResponse.json({}, { status: 200 });
        }),
      ],
    },
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/api/steam-game-update-v2", () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      ],
    },
  },
};

export const Unauthorized: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/api/steam-game-update-v2", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
      ],
    },
  },
};
