# ⚡ Bilo Bunker

> Multi-Tenant Nostr Remote Signer (NIP-46) & Management Dashboard built for Docker & Node.js.

[![CI Pipeline](https://github.com/workouse/bilo-bunker/actions/workflows/ci.yml/badge.svg)](https://github.com/workouse/bilo-bunker/actions/workflows/ci.yml)
[![Docker Image](https://github.com/workouse/bilo-bunker/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/workouse/bilo-bunker/actions/workflows/docker-publish.yml)
[![GHCR](https://img.shields.io/badge/Container-GHCR-blue?logo=docker)](https://github.com/workouse/bilo-bunker/pkgs/container/bilo-bunker)
[![Nostr NIP-46](https://img.shields.io/badge/Nostr-NIP--46%20Remote%20Signer-8A2BE2)](https://github.com/nostr-protocol/nips/blob/master/46.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📌 Architecture Overview

**Bilo Bunker** is a stateful, multi-tenant Nostr remote signing service (NIP-46). It enables users to keep their Nostr private keys securely stored while responding to remote signing requests from authorized Nostr clients across Nostr relays.

- **Backend Application Engine (Hono + Node.js):** Handles NIP-46 RPC signing commands, NIP-05 profile verification, and SQLite persistent storage.
- **Auto-SSL Reverse Proxy (Caddy 2):** Provisions and auto-renews Let's Encrypt / ZeroSSL TLS certificates for your domain out of the box.
- **TailAdmin React UI SPA:** Modern dashboard allowing users to log in with NIP-07 (`window.nostr`), view active `bunker://` URIs, revoke client permissions, and audit real-time RPC logs.

---

## 🎭 Why "Bilo Bunker"?

In the legendary 1980 Turkish cinema classic *Banker Bilo*, Maho promises naive villagers safe transport to Germany, only to deceive them, abandon them in Istanbul, and pocket their money. In the Nostr ecosystem, centralized key management services act like "Maho"—promising convenience while taking custody of your private keys.

Bilo learned the hard way, took control of his own fate, and became the ultimate self-sovereign **Banker Bilo**. With **Bilo Bunker**, you own your keys, run your own isolated signing engine, and never have to ask: *"Yaptım ama bir sor niye yaptım?"* ("I did it, but ask me why I did it?").

---

## 🚀 Quickstart Production Deployment (Single Command)

Deploy Bilo Bunker on any VPS or server in seconds with **Zero-Config Auto-SSL**:

```bash
# 1. Clone repository
git clone https://github.com/workouse/bilo-bunker.git
cd bilo-bunker

# 2. Configure environment
cp .env.dist .env
nano .env

# 3. Launch single-command production stack
docker compose up -d
```

### Alternatively run via GHCR Standalone Docker Container:

> **Note:** The standalone container image (`ghcr.io/workouse/bilo-bunker:latest`) runs the Node.js application engine directly on port `3000`. It does not contain ACME/Certbot. For automated TLS certificate provisioning (Let's Encrypt / ZeroSSL on ports 80/443), use the `docker compose up -d` stack above which includes the Caddy reverse proxy.

```bash
docker run -d \
  --name bilo-bunker \
  -p 3000:3000 \
  -v bilo_data:/data \
  -e DOMAIN=bunker.example.com \
  -e OWNER_PUBKEY=your_64_char_hex_pubkey \
  ghcr.io/workouse/bilo-bunker:latest
```

---

## ⚙️ Environment Variables Reference

| Variable | Description | Required | Default |
|---|---|---|---|
| `DOMAIN` | Primary domain name (e.g. `bunker.example.com` or `localhost`) | Yes | `localhost` |
| `CERTBOT_EMAIL` | Email address for Let's Encrypt / ZeroSSL TLS notifications (used by Caddy in Docker Compose) | Optional (for Docker Compose) | `""` |
| `OWNER_PUBKEY` | 64-character lowercase hex Nostr public key of the bunker owner | Yes | `""` |
| `DEFAULT_RELAYS` | Comma-separated WebSocket Nostr relays to connect to | No | `wss://relay.damus.io,...` |
| `PORT` | Node.js application server internal port | No | `3000` |
| `DB_PATH` | Path to SQLite database file inside container | No | `/data/bunker.db` |
| `LOG_LEVEL` | Application logging verbosity (`error`, `warn`, `info`, `debug`) | No | `info` |

---

## 🛠️ Local Development & DX

### Prerequisites
- Node.js `^22.0.0` (managed via `nvm`)
- `pnpm` (`npm i -g pnpm`)
- Docker & Docker Compose

### Developer Commands

```bash
# First-time setup wizard
make blackstart

# Install monorepo workspace dependencies
make install

# Start local dev environment
make dev

# Typecheck monorepo
make typecheck

# Lint codebase
make lint

# Run Vitest test suite
make test

# Build production artifacts
make build

# Build local Docker image
make docker-build

# Launch production stack via Docker Compose
make docker-up

# Stop production stack
make docker-down

# Tail Docker Compose logs
make docker-logs

# Shell into application container
make docker-shell

# Create transaction-consistent SQLite database backup
make backup

# Deploy via SSH to remote VPS host
make deploy
```

---

## 📂 Monorepo Structure

```
bilo-bunker/
├── .github/              # CI/CD Workflows (CI, GHCR publish)
├── Caddyfile             # Caddy reverse proxy & Auto-SSL config
├── Dockerfile            # Unified production multi-stage build
├── docker-compose.yml    # Production service orchestration
├── Makefile              # Developer automation shortcuts
├── scripts/              # Setup & deployment scripts (blackstart.sh, deploy.sh)
├── packages/
│   ├── app/              # Hono Node.js backend engine & SQLite persistence
│   └── ui/               # TailAdmin React SPA & NIP-07 Dashboard
├── CONTRIBUTING.md       # Contribution guidelines
├── CODE_OF_CONDUCT.md    # Contributor Covenant v2.1
├── SECURITY.md           # Security disclosure policy
└── DEPLOY.md             # Detailed deployment & ops guide
```

---

## 🤝 Community & Governance

- [Contributing Guidelines](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

---

## 📄 License

Released under the [MIT License](LICENSE).

