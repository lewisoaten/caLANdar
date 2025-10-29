# Storybook Implementation Progress

## Current Status

This document tracks the progress of implementing Storybook stories and tests for all frontend components.

Last Updated: 2025-10-29

## Infrastructure Status: ✅ COMPLETE

All infrastructure is in place and working:

- ✅ Storybook configured with Vite
- ✅ MSW addon for API mocking
- ✅ Vitest test setup
- ✅ Test utilities with providers
- ✅ GitHub Actions CI/CD workflow
- ✅ Comprehensive documentation (STORYBOOK_TESTING_GUIDE.md)

## Component Implementation Status

### Priority Components (from issue)

| Component | Story | Tests | Notes |
|-----------|-------|-------|-------|
| Dashboard | ❌ | ❌ | Complex, requires UserContext |
| MenuItems | ❌ | ❌ | Requires UserContext and routing |
| EventsAdmin | ❌ | ❌ | Requires API mocking |
| InvitationsTable | ❌ | ❌ | Complex table with API calls |
| VerifyEmail | ✅ | ✅ | **COMPLETE** - 4 passing tests |
| RefreshGamesButton | ✅ | ⚠️ | Story complete, test has MSW issues |
| EventTable | ❌ | ❌ | DataGrid component |
| EventsAdminDialog | ❌ | ❌ | Has pact test, needs unit test |
| AttendanceSelector | ✅ | ❌ | Story exists, needs tests |

### All Components (22 total)

| # | Component | Story | Tests | Complexity |
|---|-----------|-------|-------|------------|
| 1 | Account | ❌ | ❌ | Medium - API calls |
| 2 | AttendanceSelector | ✅ | ❌ | Medium - state management |
| 3 | Dashboard | ❌ | ❌ | High - layout wrapper |
| 4 | Event | ❌ | ❌ | High - complex page |
| 5 | EventAttendeeList | ❌ | ❌ | Medium - API + table |
| 6 | EventCard | ❌ | ❌ | Low - presentational |
| 7 | EventGameSuggestions | ✅ | ❌ | High - complex state |
| 8 | EventGames | ❌ | ❌ | High - complex page |
| 9 | EventManagement | ❌ | ❌ | High - admin page |
| 10 | EventSelection | ❌ | ❌ | Medium - list page |
| 11 | EventTable | ❌ | ❌ | Medium - DataGrid |
| 12 | EventsAdmin | ❌ | ❌ | Medium - admin page |
| 13 | EventsAdminDialog | ❌ | ❌ | Medium - form dialog |
| 14 | GameOwners | ❌ | ❌ | Medium - API + display |
| 15 | GamersAdmin | ❌ | ❌ | High - admin page |
| 16 | GamesList | ❌ | ❌ | Medium - list with API |
| 17 | InvitationResponse | ❌ | ❌ | Medium - form |
| 18 | InvitationsTable | ❌ | ❌ | High - complex table |
| 19 | MenuItems | ❌ | ❌ | Medium - navigation |
| 20 | RefreshGamesButton | ✅ | ⚠️ | Low - button with API |
| 21 | SignIn | ❌ | ❌ | Medium - form |
| 22 | VerifyEmail | ✅ | ✅ | Low - simple form |

**Progress: 4/22 stories (18%), 1/22 tests (5%)**

## Implementation Guide

For each component, follow these steps:

### 1. Create Story File

```bash
# Create file: frontend/src/stories/ComponentName.stories.tsx
# Follow template in STORYBOOK_TESTING_GUIDE.md
# Include at least: Default, Loading (if applicable), Error (if applicable)
```

### 2. Create Test File

```bash
# Create file: frontend/src/__tests__/ComponentName.test.tsx
# Follow template in STORYBOOK_TESTING_GUIDE.md
# Cover: rendering, interactions, API calls, error handling
```

### 3. Verify Locally

```bash
cd frontend

# Run specific test
npm test -- ComponentName

# View in Storybook
npm run storybook

# Build to verify no issues
npm run build-storybook
```

## Estimated Effort

Based on complexity:

- **Low complexity** (5 components): 15-20 min each = 1.5-2 hours
- **Medium complexity** (11 components): 25-35 min each = 4.5-6.5 hours
- **High complexity** (6 components): 45-60 min each = 4.5-6 hours

**Total estimated time: 10.5-14.5 hours**

## Tips for Implementation

### Quick Wins (Start Here)

These components are simpler and good starting points:

1. **EventCard** - Likely presentational only
2. **InvitationResponse** - Simple form
3. **SignIn** - Form component
4. **GamesList** - List component

### Components to Tackle Together

Some components are related and can share mocking setup:

- **Events** group: EventsAdmin, EventsAdminDialog, EventTable
- **Games** group: GamesList, GameOwners, EventGames
- **Navigation** group: Dashboard, MenuItems

### Common Patterns Needed

Make sure to document and reuse these patterns:

1. **Mocking API list endpoints** - see EventGameSuggestions.stories.ts
2. **Mocking user context** - see test-utils.tsx
3. **Mocking MUI DataGrid data** - needed for EventTable, EventAttendeeList
4. **Form submission testing** - see VerifyEmail.test.tsx
5. **Router navigation testing** - see VerifyEmail.test.tsx

## Resources

- **Main Guide**: `frontend/STORYBOOK_TESTING_GUIDE.md`
- **Example Story**: `frontend/src/stories/VerifyEmail.stories.tsx`
- **Example Test**: `frontend/src/__tests__/VerifyEmail.test.tsx`
- **Complex Story Example**: `frontend/src/stories/EventGameSuggestions.stories.ts`
- **Test Utils**: `frontend/src/test/test-utils.tsx`

## Running Quality Checks

Before committing:

```bash
cd frontend

# Run all tests
npm test -- --run

# Run linter
npx eslint .

# Build frontend
npm run build

# Build Storybook
npm run build-storybook
```

All should pass without errors.

## CI/CD

The GitHub Actions workflow (`.github/workflows/frontend.yml`) will automatically:

1. Run linter on all frontend changes
2. Run all tests
3. Build the frontend
4. Build Storybook
5. Upload Storybook artifacts

Make sure your changes pass locally before pushing.

## Questions?

Refer to `STORYBOOK_TESTING_GUIDE.md` for:
- Template code for stories
- Template code for tests
- MSW mocking examples
- Troubleshooting common issues
- Best practices
