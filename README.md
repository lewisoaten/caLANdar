# caLANdar

[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/lewisoaten/caLANdar/main.svg)](https://results.pre-commit.ci/latest/github/lewisoaten/caLANdar/main)
[![Netlify Status](https://api.netlify.com/api/v1/badges/a560385c-7546-4e48-8a1e-7e4d67ac0a1e/deploy-status)](https://app.netlify.com/sites/calandar/deploys)

Web application for helping organising LAN parties.

## Development

### Running

Rust api can be launched with:
`cargo shuttle run --working-directory api`

React frontend can be launched with:
`REACT_APP_API_PROXY=http://localhost:8000 npm start`

### SQLx Database Operations

When a query or database schema is modified, you will need to prepare the `sqlx-data.json` file. This can be performed after launching the application from within the `api/` directory with:
`DATABASE_URL="postgres://postgres:postgres@127.0.0.1:$(docker container inspect shuttle_calandar-api_shared_postgres --format '{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}')/postgres" cargo sqlx prepare --merged -- --all-targets --all-features`
