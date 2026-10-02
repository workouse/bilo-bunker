# Project Implementation Task Tracker & Roadmap

This document tracks the phased execution plan for bootstrapping and implementing the **Bilo Bunker** (Multi-Tenant Nostr Remote Signer & TailAdmin Dashboard Engine).

---

## 🎯 Phase 1: Environment & Repository Infrastructure (`@agent-devops`)
- [x] **1.1 Workspace Core Setup**
  - [x] Create root `package.json` with pnpm workspace scripts.
  - [x] Create `pnpm-workspace.yaml` defining `/packages/worker` and `/packages/ui`.
  - [x] Add `.nvmrc` setting Node version requirement (v20+ / LTS).
  - [x] Add `.gitignore` for Cloudflare Worker build output, `.wrangler`, and `node_modules`.
- [x] **1.2 Task Automation (`Makefile`)**
  - [x] Define `make install` to run `nvm use && pnpm install`.
  - [x] Define `make blackstart` for interactive onboarding & Cloudflare setup.
  - [x] Define `make dev` to start concurrent local Worker (`wrangler dev`) and Vite dev server.
  - [x] Define `make build` to execute TypeScript compilation and asset bundling across all workspace packages.
  - [x] Define `make lint` and `make typecheck` targets.
  - [x] Define `make test` for Vitest suite execution.
- [x] **1.3 Code Quality & Tooling Configurations**
  - [x] Configure root `tsconfig.json` with strict type checking, standard ESNext module resolution, and path aliases.
  - [x] Configure `.eslintrc.json` with TypeScript ESLint parser and React rules.
  - [x] Configure `.prettierrc` for consistent formatting across TypeScript, Markdown, and JSON files.
- [x] **1.4 Governance & Open Source Documentation**
  - [x] Create `LICENSE` file (MIT License).
  - [x] Create `README.md` with high-level architecture overview, feature list, and quickstart instructions.
  - [x] Create `CONTRIBUTING.md` detailing pull request workflows, commit conventions, and code guidelines.
- [x] **1.5 Cloudflare Infrastructure Setup**
  - [x] Configure `wrangler.jsonc` with Worker routing, compatibility date, `nodejs_compat` flag, KV binding (`BUNKER_KV`), and Durable Object binding (`BUNKER_DO`).
  - [x] Set up Durable Object SQLite migration definition (`new_sqlite_classes: ["BunkerDO"]`).

---

## ⚡ Phase 2: Core Hono Backend & KV Integration (`@agent-arch` & `@agent-nostr`)
- [x] **2.1 Worker Framework Initialization (`/packages/worker`)**
  - [x] Create worker `package.json` with dependencies (`hono`, `nostr-tools`, `@cloudflare/workers-types`).
  - [x] Setup Hono application instance in `packages/worker/src/index.ts`.
  - [x] Define global `Env` TypeScript interface matching `wrangler.jsonc` bindings.
- [x] **2.2 NIP-98 Authentication Middleware**
  - [x] Implement NIP-98 HTTP Auth header parser (`Authorization: Nostr <base64-event>`) in `packages/worker/src/middleware/nip98.ts`.
  - [x] Validate NIP-98 timestamp window (within ±60 seconds).
  - [x] Validate HTTP method, URL payload hash, and Nostr event signature using `nostr-tools`.
- [x] **2.3 Cloudflare KV Service Layer**
  - [x] Implement KV accessor functions in `packages/worker/src/services/kv.ts`.
  - [x] Define KV data models for global app permissions (`app:perm:<pubkey>:<client_pubkey>`), global configuration keys, and user metadata cache.
- [x] **2.4 Hono REST API Routes**
  - [x] `GET /api/v1/health`: System health status and edge location metadata.
  - [x] `GET /api/v1/user/profile`: Returns NIP-05 / profile cache for authenticated user.
  - [x] `POST /api/v1/user/profile`: Updates user profile cache.
  - [x] `GET /api/v1/bunker/uri`: Initiates connection and returns Bunker URI (`bunker://...`).
  - [x] Route handler delegating stateful websocket requests to `BunkerDO`.

---

## 🔒 Phase 3: Durable Object NIP-46 Bunker Core (`@agent-arch` & `@agent-nostr`)
- [x] **3.1 Durable Object Class Skeleton (`BunkerDO.ts`)**
  - [x] Extend `DurableObject<Env>` in `packages/worker/src/do/BunkerDO.ts`.
  - [x] Initialize SQLite database tables in `blockConcurrencyWhile()` constructor callback:
    - [x] `keys` (id, pubkey, encrypted_privkey, created_at)
    - [x] `authorized_clients` (client_pubkey, permissions, created_at, updated_at)
    - [x] `rpc_audit_logs` (id, client_pubkey, method, params, status, created_at)
- [x] **3.2 Nostr Relay WebSocket Client Pool**
  - [x] Implement WebSocket client logic inside DO to connect to target relays (`wss://relay.damus.io`, `wss://relay.nostr.band`, etc.).
  - [x] Handle subscription filters (`REQ`) for NIP-46 request events (kind `24133`) targeting the user's remote signer public key.
  - [x] Automatic reconnect logic with backoff for relay disconnections.
- [x] **3.3 NIP-44 Crypto & Payload Processor**
  - [x] Implement NIP-44 v2 encryption/decryption helper using Secp256k1 shared secret derivation.
  - [x] Decrypt incoming NIP-46 request payloads (`{ id, method, params }`).
- [x] **3.4 NIP-46 Remote RPC Method Engine**
  - [x] Implement `connect` RPC method (exchanges secret / verifies connection).
  - [x] Implement `get_public_key` RPC method.
  - [x] Implement `sign_event` RPC method:
    - [x] Verify client authorization against DO SQLite `authorized_clients` table.
    - [x] Log request into `rpc_audit_logs`.
    - [x] Compute Schnorr signature over NIP-01 serialized event.
    - [x] Return signed event payload to client relay via encrypted kind `24133` response event.
  - [x] Implement `nip44_encrypt` and `nip44_decrypt` RPC methods.
  - [x] Implement `ping` RPC method.

---

## 🎨 Phase 4: TailAdmin React Frontend (`@agent-ui`)
- [x] **4.1 Frontend SPA Architecture Setup (`/packages/ui`)**
  - [x] Setup React + Vite build pipeline with Tailwind CSS configuration.
  - [x] Import and integrate TailAdmin UI template layout (Header, Sidebar, Navigation, Theme Provider).
- [x] **4.2 NIP-07 Wallet & Browser Extension Auth State**
  - [x] Implement `useNostrAuth` hook detecting `window.nostr`.
  - [x] Handle login state, NIP-07 public key retrieval, and session storage.
  - [x] Implement NIP-98 request signer hook for authenticating HTTP requests to Hono Worker backend.
- [x] **4.3 TailAdmin Bunker Dashboard Views**
  - [x] **Overview Page:** Active connection statistics, recent RPC calls counter, system status badges.
  - [x] **Bunker URI Manager View:** Generate, display, copy, and QR-code render active `bunker://<pubkey>?relay=...&secret=...` URIs.
  - [x] **Client Permissions View:** List authorized client applications, view granted NIP-46 methods (`sign_event`, `nip44_encrypt`), and provide one-click permission revocation.
  - [x] **RPC Execution Audit Logs View:** Real-time searchable table showing client pubkeys, called methods, timestamps, and execution statuses.

---

## 🚀 Phase 5: Open-Source Readiness & CI/CD (`@agent-devops`)
- [x] **5.1 GitHub Actions CI Pipeline (`.github/workflows/ci.yml`)**
  - [x] Step 1: Checkout repository and set up Node environment with pnpm caching.
  - [x] Step 2: Run `make install`.
  - [x] Step 3: Run `make lint`.
  - [x] Step 4: Run `make typecheck`.
  - [x] Step 5: Run `make build`.
  - [x] Step 6: Run `make test`.
- [x] **5.2 Automated Tests & Validation**
  - [x] Add unit tests for NIP-98 header validation in Hono middleware.
  - [x] Add unit tests for NIP-44 crypto handlers and NIP-46 RPC payload parsing.
  - [x] Add integration test verifying Worker-to-Durable Object RPC dispatch.
- [x] **5.3 GitHub Repository Templates & Assets**
  - [x] Create `.github/ISSUE_TEMPLATE/bug_report.md`.
  - [x] Create `.github/ISSUE_TEMPLATE/feature_request.md`.
  - [x] Create `.github/PULL_REQUEST_TEMPLATE.md`.
- [x] **5.4 Final Quality Audit**
  - [x] Verified zero TODO placeholders and product-grade code across all modules.

