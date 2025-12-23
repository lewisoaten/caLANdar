# caLANdar

[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/lewisoaten/caLANdar/main.svg)](https://results.pre-commit.ci/latest/github/lewisoaten/caLANdar/main)
[![Netlify Status](https://api.netlify.com/api/v1/badges/a560385c-7546-4e48-8a1e-7e4d67ac0a1e/deploy-status)](https://app.netlify.com/sites/calandar/deploys)

Web application for helping organising LAN parties.

## Development

### Running

#### With Shuttle (default)

Rust api can be launched with:
`cargo shuttle run --working-directory api`

Or using Just:
`just dev-api`

#### Standalone Mode (without Shuttle)

The API can also run in standalone mode without Shuttle, useful for local development or cloud deployments (e.g., Cloud Run):

```sh
# Set required environment variables
export DATABASE_URL="postgres://user:password@localhost:5432/calandar"
export PASETO_SECRET_KEY="your-secret-key"
export RESEND_API_KEY="your-resend-key"
export STEAM_API_KEY="your-steam-key"
export PORT=8080  # Optional, defaults to 8080

# Run in standalone mode
just dev-api-standalone
```

#### Frontend

React frontend can be launched with:
`REACT_APP_API_PROXY=http://localhost:8000 npm start`

Or using Just:
`just dev-frontend`

## Deployment

### Shuttle Deployment

The default deployment uses Shuttle:

```sh
cargo shuttle deploy --working-directory api
```

Secrets should be configured in `api/Secrets.toml` (see `api/Secrets.toml.template`).

### Cloud Run Deployment

For deploying to Google Cloud Run or other container platforms:

#### Build the Docker image

```sh
just docker-build-cloudrun
```

Or manually:

```sh
docker build -f api/Dockerfile.cloudrun -t calandar-api:latest api/
```

#### Run locally with Docker

```sh
# Set environment variables first
export DATABASE_URL="postgres://user:password@host:5432/database"
export PASETO_SECRET_KEY="your-secret-key"
export RESEND_API_KEY="your-resend-key"
export STEAM_API_KEY="your-steam-key"

just docker-run-cloudrun
```

#### Deploy to Cloud Run

```sh
# Tag for Google Container Registry
docker tag calandar-api:latest gcr.io/YOUR_PROJECT_ID/calandar-api:latest

# Push to GCR
docker push gcr.io/YOUR_PROJECT_ID/calandar-api:latest

# Deploy to Cloud Run
gcloud run deploy calandar-api \
  --image gcr.io/YOUR_PROJECT_ID/calandar-api:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL="postgres://..." \
  --set-secrets PASETO_SECRET_KEY=paseto-secret:latest \
  --set-secrets RESEND_API_KEY=resend-api-key:latest \
  --set-secrets STEAM_API_KEY=steam-api-key:latest
```

The Cloud Run image:

- Uses multistage builds for minimal image size
- Runs without Shuttle dependencies
- Configures port via `$PORT` environment variable (defaults to 8080)
- Runs database migrations on startup
- Uses environment variables for all configuration

**Note**: Due to SSL certificate verification issues in some Docker build environments, you may need to build using Cloud Build or a CI/CD environment with proper certificate configuration. For local development and testing, the standalone mode (above) works without Docker.

### SQLx Database Operations

To modify the database, prepare a migration script with:
`sqlx migrate add -r <name>`

When a query or database schema is modified, you will need to prepare the `sqlx-data.json` file. This can be performed after launching the application from within the `api/` directory with:

```sh
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')/postgres"

cargo sqlx prepare --merged -- --all-targets --all-features
```

If you have modified the migration scripts during development, you can rollback, and then reapply them with the following commands:

```sh
cargo sqlx migrate revert
cargo sqlx migrate run
```
