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
