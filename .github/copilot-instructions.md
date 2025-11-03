# CaLANdar Development Instructions

This document provides comprehensive guidelines for GitHub Copilot agents working on CaLANdar, a web application for organizing LAN parties. Trust these instructions and only search for additional information if something is incomplete or incorrect.

## Project Overview

**What it does**: CaLANdar is a full-stack web application for organizing LAN parties, managing events, invitations, game suggestions, and user profiles.

**Repository size**: Medium (~28 Rust files, ~54 TypeScript/TSX files)
**Type**: Full-stack web application
**Languages & Frameworks**:
- **Backend**: Rust 1.87.0, Rocket web framework, Shuttle deployment platform
- **Frontend**: React 19, TypeScript 5.8, Vite 6, Material-UI 7
- **Database**: PostgreSQL via SQLx with migrations
- **Contract Testing**: Pact for API contract verification

## Critical: Development Environment Setup

**ALL commands must be run inside the Nix development shell. This is mandatory.**

### Step 1: Activate Nix Environment (REQUIRED FIRST STEP)

```bash
# ALWAYS run this first before any other command
nix develop --impure

# You'll see: "CaLANdar development environment activated!"
```

The Nix shell provides: Rust 1.87.0, cargo tools, Node.js 22, PostgreSQL, Just, pre-commit, and all other dependencies. **Do not try to use system-installed versions.**

### Step 2: Verify Environment

```bash
# Verify the environment is working
just --list
```

## Build Instructions

### Backend (Rust API)

**Location**: `api/` directory
**Build time**: ~90 seconds (first build), ~5-10 seconds (incremental)
**Test time**: ~6 seconds

```bash
# Build the API (must be in Nix shell)
cd api && cargo build

# Run tests
cd api && cargo test

# Build and run with Shuttle (for local development)
cargo shuttle run --working-directory api
```

**Important**: The API uses SQLx with compile-time query checking. The `.sqlx/` directory contains cached query metadata. If you modify database queries or schema:
1. Ensure the database is running
2. Run `just update-sqlx` to regenerate the metadata

### Frontend (React/TypeScript)

**Location**: `frontend/` directory
**Build time**: Depends on npm install (~10+ minutes first time)
**Important**: npm install can take a VERY long time (10+ minutes) due to Pact dependencies downloading binaries. Be patient.

```bash
# Install dependencies (REQUIRED before any frontend work)
cd frontend && npm install
# Note: This takes 10+ minutes on first run due to Pact binary downloads

# Alternative for CI/reproducible builds
cd frontend && npm ci

# Run frontend tests
cd frontend && npm test -- --run

# Build for production
cd frontend && npm run build

# Run development server (requires API running)
cd frontend && REACT_APP_API_PROXY=http://localhost:8000 npm start
```

**Frontend builds output to**: `frontend/build/`

## Testing

### Backend Tests

```bash
cd api && cargo test
```

Currently has 1 unit test in `api/src/auth.rs`. Tests run in ~6 seconds.

### Frontend Tests

```bash
# Unit tests with Vitest
cd frontend && npm test -- --run

# Pact contract tests
cd frontend && npm run test:pact
# Or via Just:
just pact-frontend
```

### Pact Contract Testing

Pact tests verify the contract between frontend and API:

```bash
# Run API and verify against Pact files
just pact-api

# Generate Pact files from frontend tests
just pact-frontend
```

Pact files are stored in `frontend/pacts/`.

## Linting and Code Quality

### Pre-commit Hooks (ALWAYS RUN BEFORE COMMITTING)

**Critical**: The project uses pre-commit hooks that MUST pass for CI to succeed.

```bash
# Run all pre-commit checks (REQUIRED before committing)
pre-commit run --all-files
```

**Pre-commit checks include**:
- YAML, JSON, TOML, XML validation
- End of file fixing
- Trailing whitespace removal
- Rust formatting (`rustfmt`) - runs on `api/Cargo.toml`
- Rust linting (`clippy`) - very strict: `-D warnings`, `-D clippy::pedantic`, `-D clippy::nursery`, `-D clippy::unwrap_used`
- Prettier formatting (JavaScript, TypeScript, Markdown, etc.)
- ESLint (requires `frontend/node_modules` to exist)

**Important**: The ESLint check will FAIL if frontend dependencies aren't installed. Always run `cd frontend && npm install` first.

**Fix failures**: Some checks auto-fix (formatting). Others require manual changes. Always verify and stage fixes before committing.

### Manual Linting

```bash
# Rust linting (via pre-commit)
just clippy

# Frontend linting
cd frontend && npm run lint
```

**Rust Clippy is VERY strict**: It enforces pedantic and nursery lints, and forbids `.unwrap()`. Use proper error handling with `?` or `expect()` with descriptive messages.

## Using Just (Task Runner)

The `Justfile` defines common development tasks. **Always use Just commands when available** as they handle complex setup automatically.

```bash
# List all available commands
just --list

# Run both API and frontend in development mode
just dev

# Run only API with auto-reload
just dev-api

# Run only frontend
just dev-frontend

# Run Storybook for component development
just dev-storybook

# Database migration commands (require running PostgreSQL container)
just migrate-info      # Show migration status
just migrate-add <name>  # Create new migration
just migrate-run       # Apply pending migrations
just migrate-revert    # Revert last migration
just update-sqlx       # Update SQLx query metadata

# Testing commands
just pact-api          # Run API and verify Pact contracts
just pact-frontend     # Run frontend Pact tests

# Other development tools
just bacon            # Run bacon (Rust background compiler)
just clippy           # Run clippy via pre-commit
```

**Database commands note**: Migration commands expect a running PostgreSQL container named `shuttle_calandar-api_shared_postgres`. This is created automatically when you run the API with Shuttle.

## Project Architecture

### Directory Structure

```
.
├── .github/
│   └── workflows/          # CI/CD workflows
│       ├── rust.yml        # Backend CI (build + test)
│       ├── frontend.yml    # Frontend CI (test + build)
│       └── shuttle-deploy.yml  # Deploy to Shuttle
├── api/                    # Rust backend
│   ├── src/
│   │   ├── main.rs        # Entry point, Shuttle config
│   │   ├── auth.rs        # PASETO token authentication
│   │   ├── error.rs       # Error handling
│   │   ├── util.rs        # Utilities
│   │   ├── controllers/   # Business logic
│   │   ├── repositories/  # Database access
│   │   └── routes/        # API endpoints
│   ├── migrations/        # SQLx database migrations
│   ├── .sqlx/             # SQLx query metadata (cached)
│   ├── Cargo.toml         # Rust dependencies
│   ├── Rocket.toml        # Rocket configuration
│   └── rust-toolchain.toml  # Rust version (1.87.0)
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── __tests__/     # Tests (including Pact)
│   │   └── test/          # Test setup files
│   ├── public/            # Static assets
│   ├── pact/              # Pact test setup
│   ├── pacts/             # Generated Pact contract files
│   ├── .storybook/        # Storybook configuration
│   ├── package.json       # npm dependencies
│   ├── vite.config.ts     # Vite configuration
│   ├── eslint.config.mjs  # ESLint configuration
│   └── tsconfig.json      # TypeScript configuration
├── proxy/                 # Nginx proxy configuration
├── .pre-commit-config.yaml  # Pre-commit hooks config
├── Justfile               # Task runner commands
├── flake.nix              # Nix environment definition
├── docker-compose.yml     # Local development with Docker
└── README.md              # Basic project info
```

### Backend Architecture

- **Framework**: Rocket (async web framework)
- **Deployment**: Shuttle (serverless Rust platform)
- **Database**: PostgreSQL via SQLx (compile-time checked queries)
- **Authentication**: PASETO tokens (in `auth.rs`)
- **API Documentation**: OpenAPI via `rocket_okapi`
- **Structure**: Controllers → Repositories → Database
- **Routes**: Organized by resource (users, events, games, etc.)

**Key files**:
- `api/src/main.rs`: Shuttle setup, route mounting
- `api/src/auth.rs`: PASETO authentication logic
- `api/src/controllers/`: Business logic for each resource
- `api/src/repositories/`: Database queries
- `api/migrations/`: SQL migration files

### Frontend Architecture

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6 (NOT Create React App anymore)
- **UI Library**: Material-UI 7 (@mui/material)
- **Testing**: Vitest for unit tests, Pact for contract tests
- **Component Development**: Storybook
- **State Management**: React hooks and context
- **API Proxy**: Vite dev server proxies `/api` to backend

**Key files**:
- `frontend/src/App.tsx`: Main application component
- `frontend/vite.config.ts`: Vite config including API proxy
- `frontend/eslint.config.mjs`: ESLint configuration
- `frontend/package.json`: Dependencies and scripts
- `frontend/.storybook/`: Storybook configuration

### Database Migrations

Located in `api/migrations/`, migrations use SQLx's migration system:
- Paired `.up.sql` and `.down.sql` files
- Applied via `cargo sqlx migrate run` or `just migrate-run`
- Track schema for: users, events, invitations, games, game suggestions, profiles

**When adding migrations**:
1. `just migrate-add <descriptive-name>`
2. Edit the generated `.up.sql` and `.down.sql` files
3. `just migrate-run` to apply
4. `just update-sqlx` to update query metadata

## CI/CD Pipeline

### GitHub Actions Workflows

**1. Rust CI (`.github/workflows/rust.yml`)**
- Triggers: Push to main/staging/trying, PRs to main
- Steps: Cargo build, cargo test
- Uses cargo caching for speed

**2. Frontend CI (`.github/workflows/frontend.yml`)**
- Triggers: Push to main/staging/trying (if frontend/** changed), PRs to main
- Steps:
  1. Setup Node.js 20
  2. `npm ci` to install dependencies
  3. `npm test -- --run` to run tests
  4. `npm run build` to build production bundle
  5. `npm run build-storybook` to build Storybook
  6. Upload Storybook artifact

**3. Shuttle Deploy (`.github/workflows/shuttle-deploy.yml`)**
- Triggers: Push to main only
- Deploys API to Shuttle with secrets

### Pre-commit CI

The project uses pre-commit.ci which runs pre-commit hooks on every PR. **Your code must pass all pre-commit checks** or the PR will be blocked.

**Skipped in CI**: ESLint, fmt, clippy (run locally instead)

## Common Issues and Workarounds

### Issue: "Error: Cannot find package 'globals'" from ESLint

**Cause**: Frontend dependencies not installed.
**Fix**: Run `cd frontend && npm install` first.

### Issue: SQLx compile errors about missing tables/columns

**Cause**: SQLx query metadata (`.sqlx/query-*.json`) is stale.
**Fix**:
1. Ensure database is running (run API with Shuttle first)
2. Run `just update-sqlx`

### Issue: "shuttle_calandar-api_shared_postgres" container not found

**Cause**: Database migration commands expect a running PostgreSQL container created by Shuttle.
**Fix**: Run the API first with `cargo shuttle run --working-directory api` to create the container.

### Issue: npm install taking forever

**Expected behavior**: The Pact dependency downloads large binaries. First install can take 10+ minutes. Be patient or use npm cache if available.

### Issue: Clippy errors about `.unwrap()`

**Cause**: Project enforces `-D clippy::unwrap_used`.
**Fix**: Use `?` for error propagation or `.expect("descriptive message")` instead.

## Authentication Details

**Type**: PASETO (Platform-Agnostic Security Tokens)
**Development API Key**: `"put_something_here"`
**Header Format**: `Authorization: Bearer <token>`
**Admin Access**: Add query parameter `as_admin=true` (requires admin token)

**Email Provider**: Resend (for verification emails, invitations)
- Requires `RESEND_API_KEY` environment variable
- See `EMAIL_MIGRATION.md` for details

## Configuration Files

- **`.pre-commit-config.yaml`**: Pre-commit hook configuration
- **`flake.nix`**: Nix environment with Rust, Node.js, PostgreSQL
- **`Justfile`**: Task automation recipes
- **`api/Rocket.toml`**: Rocket web framework config
- **`api/rust-toolchain.toml`**: Rust version (1.87.0)
- **`frontend/vite.config.ts`**: Vite build and dev server config
- **`frontend/eslint.config.mjs`**: ESLint rules (flat config format)
- **`frontend/tsconfig.json`**: TypeScript compiler options
- **`.gitignore`**: Excludes: `node_modules`, `.cargo`, `.vscode/`, etc.

## Quick Reference: Command Sequence for Common Tasks

### Making a code change

```bash
# 1. Activate Nix environment
nix develop --impure

# 2. Make your changes to files

# 3. If backend changes, build and test
cd api && cargo build && cargo test

# 4. If frontend changes, build and test
cd frontend && npm install && npm test -- --run && npm run build

# 5. If database schema changed, update SQLx metadata
just update-sqlx

# 6. Run pre-commit checks
pre-commit run --all-files

# 7. Fix any issues, then commit
git add .
git commit -m "Your message"
```

### Adding a database migration

```bash
# 1. In Nix shell
nix develop --impure

# 2. Create migration
just migrate-add my_feature_name

# 3. Edit api/migrations/<timestamp>_my_feature_name.up.sql
# 4. Edit api/migrations/<timestamp>_my_feature_name.down.sql

# 5. Start API to create database
cargo shuttle run --working-directory api

# 6. Apply migration (in another terminal)
just migrate-run

# 7. Update SQLx metadata
just update-sqlx

# 8. Test your changes
cd api && cargo test
```

### Running the full stack locally

```bash
# Terminal 1: Nix shell and run everything
nix develop --impure
just dev

# This runs both API and frontend with auto-reload
# API: http://localhost:8000
# Frontend: http://localhost:3000
```

## Key Dependencies

**Backend (Rust)**:
- rocket 0.5.0 - Web framework
- shuttle-* 0.57.0 - Deployment platform
- sqlx 0.8.6 - Database access
- rusty_paseto 0.8.0 - Authentication
- rocket_okapi - OpenAPI documentation
- resend-rs 0.19 - Email sending

**Frontend (JavaScript/TypeScript)**:
- react 19.1.0 - UI library
- @mui/material 7.1.0 - Component library
- vite 6.3.5 - Build tool
- vitest 3.1.4 - Testing framework
- @pact-foundation/pact 15.0.1 - Contract testing
- typescript 5.8.3 - Type checking

## Final Notes

- **Always work in the Nix shell** - system tools won't work correctly
- **Always run pre-commit checks** before committing to avoid CI failures
- **npm install takes a long time** - be patient with Pact downloads
- **Trust the Justfile** - use `just` commands instead of remembering complex sequences
- **SQLx needs metadata** - run `just update-sqlx` after query/schema changes
- **Clippy is strict** - no unwrap(), use proper error handling
- If a command fails and you're not in the Nix shell, **activate it first**
- Check GitHub Actions if CI fails - the workflows show exactly what runs
