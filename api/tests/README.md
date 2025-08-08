# Integration Tests for CaLANdar API

This directory contains comprehensive end-to-end integration tests for the CaLANdar API that verify the complete workflow using a real database while mocking only external services (Steam API and email).

## Overview

The integration tests cover the full user workflow:

1. **Admin Operations**
   - Login as admin (`lewis@oaten.name`)
   - Update the games database
   - Create an event
   - Invite guests

2. **Guest Operations**
   - Guest login and authentication
   - Steam games import
   - RSVP to events
   - Game suggestions
   - Voting on games

## Test Structure

### `integration_test.rs`

- **`test_api_connectivity()`** - Basic connectivity test that checks if the API server is running
- **`test_admin_operations_mock()`** - Demonstrates admin operations with mock authentication
- **`test_complete_api_workflow()`** - Full workflow test (currently a template/demonstration)

## Running the Tests

### Prerequisites

1. **Start the development environment:**
   ```bash
   nix develop --impure
   ```

2. **Start the API server in one terminal:**
   ```bash
   just dev-api
   ```

### Running Tests

```bash
# Run basic connectivity tests
cargo test test_api_connectivity

# Run all integration tests  
cargo test --test integration_test

# Run the full workflow test (currently ignored)
cargo test test_complete_api_workflow -- --ignored
```

## Mocking Strategy

### External Services Mocked
- **Steam API** - Game lists and user game libraries
- **Email Service** - Email sending for invitations and verification

### Real Services Used
- **Database** - PostgreSQL via Shuttle (uses real database operations)
- **Authentication** - PASETO tokens (real token generation and verification)
- **API Endpoints** - All API routes use real implementations

## Mock Server Details

The tests use `mockito` to mock external APIs:

### Steam API Mocks
- `/ISteamApps/GetAppList/v2/` - Returns sample game list
- `/IPlayerService/GetOwnedGames/v0001/` - Returns sample user games

### Email Service Mocks  
- `/emails` - Returns success responses for email sending

## Test Data

The tests use consistent test data:
- **Admin**: `lewis@oaten.name`
- **Guest 1**: `guest1@test.com` (Steam ID: `76561198000000001`)
- **Guest 2**: `guest2@test.com` (Steam ID: `76561198000000002`)

## Authentication in Tests

Currently, the tests demonstrate the authentication flow structure but use mock tokens. To implement fully functional authentication:

1. Access the server's PASETO key configuration
2. Generate valid pre-authentication tokens for email verification
3. Complete the login flow with actual token verification

## Adding New Tests

To add new integration tests:

1. Create new test functions in `integration_test.rs`
2. Use the `TestContext` helper for consistent setup
3. Set up appropriate mocks for external services
4. Follow the established pattern for error handling and cleanup

## Performance Considerations

- Tests run sequentially to avoid database conflicts
- Mock servers are created per test context
- Cleanup operations remove test data when possible
- Server readiness checks prevent flaky test failures

## Troubleshooting

### "API server not accessible"
- Ensure `just dev-api` is running in another terminal
- Check that port 8000 is not blocked
- Verify the development environment is properly set up

### Authentication Failures
- The current mock authentication may not match server expectations
- Full authentication requires access to the server's PASETO configuration
- Some endpoints may require actual database records for users

### Test Timeouts
- Increase wait times in `wait_for_server()` if needed
- Check server logs for startup issues
- Ensure database migrations have completed

## Future Enhancements

1. **Complete Authentication Integration** - Implement real token generation
2. **Parallel Test Execution** - Use separate test databases
3. **Performance Benchmarks** - Add timing assertions
4. **Error Case Testing** - Test edge cases and error conditions
5. **Data Validation** - Verify response payloads more thoroughly