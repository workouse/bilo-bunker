# AI Agent Governance & System Architecture Specification

This document defines the agentic governance model, domain scopes, file ownership boundaries, system instructions, and operational protocols for AI agents and developers contributing to the **Bilo Bunker** project.

---

## 🏛️ System Topology & Architectural Philosophy

**Bilo Bunker** is a high-performance, multi-tenant Nostr Remote Signer (NIP-46) and Management Engine built on self-hosted Docker, Caddy, Node.js 22, and SQLite.

```
                                  +---------------------------------------+
                                  |    Nostr Client (Damus, Amethyst,     |
                                  |     Coracle, Web Apps, etc.)          |
                                  +-------------------+-------------------+
                                                      |
                                                      | WebSocket (wss://) via Relays
                                                      v
+---------------------------------------------------------------------------------------------------+
| Self-Hosted Container Infrastructure (Docker + Caddy)                                             |
|                                                                                                   |
|   +-------------------------------------------------------------------------------------------+   |
|   | Caddy Reverse Proxy (Ports 80/443 - Zero-Config Auto-SSL)                                  |   |
|   | - Automatic TLS Certificate Provisioning (Let's Encrypt / ZeroSSL)                         |   |
|   | - HTTP/2 & HTTP/3 Support with automatic HTTPS redirection                                |   |
|   +-------------------+-----------------------------------------------------------------------+   |
|                       |                                                                           |
|                       v                                                                           |
|   +-------------------+-----------------------------------------------------------------------+   |
|   | Express / Hono App Container (Node.js 22 + SQLite)                                        |   |
|   | - Serves React SPA (TailAdmin Management Dashboard)                                       |   |
|   | - Handles NIP-98 HTTP Auth Headers & REST API Endpoints                                   |   |
|   | - Persistent WebSocket pool for relay connections & NIP-46 RPC processing                 |   |
|   | - SQLite Storage (WAL mode for keypairs, authorizations, logs, and profiles)              |   |
|   +-------------------------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------------------------+
```

---

## 🤖 Domain Agents Matrix

| Agent Alias | Domain Title | Focus Area | Key Files & Directory Ownership |
| :--- | :--- | :--- | :--- |
| **`@agent-arch`** | Architecture Spec | Express/Hono router, SQLite schemas, Bunker service | `packages/app/src/app.ts`, `packages/app/src/db/`, `packages/app/src/services/` |
| **`@agent-nostr`** | Nostr Protocol Specialist | NIP-46, NIP-07, NIP-44, NIP-98, NIP-01, relay WS pool | `packages/app/src/services/bunker.ts`, `packages/app/src/middleware/auth.ts` |
| **`@agent-ui`** | Frontend & TailAdmin Specialist | React SPA, TailAdmin UI components, NIP-07 state, Vite | `packages/ui/` |
| **`@agent-devops`** | OS & Container Pipeline | Docker, Docker Compose, Caddy, `Makefile`, GitHub Actions | `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `Makefile`, `.github/` |

---

## 📋 Agent Specifications

### 1. `@agent-arch` (Architecture Spec)

- **Primary Goal:** Maintain structural integrity, Node.js 22 runtime efficiency, zero global mutable state, and clean separation between API routing, SQLite storage, and business logic.
- **Owned Scope:**
  - `packages/app/src/app.ts`
  - `packages/app/src/db/index.ts`
  - `packages/app/src/db/migrations.ts`
  - `packages/app/src/services/bunker.ts`
  - `packages/app/src/types/index.ts`
- **System Instructions & Rules:**
  1. **SQLite Storage Standard:** Use `better-sqlite3` in WAL mode for all persistent data operations (keypairs, connection permissions, audit logs, and profile records).
  2. **Service Layer Isolation:** Maintain business logic inside `BunkerService` with clear dependency injection.
  3. **Strict Data Isolation:** Ensure multi-tenant key safety and prevent cross-tenant data leakage.

---

### 2. `@agent-nostr` (Nostr Protocol Specialist)

- **Primary Goal:** Implement cryptographic precision, NIP spec compliance, secure NIP-46 remote signing, NIP-44 v2 encryption/decryption, and resilient relay pool management.
- **Owned Scope:**
  - `packages/app/src/services/bunker.ts`
  - `packages/app/src/middleware/auth.ts`
  - Nostr event verification and signature operations
- **Supported NIPs:**
  - **NIP-01:** Basic Nostr protocol specifications, event structure, and validation.
  - **NIP-07:** Browser extension signer integration for Dashboard authentication.
  - **NIP-44:** Encrypted payloads (v2 spec using Secp256k1 + HKDF + ChaCha20-Poly1305).
  - **NIP-46:** Remote Signer Protocol (`connect`, `get_public_key`, `sign_event`, `ping`, `encrypt`, `decrypt`).
  - **NIP-98:** HTTP Auth Header verification for backend API endpoints.
- **System Instructions & Rules:**
  1. **Key Security:** Private keys stored in SQLite MUST NEVER be exposed via public HTTP endpoints or emitted in unencrypted log streams.
  2. **NIP-46 Response Model:** All NIP-46 RPC responses MUST be published back to the requesting client relay as encrypted NIP-46 response events (kind `24133`).
  3. **Permission Enforcer:** Every NIP-46 method execution MUST check the client's granted permissions before signing. If unauthorized, respond with an RPC error.

---

### 3. `@agent-ui` (Frontend & TailAdmin Integration)

- **Primary Goal:** Deliver a modern, high-contrast, responsive TailAdmin React SPA for user key management, application authorization revoking, real-time RPC log auditing, and Bunker connection URI generation.
- **Owned Scope:**
  - `packages/ui/src/`
  - `packages/ui/vite.config.ts`
  - `packages/ui/index.html`
- **System Instructions & Rules:**
  1. **Aesthetics & UI Standard:** Implement high-quality visual design using modern Tailwind CSS tokens, smooth transitions, dark-mode toggle support, and glassmorphism.
  2. **NIP-07 Integration:** Use `window.nostr` for authenticating user sessions against the dashboard. Support graceful fallback states when no NIP-07 extension is present.
  3. **No Placeholders:** All UI components, graphs, active connection lists, and audit log tables must render real live operational data.
  4. **Performance:** Ensure fast initial render, minimal bundle size, and optimal core web vitals.

---

### 4. `@agent-devops` (OS & Container Pipeline)

- **Primary Goal:** Ensure clean workspace ergonomics, deterministic Docker container builds, Caddy Auto-SSL reverse proxy automation, strict TypeScript/ESLint checks, Makefile abstractions, and CI/CD.
- **Owned Scope:**
  - `Dockerfile`
  - `docker-compose.yml`
  - `Caddyfile`
  - `Makefile`
  - `package.json`
  - `pnpm-workspace.yaml`
  - `.github/workflows/`
  - `DEPLOY.md`, `README.md`
- **System Instructions & Rules:**
  1. **Node Environment:** Enforce node version verification (`nvm use`) before executing Node processes.
  2. **Makefile Centralization:** Provide clean Makefile targets: `make install`, `make dev`, `make build`, `make lint`, `make typecheck`, `make test`, `make docker-up`, `make deploy-remote`.
  3. **Production Quality:** Zero warning/error tolerance on `pnpm lint` and `pnpm typecheck`.

---

## 🔄 Inter-Agent Handoff Protocol

When completing multi-domain tasks:
1. `@agent-arch` defines API endpoints and SQLite database schemas.
2. `@agent-nostr` implements cryptographic logic, NIP-46 RPC pipeline, and relay handlers.
3. `@agent-ui` consumes API endpoints and integrates the React user interface.
4. `@agent-devops` verifies type checking, linting, build pipelines, Docker builds, and CI workflows.
