# CaLANdar Dev Container

This directory contains the development container configuration for CaLANdar.

## What's Included

- **Base Image**: Ubuntu 22.04
- **Nix**: Installed with flakes support for reproducible development environment
- **VS Code Extensions**: Rust, TypeScript, and development tools
- **Port Forwarding**:
  - 3000: Frontend (React)
  - 8000: API (Rust/Rocket)
  - 6006: Storybook

## Features

The dev container uses these features:

- Git
- GitHub CLI
- Nix package manager with flakes support

## Usage

### GitHub Codespaces

1. Go to the repository on GitHub
2. Click the green "Code" button
3. Select "Codespaces" tab
4. Click "Create codespace on main" (or your branch)
5. Wait for the environment to set up (this may take a few minutes on first creation)
6. Once ready, open a terminal and run `just --list` to see available commands

### VS Code with Dev Containers Extension

1. Install the "Dev Containers" extension in VS Code
2. Open the repository folder
3. When prompted, click "Reopen in Container"
4. Or use Command Palette: "Dev Containers: Reopen in Container"
5. Wait for the container to build and start
6. Open a terminal and run `just --list` to see available commands

### Commands Available

Once in the dev container, you can run all the just commands:

```bash
# See all available commands
just --list

# Run the full development environment
just dev

# Run only the API
just dev-api

# Run only the frontend
just dev-frontend

# Run tests
just pact-frontend
just pact-api
```

## Development Environment

The dev container automatically sets up the same development environment as defined in `flake.nix`, including:

- Rust toolchain (as specified in `api/rust-toolchain.toml`)
- Node.js 22
- PostgreSQL tools
- Cargo tools (cargo-watch, cargo-shuttle, sqlx-cli)
- Just command runner
- Pre-commit hooks

## Troubleshooting

If you encounter issues:

1. Ensure Docker is running (for local VS Code usage)
2. Try rebuilding the container: "Dev Containers: Rebuild Container"
3. Check that the Nix environment loads: `nix develop --impure -c echo "test"`
4. Verify just commands work: `nix develop --impure -c just --list`
