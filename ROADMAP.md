# Roadmap

The live task list is the [GitHub issue tracker](https://github.com/workouse/bilo-bunker/issues). This file only gives the big picture; if it disagrees with the issues, the issues win.

## Current architecture

A single Node.js 22 + Hono process (NIP-46 signer, NIP-98 API and the React dashboard) with SQLite storage, shipped as one Docker image behind Caddy. See [README](README.md) and [DEPLOY](DEPLOY.md). The earlier Cloudflare Workers / Durable Objects design has been fully replaced.

## Recently completed

- Reverse-proxy support for NIP-98 auth: `X-Forwarded-Proto` and `PUBLIC_URL` (#1)
- Same-origin dashboard/API defaults, no hardcoded domains, fixed dev ports (#12)
- `LOG_LEVEL` support via a scoped logger (#4)
- Documented single- vs multi-user modes (#5) and current install commands (#3)
- Build and repo cleanup: UI build output (#6), unused Dockerfile (#7), installer path (#10), debug tools (#9), outdated planning docs (#8)

## Next up

- **Test coverage** (#11): UI tests (`useNostrAuth`, `getDomainConfig`) and HTTP route tests (SPA fallback).
- **API input validation**: `POST /api/v1/bunker/connections` returns `500` instead of `400` when required fields such as `nsec` are missing.
