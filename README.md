# caLANdar

[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/lewisoaten/caLANdar/main.svg)](https://results.pre-commit.ci/latest/github/lewisoaten/caLANdar/main)
[![Netlify Status](https://api.netlify.com/api/v1/badges/a560385c-7546-4e48-8a1e-7e4d67ac0a1e/deploy-status)](https://app.netlify.com/sites/calandar/deploys)

Web application for helping organising LAN parties.

## Development

Launch local development environment with:
`docker-compose up`

Rust API and frontend will both live-reload following changes.

If you get an error for the frontend, like:

> sh: 1: react-scripts: not found

Then run `npm install` before relaunching.
