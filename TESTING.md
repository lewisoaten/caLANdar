# Testing Strategy

This document outlines the current testing strategy for this project and provides recommendations for future improvements.

## Current Automated Tests

### API (Backend)
- **Location:** `api/`
- **Framework:** Rust's built-in test framework (`cargo test`)
- **CI Workflow:** `.github/workflows/rust.yml`
    - Runs `cargo test` (unit and integration tests).
    - Runs `cargo fmt --check` (formatting check).
    - Runs `cargo clippy -- -D warnings` (linting).
    - **Admin Event Management Integration Test:** Covers the full CRUD lifecycle (Create, Read, Update, Delete) for events by an admin user, ensuring these core operations work correctly with the database and authentication (`api/tests/event_admin_integration_test.rs`).

### Frontend
- **Location:** `frontend/`
- **Frameworks:**
    - Vitest (for unit/integration tests)
    - Pact (for contract testing with the API)
    - ESLint (for linting)
- **CI Workflow:** `.github/workflows/frontend-ci.yml`
    - Runs ESLint.
    - Runs Vitest unit tests with coverage (`npm run test:coverage`).
    - Uploads coverage reports.
    - Runs Pact contract tests (`npm run test:pact`).
    - **EventsAdminDialog Component Test:** A component integration test using React Testing Library that verifies the dialog's functionality for creating and editing events, including form interactions, submissions, and mocking of API calls (`frontend/src/components/EventsAdminDialog.test.tsx`).
    - **Basic E2E Test for Events Page:** Uses Playwright to navigate to the events page (`/events`), verifies the page loads correctly by checking for a title/heading, and ensures the main event listing area is present. Playwright is configured in `frontend/playwright.config.ts` and tests are in `frontend/e2e/`.

## Recommendations for Future Test Improvements

To further enhance the reliability and stability of the application, the following are recommended:

### 1. API: Expand Integration Test Coverage
- While unit tests are valuable, focus on adding more **integration tests** that cover end-to-end scenarios for API endpoints.
- **Priority areas:**
    - Event creation and management lifecycle. (An initial test for event management has been added).
    - User authentication and authorization flows.
    - Game suggestion and voting logic.
    - Invitation processing.
- Ensure tests interact with a real (test) database to catch data integrity issues.

### 2. Frontend: Expand Component and Interaction Test Coverage
- Increase **unit test coverage** for individual React components, especially those with complex logic or state management.
- Add more **integration tests** for components that work together to achieve a piece of functionality (e.g., forms, multi-step flows). (An initial test for EventsAdminDialog has been added).

### 3. Frontend: Introduce End-to-End (E2E) Tests
- Implement E2E tests to simulate key user journeys through the application. This provides the highest level of confidence that the system works as a whole.
- **Recommended Tools:**
    - [Cypress](https://www.cypress.io/)
    - [Playwright](https://playwright.dev/) (Playwright has been set up and an initial test for events page viewing has been added).
- **Key user flows to cover:**
    - User registration and login.
    - Creating a new event.
    - Browsing and RSVPing to events.
    - Suggesting a game for an event.
    - Profile updates.

### 4. CI/CD: Consider Database Seeding for API Tests
- For more predictable and comprehensive API integration tests, implement a strategy for seeding the test database with consistent data before test runs.

### 5. CI/CD: Security Scanning
- Integrate automated security scanning tools (e.g., Snyk, Dependabot alerts for code, Trivy for container images if applicable) into the CI pipeline to catch vulnerabilities early.

By continuously investing in these areas, we can improve code quality, reduce regressions, and deploy with greater confidence.
