# caLANdar

[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/lewisoaten/caLANdar/main.svg)](https://results.pre-commit.ci/latest/github/lewisoaten/caLANdar/main)
[![Netlify Status](https://api.netlify.com/api/v1/badges/a560385c-7546-4e48-8a1e-7e4d67ac0a1e/deploy-status)](https://app.netlify.com/sites/calandar/deploys)

Web application for helping organising LAN parties.

## Development

### Running

#### Local Development

The API runs in standalone mode and uses a local PostgreSQL database via docker-compose.

Rust api can be launched with:
`just dev-api`

This will:

1. Start a PostgreSQL database using docker-compose
2. Run database migrations
3. Start the API with auto-reload on code changes

You can also run the API directly (after starting the database):

```sh
# Start database
docker-compose up -d db

# Set required environment variables
export DATABASE_URL="postgres://postgres:password@localhost:5432/calandar"
export PASETO_SECRET_KEY="wubbalubbadubdubwubbalubbadubdub"
export RESEND_API_KEY="re_test_key"
export STEAM_API_KEY="test_steam_key"

# Run the API
cd api && cargo run
```

#### Frontend

React frontend can be launched with:
`REACT_APP_API_PROXY=http://localhost:8080 npm start`

Or using Just:
`just dev-frontend`

## Deployment

CaLANdar is deployed to Google Cloud Run for both production and staging environments:

1. **Production** - Deployed from the `main` branch to `calandar-api-production`
2. **Staging** - Deployed from `main` or `staging` branches to `calandar-api-staging`

### Cloud Run Production Deployment

**Production deployments are automatic**: Every push to the `main` branch triggers a Cloud Run production deployment via GitHub Actions (`.github/workflows/cloudrun-production.yml`).

The workflow performs these steps:

1. **Build & Test**: Compiles the Rust backend and runs all tests
2. **Docker Build**: Creates a production Docker image using `api/Dockerfile.cloudrun`
3. **Push to Artifact Registry**: Uploads the image to Google Artifact Registry
4. **Deploy to Production**: Deploys to a Cloud Run service named `calandar-api-production`
5. **Health Check**: Verifies the `/api/healthz` endpoint responds correctly
6. **Traffic Migration**: Routes 100% traffic to the new revision only after health checks pass
7. **Rollback**: Automatically rolls back to the previous revision if health checks fail

#### Required GitHub Secrets

To enable Cloud Run production deployments, configure these secrets in your GitHub repository:

**GCP Authentication Secrets:**

- `GCP_PROJECT_ID`: Your Google Cloud project ID
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: Workload Identity Provider for GitHub Actions
- `GCP_SERVICE_ACCOUNT`: Service account email for deployments

**Application Runtime Secrets:**

These secrets are stored in GitHub and automatically upserted to Google Cloud Secret Manager during deployment:

- `DATABASE_URL_PRODUCTION`: PostgreSQL connection string for production (Supabase database)
- `PASETO_SECRET_KEY`: Secret key for PASETO token signing
- `RESEND_API_KEY`: API key for Resend email service
- `STEAM_API_KEY`: Steam API key for game data

**Note**: The workflow automatically creates or updates these secrets in Google Cloud Secret Manager using the values from GitHub Secrets. The service account referenced by `GCP_SERVICE_ACCOUNT` must have either the `roles/secretmanager.admin` role, or at minimum both `roles/secretmanager.secretAccessor` (to read) and `roles/secretmanager.secretVersionAdder` (to create/update) so that these operations succeed. Additionally, the Cloud Run service's runtime service account needs `roles/secretmanager.secretAccessor` to access these secrets at runtime. The database is hosted on Supabase, not Cloud SQL.

**For local development**: Copy `.env.example` to `.env` and fill in your values. The `.env` file is loaded automatically by Just commands and is excluded from git to keep secrets safe.

### Cloud Run Staging Deployment

**Automated staging deployments**: The repository includes a GitHub Actions workflow (`.github/workflows/cloudrun-staging.yml`) that automatically builds, tests, and deploys the backend to a Google Cloud Run staging environment.

#### Using Just Commands Locally

Developers can run the same deployment commands locally using Just:

```sh
# Create .env file from example (one-time setup)
cp .env.example .env

# Edit .env file with your actual values
# Required variables:
#   GCP_PROJECT_ID, DATABASE_URL, PASETO_SECRET_KEY,
#   RESEND_API_KEY, STEAM_API_KEY
# Optional: GCP_REGION, SERVICE_NAME, IMAGE_NAME

# Authenticate with GCP (one-time setup)
gcloud auth login

# Option 1 (recommended): impersonate the same service account used in CI/CD
# This keeps local permissions aligned with GitHub Actions (WIF) configuration.
# Replace with your actual CI/CD service account email from GCP_SERVICE_ACCOUNT secret
# gcloud auth application-default login --impersonate-service-account="ci-cd-sa@PROJECT_ID.iam.gserviceaccount.com"

# Option 2: use your own account for Application Default Credentials (ADC)
# If you use this option, ensure your account has at least:
#   - Secret Manager Admin (or secretAccessor + secretVersionAdder)
#   - Artifact Registry Writer
#   - Cloud Run Admin
gcloud auth application-default login

# Deploy using Just commands (same as CI)
# The .env file is loaded automatically by Just
just cloudrun-upsert-secrets          # Upload secrets to Secret Manager
just cloudrun-build-push              # Build and push Docker image
just cloudrun-deploy IMAGE_URL        # Deploy to Cloud Run
just cloudrun-health-check REVISION   # Run health check
just cloudrun-migrate-traffic REVISION # Migrate traffic
just cloudrun-verify-service          # Verify deployment
```

**Note**: The `.env` file is automatically loaded by Just commands, so you don't need to export environment variables manually. This keeps secrets out of your command history.

This ensures parity between local development and CI/CD deployment workflows.

### Cloud Run Staging Deployment

The staging environment works similarly to production but deploys to `calandar-api-staging`. The workflow (`.github/workflows/cloudrun-staging.yml`) triggers on:

- **Push to `main` or `staging` branches** (when API files change)
- **Pull requests to `main`** (build and test only, no deployment)
- **Manual trigger** via GitHub Actions UI

#### Testing the Staging Environment

After a successful deployment, you can test the staging API:

```sh
# Get the staging URL from the workflow logs or Cloud Run console
STAGING_URL="https://calandar-api-staging-<hash>-uc.a.run.app"

# Test the health endpoint
curl "${STAGING_URL}/api/healthz"
# Should return HTTP 204 (No Content)

# Test other API endpoints (example)
curl "${STAGING_URL}/api/events" \
  -H "Authorization: Bearer <your-token>"
```

#### Rollback Mechanism

Both production and staging workflows include automatic rollback protection:

- If the new revision fails health checks, traffic remains on the previous revision
- The workflow automatically reverts to the last known good revision
- The failed revision remains available for debugging but receives no traffic
- Rollback verification ensures the previous revision is healthy

### Manual Cloud Run Deployment

For deploying to Google Cloud Run manually or to other container platforms:

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
# Ensure database is running
docker-compose up -d db

export DATABASE_URL="postgres://postgres:password@localhost:5432/calandar"

cargo sqlx prepare --merged
```

If you have modified the migration scripts during development, you can rollback, and then reapply them with the following commands:

```sh
cargo sqlx migrate revert
cargo sqlx migrate run
```
