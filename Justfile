# Load environment variables from .env file if it exists (for local development)
set dotenv-load := true

default:
  just --list

dev:
	#!/usr/bin/env bash
	set -euxo pipefail
	echo 'Building and serving...'
	(trap 'kill 0' SIGINT; just dev-api & just dev-frontend)

dev-api:
    cargo watch --workdir api --quiet --clear --exec 'shuttle run'

dev-frontend:
    cd frontend && npm install && REACT_APP_API_PROXY=http://localhost:8000 npm start

dev-storybook:
	cd frontend && npm install && npm run storybook

migrate-info:
	#!/usr/bin/env bash
	set -euxo pipefail
	DATABASE_PORT=$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')
	DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${DATABASE_PORT}/calandar-api"
	cd api && cargo sqlx migrate info --database-url "${DATABASE_URL}"

migrate-add name:
	cd api && cargo sqlx migrate add -r {{name}}

migrate-run:
	#!/usr/bin/env bash
	set -euxo pipefail
	DATABASE_PORT=$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')
	DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${DATABASE_PORT}/calandar-api"
	cd api && cargo sqlx migrate run --database-url "${DATABASE_URL}"

migrate-revert:
	#!/usr/bin/env bash
	set -euxo pipefail
	DATABASE_PORT=$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')
	DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${DATABASE_PORT}/calandar-api"
	cd api && cargo sqlx migrate revert --database-url "${DATABASE_URL}"

update-sqlx:
	#!/usr/bin/env bash
	set -euxo pipefail
	DATABASE_PORT=$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')
	DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${DATABASE_PORT}/calandar-api"
	cd api && cargo sqlx prepare --database-url "${DATABASE_URL}" -- --all-targets --all-features

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
	cargo shuttle run --working-directory api &
	PID=$!
	trap "kill ${PID}" EXIT

	echo "Wait for the server to start..."
	counter=0
	until [[ $(curl -I -s -o /dev/null -w "%{http_code}" localhost:8000/api/healthz) =~ "204" ]] || [[ $counter -gt 10 ]]; do
		sleep 1s
		(( counter=counter+1 ))
		echo "Counter: ${counter}"
	done

	pact_verifier_cli --header Authorization="Bearer put_something_here" --port 8000 --dir ./frontend/pacts

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

	# Deploy to Cloud Run (with or without --no-traffic depending on whether service exists)
	gcloud run deploy "${SERVICE_NAME}" \
		--image "${IMAGE_URL}" \
		--region "${GCP_REGION}" \
		--project "${GCP_PROJECT_ID}" \
		--platform managed \
		--allow-unauthenticated \
		--port 8080 \
		--set-env-vars "RUST_LOG=info" \
		--set-secrets "DATABASE_URL=DATABASE_URL:latest,PASETO_SECRET_KEY=PASETO_SECRET_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest,STEAM_API_KEY=STEAM_API_KEY:latest" \
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

# Build and run API in standalone mode (without Shuttle)
dev-api-standalone:
	#!/usr/bin/env bash
	set -euxo pipefail
	echo "Running API in standalone mode (no Shuttle)..."
	cd api && cargo run --no-default-features
