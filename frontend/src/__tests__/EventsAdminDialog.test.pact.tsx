import React from "react";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Pact from "@pact-foundation/pact";

import EventsAdminDialog from "../components/EventsAdminDialog";

describe("CaLANDar Create Event API", () => {
  describe("create event", () => {
    beforeEach((done) => {
      const contentTypeJsonMatcher = Pact.Matchers.term({
        matcher: "application\\/json; *charset=utf-8",
        generate: "application/json; charset=utf-8",
      });

      // @ts-ignore
      process.env.REACT_APP_API_PROXY = `http://localhost:${global.port}`;

      // @ts-ignore
      global.provider
        .addInteraction({
          state: "provider allows event creation",
          uponReceiving: "a POST request to create an event",
          withRequest: {
            method: "POST",
            path: "/api/events",
            headers: {
              "Content-Type": "application/json",
            },
            query: {
              as_admin: "true",
            },
            body: {
              title: "test",
              description: "test",
              timeBegin: Pact.Matchers.iso8601DateTimeWithMillis(),
              timeEnd: Pact.Matchers.iso8601DateTimeWithMillis(),
            },
          },
          willRespondWith: {
            status: 201,
            headers: {
              "Content-Type": "application/json",
            },
            body: Pact.Matchers.somethingLike({
              id: 1,
              createdAt: Pact.Matchers.iso8601DateTimeWithMillis(),
              lastModified: Pact.Matchers.iso8601DateTimeWithMillis(),
              title: "test",
              description: "test",
              timeBegin: Pact.Matchers.iso8601DateTimeWithMillis(),
              timeEnd: Pact.Matchers.iso8601DateTimeWithMillis(),
            }),
          },
        })
        .then(() => done());
    });

    it("create an event according to contract", async () => {
      const user = userEvent.setup();

      const onClose = jest.fn();

      render(<EventsAdminDialog open={true} onClose={onClose} />);

      await user.click(screen.getByLabelText(/Title/i));
      await user.keyboard("test");

      await user.click(screen.getByLabelText(/Description/i));
      await user.keyboard("test");

      await user.click(screen.getByText("Create"));

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // @ts-ignore
      global.provider.verify();
    });
  });
});
