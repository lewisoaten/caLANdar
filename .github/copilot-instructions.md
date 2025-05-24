# CaLANdar Development Instructions

This document provides guidelines and instructions for GitHub Copilot to help with the development of CaLANdar, a web application for organizing LAN parties.

## Project Structure

- `api/`: Rust backend using Rocket framework and Shuttle for deployment
- `frontend/`: React frontend application
- `proxy/`: Proxy configuration

## Development Environment

The project uses Nix flakes for development environment setup. All dependencies are defined in `flake.nix` including:
- Rust toolchain and cargo tools
- Node.js
- PostgreSQL
- Just command runner

### Activating the Development Environment

Before running any commands, you must activate the Nix development shell:

```bash
# Activate the Nix develop shell
nix develop --impure

# All commands must be run inside this environment
```

All commands listed in this document must be executed within the activated Nix shell. The shell provides access to all required dependencies and tools. You can verify the environment is activated correctly by running:

```bash
# Check available commands in justfile
just --list
```

## Common Development Commands

Use the following commands to manage the application:

### Running the Application

- `just dev`: Runs both API and frontend in development mode
- `just dev-api`: Runs only the API in development mode with auto-reload
- `just dev-frontend`: Runs only the frontend in development mode

### Database Operations

- `just migrate-info`: Shows information about applied and pending migrations
- `just migrate-add <name>`: Adds a new migration script
- `just migrate-run`: Applies pending migrations
- `just migrate-revert`: Reverts the last applied migration
- `just update-sqlx`: Updates the SQLx JSON data file after schema changes

### Testing

- `just pact-api`: Runs the API and verifies the contract against the Pact files
- `just pact-frontend`: Runs the frontend Pact tests

## Authentication

The application uses PASETO tokens for authentication:
- Regular users authenticate with a token
- Admin users require additional `as_admin=true` query parameter
- The API key for development is "put_something_here"

## API Structure

- The API follows REST principles
- OpenAPI documentation is available
- Routes are organized by resource type (users, events, games, etc.)

## Frontend Structure

- The frontend is a React application created with Create React App
- Material-UI is used for the UI components
- Storybook is available for component development
- Pact tests are used for contract testing with the API

## Deployment

- The backend is deployed using Shuttle
- The frontend is deployed using Netlify
- GitHub Actions are used for CI/CD