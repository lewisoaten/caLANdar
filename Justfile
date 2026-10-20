# Load environment variables from .env file if it exists (for local development)
set dotenv-load := true

# Local ports: override with e.g. `PORT=55555 DB_PORT=55432 just dev`.
# DB_PORT is exported so docker-compose publishes the database on it.
API_PORT := env_var_or_default("PORT", "8080")
export DB_PORT := env_var_or_default("DB_PORT", "5432")

# Local development database URL
LOCAL_DB_URL := "postgres://postgres:password@localhost:" + DB_PORT + "/calandar"

default:
  just --list

dev:
	#!/usr/bin/env bash
	set -euxo pipefail
	echo 'Building and serving...'
	(trap 'kill 0' SIGINT; just dev-api & just dev-frontend)

dev-api:
    #!/usr/bin/env bash
    set -euxo pipefail
    echo "Starting local PostgreSQL with docker-compose..."
    docker-compose up -d db

    # Wait for database to be ready
    echo "Waiting for PostgreSQL to be ready..."
    until docker-compose exec -T db pg_isready -U postgres > /dev/null 2>&1; do
        echo "Waiting for database..."
        sleep 1
    done

    export DATABASE_URL="{{LOCAL_DB_URL}}"
    export PORT="{{API_PORT}}"
    export PASETO_SECRET_KEY="${PASETO_SECRET_KEY:-wubbalubbadubdubwubbalubbadubdub}"
    # Without a real Resend key, log emails (and sign-in links) instead of sending.
    if [[ -z "${RESEND_API_KEY:-}" ]]; then export EMAIL_TO_LOG="${EMAIL_TO_LOG:-1}"; fi
    export RESEND_API_KEY="${RESEND_API_KEY:-re_test_key}"
    export STEAM_API_KEY="${STEAM_API_KEY:-test_steam_key}"
    # caLANdar Live: local-only simulators and the seed (never set in prod).
    export LIVE_DEV_TOOLS="${LIVE_DEV_TOOLS:-1}"

    echo "Running migrations..."
    cd api && cargo sqlx migrate run --database-url "${DATABASE_URL}"

    echo "Starting API with cargo watch..."
    cargo watch --quiet --clear --exec 'run'

# caLANdar Live: seed a local event that is running now (see docs/live-event/TESTING.md)
live-seed:
	cd api && DATABASE_URL="{{LOCAL_DB_URL}}" LIVE_DEV_TOOLS=1 cargo run -q -- dev-seed-live

# caLANdar Live: print an API token (and a localStorage snippet) for an email
live-token email:
	cd api && PASETO_SECRET_KEY="${PASETO_SECRET_KEY:-wubbalubbadubdubwubbalubbadubdub}" cargo run -q -- dev-token {{email}}

dev-frontend:
    cd frontend && npm install && REACT_APP_API_PROXY=http://localhost:{{API_PORT}} npm start

dev-storybook:
	cd frontend && npm install && npm run storybook

migrate-info:
	#!/usr/bin/env bash
	set -euxo pipefail
	# Ensure database is running
	docker-compose up -d db
	cd api && cargo sqlx migrate info --database-url "{{LOCAL_DB_URL}}"

migrate-add name:
	cd api && cargo sqlx migrate add -r {{name}}

migrate-run:
	#!/usr/bin/env bash
	set -euxo pipefail
	# Ensure database is running
	docker-compose up -d db
	cd api && cargo sqlx migrate run --database-url "{{LOCAL_DB_URL}}"

migrate-revert:
	#!/usr/bin/env bash
	set -euxo pipefail
	# Ensure database is running
	docker-compose up -d db
	cd api && cargo sqlx migrate revert --database-url "{{LOCAL_DB_URL}}"

update-sqlx:
	#!/usr/bin/env bash
	set -euxo pipefail
	# Ensure database is running
	docker-compose up -d db
	cd api && cargo sqlx prepare --database-url "{{LOCAL_DB_URL}}" -- --all-targets

bacon:
	cd api && bacon

api-test:
	cd api && cargo test

clippy:
	pre-commit run clippy

pre-commit:
	pre-commit run --all-files

frontend-install:
	cd frontend && npm install

frontend-install-ci:
	cd frontend && npm ci

frontend-test:
	cd frontend && npm test -- --run

frontend-build:
	cd frontend && npm run build

pact-api:
	#!/usr/bin/env bash
	set -euxo pipefail
	# Ensure database is running
	docker-compose up -d db

	export DATABASE_URL="{{LOCAL_DB_URL}}"
	export PASETO_SECRET_KEY="${PASETO_SECRET_KEY:-wubbalubbadubdubwubbalubbadubdub}"
	export RESEND_API_KEY="${RESEND_API_KEY:-re_test_key}"
	export STEAM_API_KEY="${STEAM_API_KEY:-test_steam_key}"

	cd api && cargo run &
	PID=$!
	trap "kill ${PID}" EXIT

	echo "Wait for the server to start..."
	counter=0
	until [[ $(curl -I -s -o /dev/null -w "%{http_code}" localhost:8080/api/healthz) =~ "204" ]] || [[ $counter -gt 10 ]]; do
		sleep 1s
		(( counter=counter+1 ))
		echo "Counter: ${counter}"
	done

	pact_verifier_cli --header Authorization="Bearer put_something_here" --port 8080 --dir ./frontend/pacts

pact-frontend:
	cd frontend && npm install && npm run test:pact

# Cloud Run Docker commands
docker-build-cloudrun:
	docker build -f api/Dockerfile.cloudrun -t calandar-api:latest api/

docker-run-cloudrun:
	#!/usr/bin/env bash
	set -euxo pipefail
	echo "Running Cloud Run compatible image locally..."
	echo "Make sure to set DATABASE_URL, PASETO_SECRET_KEY, RESEND_API_KEY, and STEAM_API_KEY environment variables"
	docker run -p 8080:8080 \
		-e DATABASE_URL="${DATABASE_URL}" \
		-e PASETO_SECRET_KEY="${PASETO_SECRET_KEY}" \
		-e RESEND_API_KEY="${RESEND_API_KEY}" \
		-e STEAM_API_KEY="${STEAM_API_KEY}" \
		-e RUST_LOG=info \
		calandar-api:latest

# Cloud Run staging deployment commands
# These commands implement the full deployment pipeline for Cloud Run staging

# Build and push Docker image to Google Artifact Registry
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), IMAGE_TAG (default: git short hash)
cloudrun-build-push image_tag=`git rev-parse --short HEAD`:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	IMAGE_NAME="${IMAGE_NAME:-calandar-api}"
	IMAGE_TAG="{{ image_tag }}"
	REPOSITORY_NAME="calandar"
	IMAGE_URL="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPOSITORY_NAME}/${IMAGE_NAME}:${IMAGE_TAG}"
	LATEST_URL="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPOSITORY_NAME}/${IMAGE_NAME}:latest"

	echo "Building and pushing Docker image..."
	echo "Image URL: ${IMAGE_URL}"

	# Build the Docker image
	docker build \
		-f api/Dockerfile.cloudrun \
		-t "${IMAGE_URL}" \
		-t "${LATEST_URL}" \
		api/

	# Ensure Artifact Registry repository exists
	echo "Checking if Artifact Registry repository exists..."
	if ! gcloud artifacts repositories describe "${REPOSITORY_NAME}" \
		--location="${GCP_REGION}" \
		--project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
		echo "Repository ${REPOSITORY_NAME} does not exist. Creating..."
		gcloud artifacts repositories create "${REPOSITORY_NAME}" \
			--repository-format=docker \
			--location="${GCP_REGION}" \
			--project="${GCP_PROJECT_ID}" \
			--description="Docker repository for CaLANdar application"
		echo "✅ Repository ${REPOSITORY_NAME} created successfully"
	else
		echo "✅ Repository ${REPOSITORY_NAME} already exists"
	fi

	# Configure Docker for Artifact Registry
	gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

	# Push both tags
	docker push "${IMAGE_URL}"
	docker push "${LATEST_URL}"

	# Get and display image digest
	DIGEST=$(docker inspect --format='{{{{index .RepoDigests 0}}}}' "${IMAGE_URL}" | cut -d'@' -f2)
	if [ -z "${DIGEST}" ]; then
		echo "Failed to retrieve image digest for ${IMAGE_URL}" >&2
		exit 1
	fi
	echo "Image digest: ${DIGEST}"
	echo "image-url=${IMAGE_URL}" >> ${GITHUB_OUTPUT:-/dev/null}
	echo "image-digest=${DIGEST}" >> ${GITHUB_OUTPUT:-/dev/null}

# Upsert secrets to Google Cloud Secret Manager
# Required env vars: GCP_PROJECT_ID, DATABASE_URL, PASETO_SECRET_KEY, RESEND_API_KEY, STEAM_API_KEY
cloudrun-upsert-secrets:
	#!/usr/bin/env bash
	set -euo pipefail
	echo "Upserting secrets to Google Cloud Secret Manager..."

	# Function to create or update a secret
	upsert_secret() {
		local secret_name=$1
		local secret_value=$2

		if gcloud secrets describe "${secret_name}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
			echo "Updating existing secret: ${secret_name}"
			echo -n "${secret_value}" | gcloud secrets versions add "${secret_name}" \
				--project="${GCP_PROJECT_ID}" \
				--data-file=-
		else
			echo "Creating new secret: ${secret_name}"
			echo -n "${secret_value}" | gcloud secrets create "${secret_name}" \
				--project="${GCP_PROJECT_ID}" \
				--data-file=-
		fi
	}

	upsert_secret "DATABASE_URL" "${DATABASE_URL}"
	upsert_secret "PASETO_SECRET_KEY" "${PASETO_SECRET_KEY}"
	upsert_secret "RESEND_API_KEY" "${RESEND_API_KEY}"
	upsert_secret "STEAM_API_KEY" "${STEAM_API_KEY}"

	echo "✅ Secrets upserted successfully"

# Deploy to Cloud Run staging
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), SERVICE_NAME (default: calandar-api-staging), IMAGE_URL
cloudrun-deploy image_url:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	SERVICE_NAME="${SERVICE_NAME:-calandar-api-staging}"
	IMAGE_URL="{{ image_url }}"
	# Tag used to route traffic to the newly created revision for health checks
	DEPLOY_TAG="${DEPLOY_TAG:-candidate}"

	echo "Deploying to Cloud Run staging..."
	echo "Service: ${SERVICE_NAME}"
	echo "Region: ${GCP_REGION}"
	echo "Image: ${IMAGE_URL}"

	# Check if service exists
	SERVICE_EXISTS=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(metadata.name)' 2>/dev/null || echo "")

	# Get current revision for potential rollback (only if service exists)
	if [ -n "${SERVICE_EXISTS}" ]; then
		CURRENT_REVISION=$(gcloud run services describe "${SERVICE_NAME}" \
			--region "${GCP_REGION}" \
			--project "${GCP_PROJECT_ID}" \
			--format 'value(status.latestReadyRevisionName)' 2>/dev/null || echo "none")
		echo "Current revision: ${CURRENT_REVISION}"
		NO_TRAFFIC_FLAG="--no-traffic"
	else
		echo "Service does not exist yet, creating new service"
		CURRENT_REVISION="none"
		NO_TRAFFIC_FLAG=""
	fi

	# The Steam game cache refresh runs as a Cloud Run Job (same image), so it is
	# billed only while it runs and doesn't need CPU kept allocated to the service
	# between requests. The service starts it (see controllers::game::start_update).
	REFRESH_JOB_NAME="${SERVICE_NAME}-steam-refresh"
	gcloud run jobs deploy "${REFRESH_JOB_NAME}" \
		--image "${IMAGE_URL}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--command /app/calandar-api \
		--args refresh-steam-games \
		--set-env-vars "RUST_LOG=info" \
		--set-secrets "DATABASE_URL=DATABASE_URL:latest,STEAM_API_KEY=STEAM_API_KEY:latest" \
		--max-retries 0 \
		--task-timeout 15m \
		--memory 512Mi \
		--cpu 1

	# Let the service's identity start the job (idempotent). Best effort: if the
	# deployer can't set IAM, grant roles/run.developer on the job to the
	# service account by hand; until then refreshes report "Couldn't start".
	SERVICE_ACCOUNT=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(spec.template.spec.serviceAccountName)' 2>/dev/null || echo "")
	if [ -z "${SERVICE_ACCOUNT}" ]; then
		PROJECT_NUMBER=$(gcloud projects describe "${GCP_PROJECT_ID}" --format 'value(projectNumber)')
		SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
	fi
	gcloud run jobs add-iam-policy-binding "${REFRESH_JOB_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--member "serviceAccount:${SERVICE_ACCOUNT}" \
		--role roles/run.developer \
		|| echo "WARNING: could not grant ${SERVICE_ACCOUNT} permission to run ${REFRESH_JOB_NAME}"

	# caLANdar Live secrets, created on first deploy (best effort: the deployer
	# may lack Secret Manager permissions):
	# - LIVE_TICK_SECRET authorises Cloud Scheduler's backstop tick (§3.6);
	# - VAPID_PRIVATE_KEY signs Web Push (§8), on both services, since the
	#   stream instance's ticks send pushes too;
	# - GOOGLE_PLACES_API_KEY (optional, add it by hand) turns on food search.
	ensure_secret() {
		if ! gcloud secrets describe "$1" --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
			head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n' | gcloud secrets create "$1" \
				--project "${GCP_PROJECT_ID}" --data-file=- >/dev/null \
				|| echo "WARNING: could not create $1"
		fi
	}
	has_secret() { gcloud secrets describe "$1" --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; }
	ensure_secret LIVE_TICK_SECRET
	ensure_secret VAPID_PRIVATE_KEY
	LIVE_SECRETS=""
	PUSH_SECRET=""
	if has_secret LIVE_TICK_SECRET; then LIVE_SECRETS="${LIVE_SECRETS},LIVE_TICK_SECRET=LIVE_TICK_SECRET:latest"; fi
	if has_secret VAPID_PRIVATE_KEY; then PUSH_SECRET=",VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest"; fi
	if has_secret GOOGLE_PLACES_API_KEY; then LIVE_SECRETS="${LIVE_SECRETS},GOOGLE_PLACES_API_KEY=GOOGLE_PLACES_API_KEY:latest"; fi

	# caLANdar Live streams are served by a dedicated service from the same
	# image (docs/live-event/DESIGN.md §3.8): long request timeout for SSE,
	# high concurrency (an open stream costs a task, not a thread), scale to
	# zero when nobody is watching, and at most two instances so there is
	# effectively one stream instance doing the live ticks. The API service
	# below keeps its 60s timeout. Streams hold no pooled connection; each
	# instance has one LISTEN connection (session pooler, port 5432).
	LIVE_SERVICE_NAME="${SERVICE_NAME}-live"
	gcloud run deploy "${LIVE_SERVICE_NAME}" \
		--image "${IMAGE_URL}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--platform managed \
		--allow-unauthenticated \
		--port 8080 \
		--command /app/calandar-api \
		--args serve-live \
		--set-env-vars "RUST_LOG=info" \
		--set-secrets "DATABASE_URL=DATABASE_URL:latest,PASETO_SECRET_KEY=PASETO_SECRET_KEY:latest,STEAM_API_KEY=STEAM_API_KEY:latest${PUSH_SECRET}" \
		--min-instances 0 \
		--max-instances 2 \
		--concurrency 1000 \
		--memory 512Mi \
		--cpu 1 \
		--timeout 3600
	LIVE_STREAM_ORIGIN=$(gcloud run services describe "${LIVE_SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.url)')
	echo "Live stream origin: ${LIVE_STREAM_ORIGIN}"

	# Deploy to Cloud Run (with or without --no-traffic depending on whether service exists)
	gcloud run deploy "${SERVICE_NAME}" \
		--image "${IMAGE_URL}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--platform managed \
		--allow-unauthenticated \
		--port 8080 \
		--set-env-vars "RUST_LOG=info,STEAM_REFRESH_JOB=projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/jobs/${REFRESH_JOB_NAME},LIVE_STREAM_ORIGIN=${LIVE_STREAM_ORIGIN}" \
		--set-secrets "DATABASE_URL=DATABASE_URL:latest,PASETO_SECRET_KEY=PASETO_SECRET_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest,STEAM_API_KEY=STEAM_API_KEY:latest${LIVE_SECRETS}${PUSH_SECRET}" \
		--min-instances 0 \
		--max-instances 10 \
		--memory 512Mi \
		--cpu 1 \
		--timeout 60s \
		${NO_TRAFFIC_FLAG}

	# Get the new revision name
	NEW_REVISION=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.latestCreatedRevisionName)')

	# Get service URL
	SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.url)')

	if has_secret LIVE_TICK_SECRET; then
		# The recipe traces commands (set -x): keep the secret out of the logs.
		set +x
		TICK_SECRET=$(gcloud secrets versions access latest --secret LIVE_TICK_SECRET --project "${GCP_PROJECT_ID}")
		TICK_JOB="${SERVICE_NAME}-live-tick"
		SCHEDULER_ARGS=(--project "${GCP_PROJECT_ID}" --location "${GCP_REGION}" --schedule "* * * * *" \
			--uri "${SERVICE_URL}/api/internal/live/tick" --http-method POST \
			--headers "X-Live-Tick-Secret=${TICK_SECRET}" --attempt-deadline 60s)
		gcloud scheduler jobs update http "${TICK_JOB}" "${SCHEDULER_ARGS[@]}" >/dev/null 2>&1 \
			|| gcloud scheduler jobs create http "${TICK_JOB}" "${SCHEDULER_ARGS[@]}" >/dev/null \
			|| echo "WARNING: could not set up the Cloud Scheduler job ${TICK_JOB}"
		set -x
	fi

	# Create/Update a traffic tag that points at the new revision.
	# This gives us a stable, direct URL to the new revision for health checks.
	gcloud run services update-traffic "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--update-tags "${DEPLOY_TAG}=${NEW_REVISION}"

	TAG_URL=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format="value(status.traffic[?tag='${DEPLOY_TAG}'].url)")

	# Fallback: if the formatter fails, construct tag URL from the service URL.
	# Tag URLs are of the form: https://<tag>---<service-host>
	if [ -z "${TAG_URL}" ]; then
		SERVICE_HOST="${SERVICE_URL#https://}"
		SERVICE_HOST="${SERVICE_HOST%/}"
		TAG_URL="https://${DEPLOY_TAG}---${SERVICE_HOST}"
	fi

	echo "✅ Deployed revision: ${NEW_REVISION}"
	echo "Service URL: ${SERVICE_URL}"
	echo "Tag (${DEPLOY_TAG}) URL: ${TAG_URL}"
	echo "revision=${NEW_REVISION}" >> ${GITHUB_OUTPUT:-/dev/null}
	echo "previous-revision=${CURRENT_REVISION}" >> ${GITHUB_OUTPUT:-/dev/null}
	echo "service-url=${SERVICE_URL}" >> ${GITHUB_OUTPUT:-/dev/null}
	echo "tag-url=${TAG_URL}" >> ${GITHUB_OUTPUT:-/dev/null}
	echo "deploy-tag=${DEPLOY_TAG}" >> ${GITHUB_OUTPUT:-/dev/null}

# Run health check on a specific revision (via its traffic tag URL)
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), SERVICE_NAME (default: calandar-api-staging), REVISION_NAME
cloudrun-health-check revision_name:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	SERVICE_NAME="${SERVICE_NAME:-calandar-api-staging}"
	REVISION_NAME="{{ revision_name }}"
	DEPLOY_TAG="${DEPLOY_TAG:-candidate}"

	echo "Running health check on revision: ${REVISION_NAME}"
	sleep 10

	# Health check the candidate revision via its traffic tag URL.
	CHECK_URL=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format="value(status.traffic[?tag='${DEPLOY_TAG}'].url)")

	# Fallback: construct tag URL from the service URL if needed.
	if [ -z "${CHECK_URL}" ]; then
		SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
			--region "${GCP_REGION}" \
			--project "${GCP_PROJECT_ID}" \
			--format='value(status.url)')

		if [ -z "${SERVICE_URL}" ]; then
			echo "Failed to obtain service URL for ${SERVICE_NAME} while constructing fallback tag URL (tag: ${DEPLOY_TAG})" >&2
			echo "--- Service description ---" >&2
			gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --project "${GCP_PROJECT_ID}" --format=json >&2 || true
			exit 1
		fi

		SERVICE_HOST="${SERVICE_URL#https://}"
		SERVICE_HOST="${SERVICE_HOST%/}"

		if [ -z "${SERVICE_HOST}" ]; then
			echo "Derived empty service host from SERVICE_URL='${SERVICE_URL}' while constructing fallback tag URL (tag: ${DEPLOY_TAG})" >&2
			echo "--- Service description ---" >&2
			gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --project "${GCP_PROJECT_ID}" --format=json >&2 || true
			exit 1
		fi

		CHECK_URL="https://${DEPLOY_TAG}---${SERVICE_HOST}"
	fi

	if [ -z "${CHECK_URL}" ]; then
		echo "Failed to obtain tag URL for revision ${REVISION_NAME} (tag: ${DEPLOY_TAG})" >&2
		echo "--- Service traffic status ---" >&2
		gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --project "${GCP_PROJECT_ID}" --format=json >&2 || true
		exit 1
	fi

	echo "Testing revision via tag URL: ${CHECK_URL}"

	# Health check with retries
	MAX_RETRIES=10
	RETRY_COUNT=0
	HEALTH_CHECK_PASSED=false

	while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
		HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${CHECK_URL}/api/healthz" || echo "000")
		echo "Attempt $((RETRY_COUNT + 1)): Health check returned HTTP ${HTTP_CODE}"

		if [ "${HTTP_CODE}" = "204" ]; then
			echo "✅ Health check passed!"
			HEALTH_CHECK_PASSED=true
			break
		fi

		RETRY_COUNT=$((RETRY_COUNT + 1))
		if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
			echo "Retrying in 5 seconds..."
			sleep 5
		fi
	done

	if [ "${HEALTH_CHECK_PASSED}" = "false" ]; then
		echo "❌ Health check failed after ${MAX_RETRIES} attempts" >&2
		echo "--- Cloud Run diagnostics ---" >&2
		gcloud run revisions describe "${REVISION_NAME}" --region "${GCP_REGION}" --project "${GCP_PROJECT_ID}" >&2 || true
		gcloud run services describe "${SERVICE_NAME}" --region "${GCP_REGION}" --project "${GCP_PROJECT_ID}" >&2 || true
		exit 1
	fi

# Migrate traffic to a specific revision
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), SERVICE_NAME (default: calandar-api-staging), REVISION_NAME
cloudrun-migrate-traffic revision_name:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	SERVICE_NAME="${SERVICE_NAME:-calandar-api-staging}"
	REVISION_NAME="{{ revision_name }}"
	DEPLOY_TAG="${DEPLOY_TAG:-candidate}"

	echo "Migrating 100% traffic to revision: ${REVISION_NAME}"
	gcloud run services update-traffic "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--to-revisions "${REVISION_NAME}=100"

	# Cleanup: remove the candidate tag once the revision is promoted.
	# This prevents a lingering tag URL from continuing to route to an old revision.
	gcloud run services update-traffic "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--remove-tags "${DEPLOY_TAG}" || true

	echo "✅ Traffic migration complete"

# Verify service health after traffic migration
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), SERVICE_NAME (default: calandar-api-staging)
cloudrun-verify-service:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	SERVICE_NAME="${SERVICE_NAME:-calandar-api-staging}"

	echo "Running final verification..."
	sleep 5

	SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.url)')

	HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/healthz" || echo "000")

	if [ "${HTTP_CODE}" = "204" ]; then
		echo "✅ Service is healthy at ${SERVICE_URL}"
	else
		echo "❌ Service verification failed with HTTP ${HTTP_CODE}" >&2
		exit 1
	fi

# Rollback to a previous revision
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), SERVICE_NAME (default: calandar-api-staging), PREVIOUS_REVISION
cloudrun-rollback previous_revision:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	SERVICE_NAME="${SERVICE_NAME:-calandar-api-staging}"
	PREVIOUS_REVISION="{{ previous_revision }}"

	echo "⚠️ Rolling back to previous revision: ${PREVIOUS_REVISION}"

	gcloud run services update-traffic "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--to-revisions "${PREVIOUS_REVISION}=100"

	echo "✅ Rollback complete"

	# Verify rollback
	sleep 5
	SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.url)')

	HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/healthz" || echo "000")

	if [ "${HTTP_CODE}" = "204" ]; then
		echo "✅ Rollback successful! Service is healthy"
	else
		echo "⚠️ Warning: Service may still be unhealthy after rollback (HTTP ${HTTP_CODE})"
	fi

# Shorthand: Deploy current commit to Cloud Run staging (builds, pushes, deploys, health checks, migrates traffic)
# Required env vars: GCP_PROJECT_ID, GCP_REGION (default: us-central1), SERVICE_NAME (default: calandar-api-staging), DATABASE_URL, PASETO_SECRET_KEY, RESEND_API_KEY, STEAM_API_KEY
cloudrun-deploy-current:
	#!/usr/bin/env bash
	set -euxo pipefail
	GCP_REGION="${GCP_REGION:-us-central1}"
	IMAGE_NAME="${IMAGE_NAME:-calandar-api}"
	IMAGE_TAG=$(git rev-parse --short HEAD)
	REPOSITORY_NAME="calandar"
	IMAGE_URL="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPOSITORY_NAME}/${IMAGE_NAME}:${IMAGE_TAG}"

	echo "🚀 Deploying current commit to Cloud Run staging..."
	echo "Image tag: ${IMAGE_TAG}"

	# Build and push
	just cloudrun-build-push "${IMAGE_TAG}"

	# Upsert secrets
	just cloudrun-upsert-secrets

	# Deploy
	just cloudrun-deploy "${IMAGE_URL}"

	# Extract revision name from output (stored in GITHUB_OUTPUT or temp file)
	REVISION=$(gcloud run services describe "${SERVICE_NAME:-calandar-api-staging}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.latestCreatedRevisionName)')

	echo "New revision: ${REVISION}"

	# Check if service was just created (first deployment)
	SERVICE_REVISIONS=$(gcloud run revisions list \
		--service "${SERVICE_NAME:-calandar-api-staging}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(metadata.name)' | wc -l)

	# Also check if any revision currently has traffic
	TRAFFIC_REVISIONS=$(gcloud run services describe "${SERVICE_NAME:-calandar-api-staging}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--format 'value(status.traffic[].revisionName)' | wc -l)

	if [ "${SERVICE_REVISIONS}" -eq 1 ] || [ "${TRAFFIC_REVISIONS}" -eq 0 ]; then
		echo "First deployment detected (revisions: ${SERVICE_REVISIONS}, with traffic: ${TRAFFIC_REVISIONS}) - service already has 100% traffic"
		just cloudrun-verify-service
	else
		# Health check
		just cloudrun-health-check "${REVISION}"

		# Migrate traffic
		just cloudrun-migrate-traffic "${REVISION}"

		# Verify
		just cloudrun-verify-service
	fi

	echo "✅ Deployment complete!"
