# Storybook and Testing Guide for CaLANdar Components

This guide provides instructions for creating Storybook stories and component tests for all React components in the CaLANdar frontend application.

## Overview

All React components in `frontend/src/components/` should have:

1. A Storybook story file (`.stories.tsx`)
2. A test file (`.test.tsx`)

## Prerequisites

- All tests must mock API calls using MSW (Mock Service Worker)
- Tests should focus on observable behavior and interface, not implementation details
- Stories should demonstrate all key states and props variations

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   ├── stories/             # Storybook story files
│   ├── __tests__/           # Component test files
│   └── test/
│       ├── setup.ts         # Test setup and configuration
│       └── test-utils.tsx   # Custom render helpers with providers
├── .storybook/              # Storybook configuration
└── package.json
```

## Creating a Storybook Story

### Basic Template

Create a file `src/stories/ComponentName.stories.tsx`:

```typescript
import type { Meta, StoryObj } from "@storybook/react";
import { http, HttpResponse } from "msw";
import ComponentName from "../components/ComponentName";

const meta = {
  title: "Components/ComponentName",
  component: ComponentName,
  parameters: {
    layout: "centered", // or "fullscreen" for page-level components
  },
  tags: ["autodocs"],
  argTypes: {
    // Define prop controls
    propName: { control: "text" },
    numberProp: { control: "number" },
    booleanProp: { control: "boolean" },
  },
} satisfies Meta<typeof ComponentName>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default story
export const Default: Story = {
  args: {
    propName: "default value",
    numberProp: 1,
    booleanProp: false,
  },
  parameters: {
    msw: {
      handlers: [
        // Mock API calls
        http.get("/api/endpoint", () => {
          return HttpResponse.json({ data: "mocked response" });
        }),
      ],
    },
  },
};

// Additional stories for different states
export const AlternativeState: Story = {
  args: {
    propName: "alternative value",
    // ...
  },
};
```

### For Components Requiring Context

If your component needs UserContext or other providers:

```typescript
import { UserProvider } from "../UserProvider";

// Wrap component in decorator
const meta = {
  title: "Components/ComponentName",
  component: ComponentName,
  decorators: [
    (Story) => (
      <UserProvider>
        <Story />
      </UserProvider>
    ),
  ],
  // ...
};
```

### For Components with State

If your component receives state as props:

```typescript
import { useState } from "react";

const ComponentWrapper = (args: any) => {
  const someState = useState(initialValue);
  return <ComponentName someState={someState} {...args} />;
};

const meta = {
  title: "Components/ComponentName",
  component: ComponentWrapper,
  // ...
};
```

## Creating Component Tests

### Basic Template

Create a file `src/__tests__/ComponentName.test.tsx`:

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../test/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ComponentName from "../components/ComponentName";

// Set up MSW server
const server = setupServer();

beforeEach(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("ComponentName", () => {
  test("renders with required props", () => {
    render(<ComponentName requiredProp="value" />);
    expect(screen.getByText("Expected text")).toBeInTheDocument();
  });

  test("handles user interaction", async () => {
    const handleClick = vi.fn();
    render(<ComponentName onClick={handleClick} />);

    const button = screen.getByRole("button");
    await userEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test("fetches and displays data", async () => {
    server.use(
      http.get("/api/endpoint", () => {
        return HttpResponse.json({ data: "test data" });
      })
    );

    render(<ComponentName />);

    await waitFor(() => {
      expect(screen.getByText("test data")).toBeInTheDocument();
    });
  });

  test("handles API errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    server.use(
      http.get("/api/endpoint", () => {
        return HttpResponse.json({ error: "Failed" }, { status: 500 });
      })
    );

    render(<ComponentName />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
```

### Test Helpers

The `test-utils.tsx` file provides a custom `render` function that automatically wraps components with necessary providers (Router, Theme, UserProvider). Use it instead of the default `render` from `@testing-library/react`.

## Mocking API Calls with MSW

### In Stories

```typescript
parameters: {
  msw: {
    handlers: [
      http.get("/api/endpoint", () => {
        return HttpResponse.json({ data: "value" });
      }),
      http.post("/api/endpoint", async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ success: true });
      }),
    ],
  },
}
```

### In Tests

```typescript
beforeEach(() => {
  server.use(
    http.get("/api/endpoint", () => {
      return HttpResponse.json({ data: "value" });
    }),
  );
});
```

## Common Patterns

### Testing Loading States

```typescript
test("shows loading indicator", () => {
  render(<ComponentName loading={true} />);
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
});
```

### Testing Error States

```typescript
test("displays error message", () => {
  render(<ComponentName error="Something went wrong" />);
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
});
```

### Testing Forms

```typescript
test("submits form with correct data", async () => {
  const handleSubmit = vi.fn();
  render(<ComponentName onSubmit={handleSubmit} />);

  await userEvent.type(screen.getByLabelText("Email"), "test@example.com");
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));

  await waitFor(() => {
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" })
    );
  });
});
```

### Testing with Material-UI Components

MUI components often use `aria-` attributes instead of regular HTML attributes:

```typescript
// For disabled state
expect(button).toHaveAttribute("aria-disabled", "true");

// For hidden elements
expect(element).toHaveAttribute("aria-hidden", "true");
```

## Running Tests and Storybook

### Run Tests

```bash
npm test                    # Run all tests in watch mode
npm test -- --run           # Run tests once
npm test -- ComponentName   # Run specific test file
npm run test:coverage       # Run with coverage report
```

### Run Storybook

```bash
npm run storybook           # Start Storybook dev server
npm run build-storybook     # Build static Storybook
```

## Component Checklist

For each component, ensure:

- [ ] Story file created with at least:
  - Default state
  - Loading state (if applicable)
  - Error state (if applicable)
  - All major prop variations
- [ ] Test file created with at least:
  - Render test with required props
  - User interaction tests
  - API call mocking (if applicable)
  - Error handling tests
- [ ] All tests pass locally
- [ ] Storybook builds successfully
- [ ] No real API calls are made (all mocked)

## Components Status

### Completed

- AttendanceSelector (story + tests needed)
- EventGameSuggestions (story + tests needed)

### To Do

1. Dashboard
2. MenuItems
3. EventsAdmin
4. InvitationsTable
5. VerifyEmail
6. RefreshGamesButton
7. EventTable
8. EventsAdminDialog
9. Account
10. Event
11. EventAttendeeList
12. EventCard
13. EventGames
14. EventManagement
15. EventSelection
16. GameOwners
17. GamersAdmin
18. GamesList
19. InvitationResponse
20. SignIn

## Tips and Best Practices

1. **Keep tests simple**: Focus on user-facing behavior, not implementation
2. **Use semantic queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Mock at the network level**: Use MSW instead of mocking fetch directly
4. **Test accessibility**: Use proper ARIA labels and roles
5. **Avoid implementation details**: Don't test state or props directly
6. **Use waitFor for async**: Always wait for async operations to complete
7. **Clean up side effects**: Mock and restore console.log, alert, etc.

## Troubleshooting

### Tests fail with "Cannot find module"

- Ensure all imports use correct relative paths
- Check that `test-utils.tsx` is imported instead of `@testing-library/react` for render

### MSW handlers not working

- Ensure `server.listen()` is called in `beforeEach`
- Check URL matches exactly (including query params)
- Use `onUnhandledRequest: "bypass"` to allow non-mocked requests

### Component requires context

- Use the custom `render` from `test-utils.tsx`
- Or wrap component in necessary providers in test

### Storybook build fails

- Run `npm run build-storybook` to see detailed errors
- Check that all imports are valid
- Ensure MSW handlers are properly configured

## Resources

- [Storybook Documentation](https://storybook.js.org/docs/react/get-started/introduction)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [MSW Documentation](https://mswjs.io/docs/)
- [Vitest Documentation](https://vitest.dev/)
