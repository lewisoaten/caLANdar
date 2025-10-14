# Storybook Component Development Guide

This guide explains how to add new components to our Storybook library and create comprehensive tests.

## Overview

Every React component in the `frontend/src/components/` directory should have:
1. A Storybook story file (`.stories.tsx`)
2. A test file (`.test.tsx`)
3. Proper documentation and examples

## Creating a New Storybook Story

### 1. Basic Story Structure

Create a file named `ComponentName.stories.tsx` in `src/stories/`:

```typescript
import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import YourComponent from "../components/YourComponent";
import React from "react";

const meta = {
  title: "Components/YourComponent",
  component: YourComponent,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "centered", // or "fullscreen" for large components
    docs: {
      description: {
        component: "Brief description of what this component does.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // Default props here
  },
};
```

### 2. Adding Multiple Variants

Create different stories to showcase various states:

```typescript
export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const WithError: Story = {
  args: {
    error: "Something went wrong",
  },
};

export const WithData: Story = {
  args: {
    data: mockData,
  },
};
```

### 3. API Mocking with MSW

For components that make API calls, use MSW to mock responses:

```typescript
const meta = {
  // ... other config
  parameters: {
    msw: {
      handlers: [
        {
          method: "GET",
          url: "/api/endpoint",
          response: {
            status: 200,
            json: { data: "mock data" },
          },
        },
      ],
    },
  },
};
```

### 4. Context Providers

If your component uses React Context, mock it in decorators:

```typescript
// For components using UserContext
decorators: [
  (Story) => {
    const mockUserContext = {
      email: "test@example.com",
      token: "mock-token",
      loggedIn: true,
      isAdmin: false,
    };
    
    return (
      <BrowserRouter>
        <UserContext.Provider value={mockUserContext}>
          <Story />
        </UserContext.Provider>
      </BrowserRouter>
    );
  },
],
```

## Creating Component Tests

### 1. Basic Test Structure

Create a file named `ComponentName.test.tsx` in `src/__tests__/`:

```typescript
import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import YourComponent from "../components/YourComponent";

// Mock external dependencies
vi.mock("../UserProvider", () => ({
  // Mock implementation
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe("YourComponent", () => {
  test("renders correctly", () => {
    render(
      <TestWrapper>
        <YourComponent />
      </TestWrapper>
    );
    
    expect(screen.getByText("Expected Text")).toBeInTheDocument();
  });
});
```

### 2. Testing Props and States

```typescript
test("displays different content based on props", () => {
  const { rerender } = render(
    <TestWrapper>
      <YourComponent isLoading={false} />
    </TestWrapper>
  );
  
  expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  
  rerender(
    <TestWrapper>
      <YourComponent isLoading={true} />
    </TestWrapper>
  );
  
  expect(screen.getByText("Loading...")).toBeInTheDocument();
});
```

### 3. Testing User Interactions

```typescript
test("handles user interactions", async () => {
  const mockOnClick = vi.fn();
  
  render(
    <TestWrapper>
      <YourComponent onClick={mockOnClick} />
    </TestWrapper>
  );
  
  const button = screen.getByRole("button");
  await userEvent.click(button);
  
  expect(mockOnClick).toHaveBeenCalledTimes(1);
});
```

### 4. Testing API Calls

```typescript
test("makes correct API calls", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: "test" }),
  });
  global.fetch = mockFetch;
  
  render(
    <TestWrapper>
      <YourComponent />
    </TestWrapper>
  );
  
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith("/api/endpoint", {
      method: "GET",
      headers: expect.any(Object),
    });
  });
});
```

## Best Practices

### 1. Story Organization

- Group related stories under the same component
- Use clear, descriptive names for each story variant
- Include documentation for each story's purpose
- Show edge cases and error states

### 2. Test Coverage

Focus on testing:
- ✅ Component rendering with different props
- ✅ User interactions and their outcomes
- ✅ API calls and responses
- ✅ Error handling
- ✅ Accessibility features

Avoid testing:
- ❌ Internal component implementation details
- ❌ Third-party library behavior
- ❌ CSS styles (use visual regression tests instead)

### 3. Mocking Strategy

- Mock all external dependencies (APIs, contexts, modules)
- Use MSW for API mocking in Storybook
- Keep mocks simple and focused
- Mock at the boundary level (e.g., entire UserProvider module)

### 4. Accessibility

- Include accessibility checks in tests
- Use semantic HTML and ARIA attributes
- Test keyboard navigation
- Verify screen reader compatibility

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Build Storybook
npm run build-storybook

# Run Storybook tests
npm run test-storybook
```

## CI/CD Integration

The GitHub Actions workflow automatically:
1. Runs all component tests
2. Builds Storybook
3. Uploads artifacts for review
4. Fails the build if any tests fail

## Troubleshooting

### Common Issues

1. **JSX Syntax Errors**: Ensure all JSX tags are properly closed
2. **Context Mocking**: Mock entire context modules, not individual contexts
3. **Async Tests**: Use `waitFor` for async operations
4. **Router Issues**: Wrap components in `BrowserRouter` for tests

### Getting Help

- Check existing component stories for examples
- Review the test utilities in `src/__tests__/testUtils.tsx`
- Run `npm run storybook` to preview stories locally
- Check the console for detailed error messages

## Future Enhancements

Consider adding:
- Visual regression testing with Chromatic
- Interaction testing with Storybook's test runner
- A11y testing with @storybook/addon-a11y
- Performance testing for complex components