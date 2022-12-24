@default:
  just --list

@dev:
	#!/usr/bin/env bash
	set -euxo pipefail
	echo 'Building and serving...'
	(trap 'kill 0' SIGINT; just dev-api & just dev-frontend)

@dev-api:
    cargo shuttle run --working-directory api

@dev-frontend:
    cd frontend && REACT_APP_API_PROXY=http://localhost:8000 npm start

@update-sqlx:
	#!/usr/bin/env bash
	set -euxo pipefail
	DATABASE_PORT=$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')
	DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${DATABASE_PORT}/postgres"
	cd api && cargo sqlx prepare --database-url "${DATABASE_URL}" --merged -- --all-targets --all-features

@bacon:
	cd api && bacon
