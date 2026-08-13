# AI Agent Governance & System Architecture Specification

This document defines the agentic governance model, domain scopes, file ownership boundaries, system instructions, and operational protocols for AI agents and developers contributing to the **Bilo Bunker** project.

---

## 🏛️ System Topology & Architectural Philosophy

**Bilo Bunker** is a high-performance, multi-tenant Nostr Remote Signer (NIP-46) and Management Engine operating at the edge. 

```
                                  +---------------------------------------+
                                  |    Nostr Client (Damus, Amethyst,     |
                                  |     Coracle, Web Apps, etc.)          |
                                  +-------------------+-------------------+
                                                      |
                                                      | WebSocket (wss://) via Relays
                                                      v
+---------------------------------------------------------------------------------------------------+
| Cloudflare Edge Infrastructure                                                                    |
|                                                                                                   |
|   +-------------------------------------------------------------------------------------------+   |
|   | Hono Router (Cloudflare Worker)                                                           |   |
|   | - Serves React SPA (TailAdmin Dashboard)                                                  |   |
|   | - Handles HTTP / API Endpoints & Health Check                                             |   |
|   | - Validates NIP-98 HTTP Auth Headers                                                      |   |
|   +-------------------+-----------------------------------+-----------------------------------+   |
|                       |                                   |                                       |
|                       v                                   v                                       |
|   +-------------------+-------------------+   +-----------+-----------------------------------+   |
|   | Cloudflare KV                         |   | Cloudflare Durable Objects (DO Sandbox)           |   |
|   | - Global system config                |   | - Stateful per-user isolation (getByName(pubkey)) |   |
|   | - App permission whitelists           |   | - Isolated SQLite storage (keys, state, logs)     |   |
|   | - Public user profiles cache          |   | - Relay pool WebSocket client connections         |   |
|   +---------------------------------------+   | - NIP-46 RPC execution & NIP-44 crypto            |   |
|                                               +---------------------------------------------------+   |
+---------------------------------------------------------------------------------------------------+
```

---

## 🤖 Domain Agents Matrix

| Agent Alias | Domain Title | Focus Area | Key Files & Directory Ownership |
| :--- | :--- | :--- | :--- |
| **`@agent-arch`** | Architecture & Edge Spec | Worker router, DO boundaries, KV models, SQLite schemas | `packages/worker/src/index.ts`, `packages/worker/src/do/`, `wrangler.jsonc` |
| **`@agent-nostr`** | Nostr Protocol Specialist | NIP-46, NIP-07, NIP-44, NIP-98, NIP-01, relay WS pool | `packages/worker/src/services/nostr.ts`, `packages/worker/src/middleware/nip98.ts`, DO NIP-46 handlers |
| **`@agent-ui`** | Frontend & TailAdmin Specialist | React SPA, TailAdmin UI components, NIP-07 state, Vite | `packages/ui/` |
| **`@agent-devops`** | OS & Build Pipeline | pnpm workspace, `Makefile`, Wrangler CLI, GitHub Actions | `Makefile`, `package.json`, `pnpm-workspace.yaml`, `.github/`, root configs |

---

## 📋 Agent Specifications

### 1. `@agent-arch` (Architecture & Edge Spec)

- **Primary Goal:** Maintain structural integrity, edge runtime efficiency, zero global mutable state, and clean separation between worker routing and Durable Object sandboxes.
- **Owned Scope:**
  - `packages/worker/src/index.ts`
  - `packages/worker/src/do/BunkerDO.ts`
  - `packages/worker/src/services/kv.ts`
  - `packages/worker/src/types/index.ts`
  - `wrangler.jsonc`
- **System Instructions & Rules:**
  1. **DO Instantiation:** Each Nostr user MUST map to a unique Durable Object instance accessed via `env.BUNKER_DO.getByName(pubkey)`.
  2. **Storage standard:** Use `this.ctx.storage.sql.exec()` for all persistent per-user data inside Durable Objects. Never use unbounded in-memory maps as the source of truth.
  3. **Concurrency Control:** Use `ctx.blockConcurrencyWhile()` exclusively inside DO constructors for idempotent table migration setup. Never wrap network requests or `fetch` in `blockConcurrencyWhile()`.
  4. **Strict Isolation:** Prevent any cross-tenant data leakage between DO instances. KV is used strictly for global configurations, public profile caching, and shared domain route lookups.

---

### 2. `@agent-nostr` (Nostr Protocol Specialist)

- **Primary Goal:** Implement cryptographic precision, NIP spec compliance, secure NIP-46 remote signing, NIP-44 v2 encryption/decryption, and resilient relay pool management.
- **Owned Scope:**
  - `packages/worker/src/services/nostr.ts`
  - `packages/worker/src/middleware/nip98.ts`
  - NIP-46 RPC engine within `BunkerDO`
  - Nostr event verification and signature operations
- **Supported NIPs:**
  - **NIP-01:** Basic Nostr protocol specifications, event structure, and validation.
  - **NIP-07:** Browser extension signer integration for Dashboard authentication.
  - **NIP-44:** Encrypted payloads (v2 spec using Secp256k1 + HKDF + ChaCha20-Poly1305).
  - **NIP-46:** Remote Signer Protocol (Bunker URI parsing, `connect`, `get_public_key`, `sign_event`, `ping`, `encrypt`, `decrypt`).
  - **NIP-98:** HTTP Auth Header verification for Worker endpoints.
- **System Instructions & Rules:**
  1. **Key Security:** Private keys residing in DO SQLite storage MUST NEVER be exposed via public HTTP endpoints or emitted in unencrypted log streams.
  2. **NIP-46 Response Model:** All NIP-46 RPC responses MUST be published back to the requesting client relay as encrypted NIP-46 response events (kind `24133`).
  3. **Permission Enforcer:** Every NIP-46 method execution (`sign_event`, `nip44_encrypt`, etc.) MUST check the client's granted permissions before signing. If unauthorized, respond with an RPC error or prompt requirement.

---

### 3. `@agent-ui` (Frontend & TailAdmin Integration)

- **Primary Goal:** Deliver a modern, high-contrast, responsive TailAdmin React SPA for user key management, application authorization revoking, real-time RPC log auditing, and Bunker connection URI generation.
- **Owned Scope:**
  - `packages/ui/src/`
  - `packages/ui/vite.config.ts`
  - `packages/ui/index.html`
- **System Instructions & Rules:**
  1. **Aesthetics & UI Standard:** Implement high-quality visual design using modern Tailwind CSS tokens, smooth transitions, dark-mode toggle support, and glassmorphism.
  2. **NIP-07 Integration:** Use `window.nostr` for authenticating user sessions against the dashboard. Support graceful fallback states when no NIP-07 extension (like Alby, nos2x) is present.
  3. **No Placeholders:** All UI components, graphs, active connection lists, and audit log tables must render real or properly mocked live operational data.
  4. **Performance:** Ensure fast initial render, minimal bundle size, and optimal core web vitals.

---

### 4. `@agent-devops` (OS & Build Pipeline)

- **Primary Goal:** Ensure clean workspace ergonomics, deterministic builds, strict TypeScript/ESLint checks, Makefile abstractions, and continuous integration via GitHub Actions.
- **Owned Scope:**
  - `package.json`
  - `pnpm-workspace.yaml`
  - `Makefile`
  - `.eslintrc.json`
  - `.prettierrc`
  - `.github/workflows/ci.yml`
  - `CONTRIBUTING.md`, `LICENSE`, `README.md`
- **System Instructions & Rules:**
  1. **Node Environment:** Enforce node version verification (`nvm use`) before executing Node processes.
  2. **Makefile Centralization:** Provide clean Makefile targets: `make install`, `make dev`, `make build`, `make lint`, `make typecheck`, `make test`, `make deploy`.
  3. **Production Quality:** Zero warning/error tolerance on `pnpm lint` and `pnpm typecheck`. Zero floating promises or standard `any` type overrides allowed in CI/CD.

---

## 🔄 Inter-Agent Handoff Protocol

When completing multi-domain tasks:
1. `@agent-arch` defines the API endpoints and DO SQLite schemas.
2. `@agent-nostr` implements the cryptographic logic, NIP-46 RPC pipeline, and DO methods.
3. `@agent-ui` consumes the API/DO endpoints and integrates the user interface.
4. `@agent-devops` verifies type checking, linting, build pipelines, and CI workflows.
