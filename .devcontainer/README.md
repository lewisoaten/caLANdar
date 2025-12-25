# CaLANdar Dev Container

This directory contains the development container configuration for CaLANdar.

## What's Included

- **Base Image**: Ubuntu 22.04
- **Docker-in-Docker**: Full Docker support for running local PostgreSQL database
- **Nix**: Installed with flakes support for reproducible development environment
- **Automatic Environment**: Nix development shell activated automatically in all terminals
- **VS Code Extensions**: Rust, TypeScript, and development tools
- **Port Forwarding**:
  - 3000: Frontend (React)
  - 8080: API (Rust/Rocket)
  - 6006: Storybook

## Features

The dev container uses these features:

- Git
- GitHub CLI
- Docker-in-Docker (for local PostgreSQL database)
- Nix package manager with flakes support

## Usage

### GitHub Codespaces

1. Go to the repository on GitHub
2. Click the green "Code" button
3. Select "Codespaces" tab
4. Click "Create codespace on main" (or your branch)
5. Wait for the environment to set up (this may take a few minutes on first creation)
6. The Nix development environment will be automatically activated
7. All just commands are immediately available - run `just --list` to see available commands

### VS Code with Dev Containers Extension

1. Install the "Dev Containers" extension in VS Code
2. Open the repository folder
3. When prompted, click "Reopen in Container"
4. Or use Command Palette: "Dev Containers: Reopen in Container"
5. Wait for the container to build and start
6. The Nix development environment will be automatically activated in all new terminals
7. All just commands are immediately available - run `just --list` to see available commands

### Commands Available

The Nix development environment is automatically activated in all terminals, so all just commands work immediately:

```bash
# See all available commands
just --list

# Run the full development environment (includes Docker support for PostgreSQL)
just dev

# Run only the API (now uses docker-compose for PostgreSQL)
just dev-api

# Run only the frontend
just dev-frontend

# Run tests
just pact-frontend
just pact-api
```

### Important Notes

- **No Manual Setup Required**: The Nix development shell is automatically activated when you open a terminal
- **Docker Support**: PostgreSQL database runs via docker-compose
- **All Tools Available**: cargo, just, npm, and all other development tools are in your PATH automatically

## Development Environment

The dev container automatically sets up the same development environment as defined in `flake.nix`, including:

- Rust toolchain (as specified in `api/rust-toolchain.toml`)
- Node.js 22
- PostgreSQL tools
- Cargo tools (cargo-watch, sqlx-cli)
- Just command runner
- Pre-commit hooks
- Docker support for local PostgreSQL

**Key Features:**

- **Automatic Activation**: The Nix development shell is automatically activated in every terminal
- **Docker-in-Docker**: Full Docker support allows PostgreSQL to run via docker-compose
- **Tool Availability**: All development tools are immediately available in your PATH

## Troubleshooting

If you encounter issues:

1. **Tools not available**: All development tools should be automatically available. If not, try opening a new terminal.
2. **Docker issues**: Ensure Docker is running (for local VS Code usage). The dev container includes Docker-in-Docker support.
3. **Container rebuild**: Try rebuilding the container: "Dev Containers: Rebuild Container"
4. **Nix environment**: If the environment isn't loading, check: `which just` should show a Nix store path
5. **Database errors**: With Docker-in-Docker support, `just dev-api` should start PostgreSQL automatically

### Manual Nix Shell (if needed)

In rare cases where automatic activation fails, you can manually enter the Nix shell:

```bash
nix develop --impure
```
