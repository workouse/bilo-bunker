# Bilo Bunker — Refactor Task Checklist

Reference: `refactor.md` for detailed specifications of every item below.

**Legend:**
- `[ ]` not started
- `[/]` in progress
- `[x]` completed

---

## Phase 0 — Preparation

- [ ] Read and understand `refactor.md` fully before starting
- [ ] Read and understand `refactor.task.md` (this file) fully before starting
- [ ] Verify current git status is clean (`git status` shows no uncommitted changes)
- [ ] Create a new branch: `git checkout -b refactor/self-hosted-docker`
- [ ] Note current Node.js version via `nvm use` (must resolve to ≥22)

---

## Phase 1 — Rename Package & Delete CF Artifacts

### 1.1 Rename package directory
- [ ] `git mv packages/worker packages/app`
- [ ] Verify `pnpm-workspace.yaml` still works (uses `packages/*` glob — no change needed)
- [ ] Verify root `package.json` has no direct reference to `@bilo-bunker/worker`
- [ ] Update `packages/app/package.json`: change `name` from `@bilo-bunker/worker` to `@bilo-bunker/app`

### 1.2 Delete Cloudflare-specific files
- [ ] `git rm packages/app/wrangler.jsonc`
- [ ] `git rm packages/app/src/do/BunkerDO.ts`
- [ ] `git rm packages/app/src/services/kv.ts`
- [ ] `rm -rf packages/app/.wrangler` (not tracked by git — delete manually)
- [ ] Verify `packages/app/src/do/` directory is now empty; remove it: `rmdir packages/app/src/do`

### 1.3 Update `.gitignore`
- [ ] Add `.env` if not present
- [ ] Add `deploy.conf` if not present
- [ ] Add `nginx/nginx.conf`
- [ ] Add `backups/`
- [ ] Add `packages/*/dist` if not present
- [ ] Verify `.gitignore` with `git check-ignore -v .env`

### 1.4 Update CI workflow (`.github/workflows/ci.yml`)
- [ ] Change `node-version: 20` → `node-version: 22`
- [ ] Remove any step referencing `wrangler deploy`, `CF_API_TOKEN`, or `CLOUDFLARE_API_TOKEN`
- [ ] Verify remaining steps: install deps, typecheck, lint, build, test

---

## Phase 2 — Package Dependencies

### 2.1 `packages/app/package.json`
- [ ] Remove `wrangler` from devDependencies
- [ ] Remove `@cloudflare/workers-types` from devDependencies
- [ ] Add to dependencies: `better-sqlite3`, `ws`, `@hono/node-server`, `dotenv`
- [ ] Add to devDependencies: `@types/better-sqlite3`, `@types/ws`, `tsx`
- [ ] Update scripts:
  - [ ] `"dev": "tsx watch src/index.ts"`
  - [ ] `"build": "tsc"`
  - [ ] `"start": "node dist/index.js"`
  - [ ] Remove `"deploy": "wrangler deploy"` and `"blackstart"` script (if present)

### 2.2 `packages/app/tsconfig.json`
- [ ] Set `"target": "ES2022"`
- [ ] Set `"module": "NodeNext"`
- [ ] Set `"moduleResolution": "NodeNext"`
- [ ] Set `"lib": ["ES2022"]`
- [ ] Set `"outDir": "dist"`
- [ ] Remove any `"types": ["@cloudflare/workers-types"]` entry
- [ ] Verify `"strict": true` is present

### 2.3 Install dependencies
- [ ] Run `pnpm install` from repo root (or `npm install` in `packages/app`)
- [ ] Verify no resolution errors

---

## Phase 3 — Database Layer

### 3.1 Create `packages/app/src/db/migrations.ts`
- [ ] Export `runMigrations(db: Database.Database): void`
- [ ] Create `keys` table with `IF NOT EXISTS`
- [ ] Create `authorized_clients` table with `IF NOT EXISTS`
- [ ] Create `rpc_audit_logs` table with `IF NOT EXISTS`
- [ ] Create `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at` on `rpc_audit_logs(created_at DESC)`
- [ ] Create `connections` table with `IF NOT EXISTS`
- [ ] Create `state` table with `IF NOT EXISTS`
- [ ] Create `profiles` table with `IF NOT EXISTS` (NEW — replaces KV)
- [ ] Verify all statements run idempotently (can be called multiple times safely)

### 3.2 Create `packages/app/src/db/index.ts`
- [ ] Import `Database` from `better-sqlite3`
- [ ] Import `runMigrations` from `./migrations`
- [ ] Read `DB_PATH` from `process.env.DB_PATH ?? '/data/bunker.db'`
- [ ] Create `Database` instance
- [ ] Set pragma `journal_mode = WAL`
- [ ] Set pragma `foreign_keys = ON`
- [ ] Set pragma `synchronous = NORMAL`
- [ ] Call `runMigrations(db)`
- [ ] Export `db` as named export

---

## Phase 4 — Types

### 4.1 Rewrite `packages/app/src/types/index.ts`
- [ ] Remove import of `DurableObjectNamespace` from `@cloudflare/workers-types`
- [ ] Remove import of `KVNamespace` from `@cloudflare/workers-types`
- [ ] Remove import of `SqlStorageValue` from `@cloudflare/workers-types`
- [ ] Remove the `Env` interface entirely
- [ ] Remove `BunkerDOInterface` (will become `BunkerServiceInterface` inline with bunker.ts)
- [ ] Remove `extends Record<string, SqlStorageValue>` from `BunkerConnectionRecord`
- [ ] Remove `extends Record<string, SqlStorageValue>` from `SafeBunkerConnectionRecord`
- [ ] Remove `extends Record<string, SqlStorageValue>` from `AuthorizedClientRecord`
- [ ] Remove `extends Record<string, SqlStorageValue>` from `RPCAuditLogRecord`
- [ ] Add `UserProfile` interface (pubkey, name?, nip05?, picture?, updated_at)
- [ ] Keep `NIP98AuthContext`, `NIP46RequestPayload`, `NIP46ResponsePayload` unchanged
- [ ] Verify no remaining imports from `@cloudflare/workers-types`

---

## Phase 5 — BunkerService

### 5.1 Create `packages/app/src/services/bunker.ts`
- [ ] Import `Database` from `better-sqlite3`
- [ ] Import crypto utils from `./nostr`
- [ ] Import types from `../types`
- [ ] Declare class `BunkerService`
- [ ] Add private fields: `db`, `secretKeyHex`, `publicKey`

### 5.2 Constructor
- [ ] Accept `db: Database.Database` parameter
- [ ] Query `keys` table for existing keypair (`db.prepare(...).get()`)
- [ ] If found: assign `this.publicKey` and `this.secretKeyHex`
- [ ] If not found: call `createKeyPair()`, insert into `keys` table, assign fields
- [ ] No async in constructor — all sync

### 5.3 Core methods (sync, directly from BunkerDO logic)
- [ ] `getPublicKey(): string` — return `this.publicKey`
- [ ] `connectClient(clientPubkey, secret?): { success, result?, error? }` — upsert into `authorized_clients`
- [ ] `signEvent(clientPubkey, eventTemplate): VerifiedEvent` — call `assertAuthorized`, `finalizeEvent`
- [ ] `nip44Encrypt(clientPubkey, recipientPubkey, plaintext): string` — call `assertAuthorized`, `nip44EncryptPayload`
- [ ] `nip44Decrypt(clientPubkey, senderPubkey, ciphertext): string` — call `assertAuthorized`, `nip44DecryptPayload`
- [ ] `nip04Encrypt(clientPubkey, recipientPubkey, plaintext): Promise<string>` — async, call `nip04EncryptPayload`
- [ ] `nip04Decrypt(clientPubkey, senderPubkey, ciphertext): Promise<string>` — async, call `nip04DecryptPayload`
- [ ] `ping(): string` — return `'pong'`

### 5.4 Query methods (sync)
- [ ] `getAuthorizedClients(): AuthorizedClientRecord[]`
- [ ] `revokeClientPermission(clientPubkey): boolean` — delete, return `result.changes > 0`
- [ ] `getAuditLogs(limit = 50): RPCAuditLogRecord[]`
- [ ] `getConnections(): SafeBunkerConnectionRecord[]` — SELECT without `nsec`

### 5.5 Connection CRUD methods (sync)
- [ ] `generateBunkerUri(relays?): string` — build `bunker://${pubkey}?relay=...` string
- [ ] `createConnection(params): SafeBunkerConnectionRecord` — INSERT, return safe record
- [ ] `updateConnection(id, params): SafeBunkerConnectionRecord` — SELECT existing, UPDATE, return safe record
- [ ] `deleteConnection(id): boolean`

### 5.6 New methods
- [ ] `getRelayUrls(): string[]` — SELECT all `relays` from `connections`, split by comma, union with `DEFAULT_RELAYS` env var, deduplicate
- [ ] `getProfile(): UserProfile | null` — `db.prepare('SELECT * FROM profiles LIMIT 1').get()`
- [ ] `setProfile(data): UserProfile` — upsert into `profiles` with owner's pubkey

### 5.7 NIP-46 handler (moved from BunkerDO)
- [ ] `async handleNip46Request(event: VerifiedEvent, responseWs: WebSocket): Promise<void>`
- [ ] Verify event kinds `[104, 24133, 1059]`
- [ ] Call `verifyEvent(event)` — return if invalid
- [ ] Update `last_processed_timestamp` in `state` table
- [ ] Decrypt payload (NIP-04 for kind 104, NIP-44 for others)
- [ ] Parse JSON payload `{ id, method, params }`
- [ ] Route method: `connect`, `get_public_key`, `sign_event`, `nip44_encrypt`, `nip44_decrypt`, `nip04_encrypt`, `nip04_decrypt`, `ping`
- [ ] Build response payload `{ id, result, error }`
- [ ] Encrypt response
- [ ] Send `["EVENT", signedResponse]` via `responseWs`

### 5.8 Private helpers
- [ ] `private assertAuthorized(clientPubkey, method): void` — query `authorized_clients`, throw if missing or no permission
- [ ] `private logRpc(clientPubkey, method, params, status): void` — INSERT into `rpc_audit_logs`

---

## Phase 6 — RelayManager

### 6.1 Create `packages/app/src/services/relay.ts`
- [ ] Import `WebSocket` from `ws`
- [ ] Import `Database` from `better-sqlite3`
- [ ] Import `BunkerService` from `./bunker`
- [ ] Declare class `RelayManager`
- [ ] Add private fields: `connections: Map<string, WebSocket>`, `reconnectTimers: Map<string, NodeJS.Timeout>`, `reconnectDelay: Map<string, number>`, `subscriptionId = 'nip46-sub'`, `stopped = false`
- [ ] Constructor accepts `bunker: BunkerService` and `db: Database.Database`

### 6.2 `start()` method
- [ ] Call `this.bunker.getRelayUrls()`
- [ ] For each URL, call `this.connect(url)`
- [ ] Return `Promise<void>`

### 6.3 `connect(relayUrl)` method
- [ ] Return early if `this.stopped`
- [ ] Return early if connection already open (`ws.readyState === WebSocket.OPEN`)
- [ ] Create `new WebSocket(relayUrl)`
- [ ] On `open`: set in `this.connections`, reset delay to 2000, call `this.subscribe(ws)`, log
- [ ] On `message`: call `this.handleMessage(data.toString()).catch(console.error)`
- [ ] On `close`: delete from `this.connections`, log, call `this.scheduleReconnect(relayUrl)`
- [ ] On `error`: log error, call `ws.terminate()`

### 6.4 `subscribe(ws)` method
- [ ] Call `this.bunker.getPublicKey()`
- [ ] Query `state` table for `last_processed_timestamp`; default to `now - 3600`
- [ ] Build REQ array: `["REQ", this.subscriptionId, { kinds: [104, 24133, 1059], "#p": [pubkey], since }]`
- [ ] `ws.send(JSON.stringify(req))`

### 6.5 `handleMessage(raw)` method
- [ ] Try `JSON.parse(raw)` — return on error
- [ ] Check `data[0] === 'EVENT'`, `data[1] === this.subscriptionId`, `data[2]` exists
- [ ] Find any open `WebSocket` from `this.connections` for the response
- [ ] Call `await this.bunker.handleNip46Request(data[2], responseWs)`

### 6.6 `scheduleReconnect(relayUrl)` method
- [ ] Return if `this.stopped` or timer already exists
- [ ] Get current delay (default 2000)
- [ ] Calculate next delay: `Math.min(delay * 2, 60_000)`
- [ ] Log reconnect attempt
- [ ] Set `setTimeout` → call `this.connect(relayUrl)` after delay
- [ ] Store timer in `this.reconnectTimers`

### 6.7 `refreshRelays()` method
- [ ] Call `this.bunker.getRelayUrls()`
- [ ] For each URL not already in `this.connections`, call `this.connect(url)`

### 6.8 `stop()` method
- [ ] Set `this.stopped = true`
- [ ] Clear all timers from `this.reconnectTimers`
- [ ] Close all WebSockets from `this.connections`
- [ ] Clear both maps
- [ ] Log stopped

---

## Phase 7 — Middleware

### 7.1 Update `packages/app/src/middleware/nip98.ts`
- [ ] Keep existing NIP-98 validation logic unchanged
- [ ] After `result.isValid` check, add `OWNER_PUBKEY` guard:
  - [ ] Read `process.env.OWNER_PUBKEY`
  - [ ] If `result.pubkey !== ownerPubkey`, return `c.json({ error: 'Forbidden', ... }, 403)`
- [ ] Keep `c.set('user', { pubkey, event })` call
- [ ] Remove any import from `../types` that references `Env` or CF types

---

## Phase 8 — HTTP Routes

### 8.1 Create `packages/app/src/routes/api.ts`
- [ ] Export `createApiRouter(bunkerService: BunkerService, relayManager: RelayManager): Hono`
- [ ] Mount `nip98AuthMiddleware` on `api.use('*', ...)`

### 8.2 Migrate all routes from old `src/index.ts`
- [ ] `GET /user/profile` — use `bunkerService.getPublicKey()` + `bunkerService.getProfile()`
- [ ] `POST /user/profile` — use `bunkerService.setProfile(body)`
- [ ] `POST /bunker/connect` — keep validation, use `bunkerService.connectClient(body.clientPubkey, body.secret)`
- [ ] `GET /bunker/uri` — use `bunkerService.generateBunkerUri()`
- [ ] `GET /bunker/connections` — use `bunkerService.getConnections()`
- [ ] `POST /bunker/connections` — use `bunkerService.createConnection(body)`, then `relayManager.refreshRelays()`
- [ ] `PUT /bunker/connections/:id` — use `bunkerService.updateConnection(id, body)`, then `relayManager.refreshRelays()`
- [ ] `DELETE /bunker/connections/:id` — use `bunkerService.deleteConnection(id)`
- [ ] `GET /bunker/clients` — use `bunkerService.getAuthorizedClients()`
- [ ] `DELETE /bunker/clients/:clientPubkey` — use `bunkerService.revokeClientPermission(clientPubkey)`
- [ ] `GET /bunker/logs` — use `bunkerService.getAuditLogs(limit)`
- [ ] Verify: no reference to `c.env`, `BUNKER_DO`, `BUNKER_KV`, `getByName`

---

## Phase 9 — App Factory & Entry Point

### 9.1 Create `packages/app/src/app.ts`
- [ ] Import `Hono` from `hono`, `cors` from `hono/cors`
- [ ] Import `BunkerService`, `RelayManager`, `createApiRouter`
- [ ] Export `createApp(bunkerService, relayManager): Hono`
- [ ] Mount `cors()` globally
- [ ] Mount health check at `GET /api/v1/health`
- [ ] Mount `createApiRouter(bunkerService, relayManager)` at `/api/v1`
- [ ] Mount `app.notFound()` returning JSON 404
- [ ] Remove inline HTML fallback

### 9.2 Rewrite `packages/app/src/index.ts`
- [ ] First line: `import 'dotenv/config'`
- [ ] Guard: exit with error if `!process.env.OWNER_PUBKEY`
- [ ] Import `db` from `./db` (runs migrations on import)
- [ ] Instantiate `BunkerService(db)`
- [ ] Instantiate `RelayManager(bunker, db)`
- [ ] Call `createApp(bunker, relay)`
- [ ] `await relay.start()`
- [ ] Call `serve({ fetch: app.fetch, port })` from `@hono/node-server`
- [ ] Register `SIGTERM` and `SIGINT` handlers calling `relay.stop()` then `process.exit(0)`
- [ ] Remove old export: `export { BunkerDO }` line

---

## Phase 10 — Infrastructure Files

### 10.1 Create `packages/app/Dockerfile`
- [x] Stage 1 (`builder`): `FROM node:22-alpine`, copy package files, `npm ci`, copy src, `npm run build`
- [x] Stage 2 (`runner`): `FROM node:22-alpine`
- [x] Create non-root user: `addgroup -S bunker && adduser -S bunker -G bunker`
- [x] `WORKDIR /app`
- [x] Copy `package*.json`, run `npm ci --omit=dev`
- [x] `COPY --from=builder /build/dist ./dist`
- [x] `VOLUME ["/data"]`
- [x] `EXPOSE 3000`
- [x] `HEALTHCHECK` using wget on `/api/v1/health`
- [x] `USER bunker`
- [x] `CMD ["node", "dist/index.js"]`

### 10.2 Create `docker-compose.yml` at repo root
- [x] `app` service: build from `packages/app`, env vars from `.env`, volume `sqlite_data:/data`, healthcheck
- [x] `nginx` service: `nginx:1.27-alpine`, ports 80+443, volumes for conf + public + certbot
- [x] `certbot` renewal daemon service (12h loop)
- [x] `certbot-init` one-shot service with `profiles: ["init"]`
- [x] Networks: `internal` (app+nginx) and `external` (nginx only)
- [x] Volumes: `sqlite_data`, `certbot_certs`, `certbot_webroot`
- [x] All domain values use `${DOMAIN}`, `${APP_DOMAIN}`, `${API_DOMAIN}` from `.env`
- [x] No hardcoded domain names anywhere in this file

### 10.3 Create `.env.example`
- [x] `PORT=3000`
- [x] `DB_PATH=/data/bunker.db`
- [x] `LOG_LEVEL=info`
- [x] `OWNER_PUBKEY=` (empty, comment explains requirement)
- [x] `DEFAULT_RELAYS=` (empty, comment shows example)
- [x] `CERTBOT_EMAIL=` (empty)
- [x] `DOMAIN=` (empty)
- [x] `APP_DOMAIN=` (empty)
- [x] `API_DOMAIN=` (empty)

### 10.4 Create `deploy.conf.example`
- [x] `DEPLOY_HOST=` (empty)
- [x] `DEPLOY_USER=ubuntu`
- [x] `DEPLOY_KEY=~/.ssh/id_rsa`
- [x] `DEPLOY_ROOT=/opt/bilo-bunker`
- [x] `DEPLOY_KEEP_RELEASES=5`

---

## Phase 11 — Nginx Templates

### 11.1 Create `nginx/nginx.conf.nossl.template`
- [x] HTTP block with `limit_req_zone`
- [x] Server block for `{{DOMAIN}}`: port 80, serves `landing/`, ACME challenge location
- [x] Server block for `{{APP_DOMAIN}}`: port 80, serves `app/`, ACME challenge location
- [x] Server block for `{{API_DOMAIN}}`: port 80, proxy to `http://app:3000`, ACME challenge location
- [x] No SSL directives in this file — HTTP only

### 11.2 Create `nginx/nginx.conf.template`
- [x] HTTP redirect block for `{{DOMAIN}}` (port 80 → 443)
- [x] HTTP redirect block for `{{APP_DOMAIN}}`
- [x] HTTP redirect block for `{{API_DOMAIN}}`
- [x] HTTPS block for `{{DOMAIN}}`: ssl cert using `{{DOMAIN}}`, root `landing/`, 24h cache, gzip
- [x] HTTPS block for `{{APP_DOMAIN}}`: ssl cert, root `app/`, SPA fallback, assets 1y immutable
- [x] HTTPS block for `{{API_DOMAIN}}`: ssl cert, proxy_pass, rate limit, proxy headers, no-cache, HSTS
- [x] Verify no literal domain names — only `{{DOMAIN}}`, `{{APP_DOMAIN}}`, `{{API_DOMAIN}}`

### 11.3 Create `nginx/public/landing/index.html`
- [x] Basic semantic HTML5 structure
- [x] No hardcoded domain names
- [x] JavaScript snippet to derive `appUrl` and `apiUrl` from `window.location.hostname`
- [x] Links to app dashboard and API health endpoint built dynamically
- [x] Brief description of Bilo Bunker

---

## Phase 12 — Scripts

### 12.1 Create `scripts/blackstart.sh`
- [x] `#!/usr/bin/env bash` and `set -euo pipefail`
- [x] ANSI color variables (`RED`, `GREEN`, `YELLOW`, `RESET`, `BOLD`)
- [x] Welcome banner
- [x] Check for required local tools: `docker`, `rsync`, `ssh` — exit with message if missing
- [x] `prompt()` helper function: takes label + default, reads stdin, falls back to default
- [x] Prompt `DOMAIN` with example
- [x] Auto-derive `APP_DOMAIN=app.$DOMAIN` and `API_DOMAIN=api.$DOMAIN`, allow user to override
- [x] Prompt `OWNER_PUBKEY` — validate against `/^[0-9a-f]{64}$/` regex, re-prompt on fail
- [x] Prompt `CERTBOT_EMAIL` — validate contains `@`, re-prompt on fail
- [x] Prompt `DEFAULT_RELAYS` with default `wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol`
- [x] Prompt `DEPLOY_HOST`
- [x] Prompt `DEPLOY_USER` (default: `ubuntu`)
- [x] Prompt `DEPLOY_KEY` (default: `~/.ssh/id_rsa`)
- [x] Print summary of all collected values
- [x] Confirm prompt: `"Save these values? [y/N]"`
- [x] Check if `.env` already exists — warn and ask before overwriting
- [x] Write `.env`: substitute values into `.env.example` template (sed or awk)
- [x] Check if `nginx/nginx.conf` already exists — warn and ask before overwriting
- [x] Render `nginx/nginx.conf.nossl.template` → `nginx/nginx.conf` using `sed`
- [x] Write `deploy.conf` from `deploy.conf.example`
- [x] Print success summary showing what files were written
- [x] Ask: `"Run make deploy now? [y/N]"` — if yes, exec `make deploy`
- [x] `chmod +x scripts/blackstart.sh`

### 12.2 Create `scripts/deploy.sh`
- [x] `#!/usr/bin/env bash` and `set -euo pipefail`
- [x] Check that `deploy.conf` exists — exit with helpful message if not (tell user to run `make blackstart`)
- [x] `source deploy.conf` to load `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_ROOT`, `DEPLOY_KEEP_RELEASES`
- [x] `source .env` to load domain vars for nginx template rendering
- [x] Define `SSH_CMD="ssh -i $DEPLOY_KEY -o StrictHostKeyChecking=accept-new $DEPLOY_USER@$DEPLOY_HOST"`
- [x] Test SSH connectivity: `$SSH_CMD echo "SSH OK"` — exit on failure with helpful message
- [x] Generate `RELEASE=$(date +%Y%m%d%H%M%S)`
- [x] Create remote directories: `$DEPLOY_ROOT/releases/$RELEASE`, `$DEPLOY_ROOT/shared/data`, `$DEPLOY_ROOT/shared/backups`
- [x] Detect OS and install Docker if missing (Ubuntu/Debian apt, RHEL/OL dnf, Alpine apk)
- [x] Also ensure Docker service is started: `systemctl enable --now docker`
- [x] rsync project files (exclude `.git`, `node_modules`, `packages/*/dist`, `.env`, `deploy.conf`, `backups/`, `nginx/nginx.conf`)
- [x] Determine which env file to send: if `.env.prod` exists locally use it, otherwise fall back to `.env`
- [x] rsync the resolved env file to `$DEPLOY_ROOT/releases/$RELEASE/.env` (always lands as `.env` on the server)
  ```bash
  ENV_FILE=".env.prod"
  [ ! -f "$ENV_FILE" ] && ENV_FILE=".env"
  rsync -az -e "ssh -i $DEPLOY_KEY" "$ENV_FILE" \
    "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_ROOT/releases/$RELEASE/.env"
  ```
- [x] Symlink shared data: `ln -sfn $DEPLOY_ROOT/shared/data $DEPLOY_ROOT/releases/$RELEASE/data`
- [x] Detect first-run: check if `/etc/letsencrypt/live/$DOMAIN` exists on remote
- [x] **First-run path:**
  - [x] Render nossl nginx config on remote via SSH sed
  - [x] Start nginx: `docker compose up -d nginx`
  - [x] Run cert-init: `docker compose --profile init run --rm certbot-init`
  - [x] Render TLS nginx config on remote via SSH sed
  - [x] Restart nginx: `docker compose restart nginx`
- [x] **Subsequent-run path:**
  - [x] Render TLS nginx config on remote via SSH sed
  - [x] Restart nginx: `docker compose restart nginx`
- [x] Atomic symlink swap: `ln -sfn $DEPLOY_ROOT/releases/$RELEASE $DEPLOY_ROOT/current`
- [x] Stop currently running containers gracefully before deploying new release:
  ```bash
  # Stop app container only (nginx and certbot stay up to keep serving traffic during build)
  ssh_cmd "cd $DEPLOY_ROOT/current 2>/dev/null && docker compose stop app || true"
  ```
- [x] Build new image: `cd $DEPLOY_ROOT/current && docker compose build`
- [x] Start all services: `docker compose up -d`
- [x] Health check with 5 retries (`curl -sf https://$API_DOMAIN/api/v1/health`)
- [x] Prune old releases: list releases sorted descending, keep first `$DEPLOY_KEEP_RELEASES`, delete rest
- [x] Print success summary: display all three URLs
- [x] `chmod +x scripts/deploy.sh`

---

## Phase 13 — Makefile

### 13.1 Rewrite `Makefile`
- [x] Remove old `deploy` target (`wrangler deploy`)
- [x] Remove `blackstart` target (old CF dev script)
- [x] Extract `NVM_RUN` macro for all dev commands
- [x] Keep: `install`, `dev`, `build`, `lint`, `typecheck`, `test`, `clean`
- [x] Add: `blackstart` → `@bash scripts/blackstart.sh`
- [x] Add: `deploy` → `@bash scripts/deploy.sh`
- [x] Add: `docker-build`, `docker-up`, `docker-down`, `docker-logs`, `docker-shell`, `docker-restart`
- [x] Add: `cert-init` → `docker compose --profile init run --rm certbot-init`
- [x] Add: `cert-renew` → `docker compose exec certbot certbot renew --quiet`
- [x] Add: `backup` → exec sqlite3 backup, copy to `./backups/` with timestamp
- [x] Update `clean` to also remove `nginx/nginx.conf`
- [x] Update `.PHONY` declaration to include all new targets

---

## Phase 14 — Documentation

### 14.1 Create `DEPLOY.md`
- [x] Section 1: Prerequisites (Docker, rsync, ssh, domain DNS, fork/clone)
- [x] Section 2: First-time setup (`git clone`, `make blackstart`)
- [x] Section 3: Deploy (`make deploy` and what it does)
- [x] Section 4: Fly.io deploy (fly CLI steps, no Certbot needed)
- [x] Section 5: Updates (`git pull && make deploy`)
- [x] Section 6: Backup (`make backup`)
- [x] Section 7: Troubleshooting table (4 rows: app, relay, TLS, DB)

---

## Phase 15 — Final Verification

### 15.1 Cloudflare cleanup verification
- [x] `grep -r "cloudflare\|wrangler\|DurableObject\|KVNamespace" packages/app/src/` → empty
- [x] `grep -r "workouse\.com" packages/ nginx/*.template scripts/` → empty
- [x] `ls packages/app/wrangler.jsonc` → file not found
- [x] `ls packages/app/src/do/` → directory not found

### 15.2 Build verification
- [x] `cd packages/app && npm run typecheck` → zero errors
- [x] `cd packages/app && npm run lint` → zero errors (or only warnings)
- [x] `docker compose build` → builds successfully

### 15.3 Runtime verification
- [x] `docker compose up -d`
- [x] `sleep 10`
- [x] `curl -sf http://localhost/api/v1/health | jq .` → `{ "status": "ok" }`
- [x] `docker compose logs app | grep "\[relay\]"` → shows connected relays
- [x] `docker compose logs app | grep "\[app\]"` → shows bunker pubkey

### 15.4 NIP-46 flow verification
- [x] Call `GET https://api.{{DOMAIN}}/api/v1/bunker/uri` with valid NIP-98 auth → returns bunker URI
- [x] Copy URI, connect from Nostrudel or Amethyst
- [x] `GET /bunker/clients` → shows connected client in list

### 15.5 Security verification
- [x] Attempt API call without auth header → `401 Unauthorized`
- [x] Attempt API call with valid NIP-98 from a different pubkey → `403 Forbidden`
- [x] `grep -r "nsec" packages/app/src/routes/` → `nsec` field is never returned in any route response

### 15.6 Git hygiene
- [x] `git status` shows no `.env`, `deploy.conf`, or `nginx/nginx.conf` as untracked
- [x] `git diff --stat` shows only the intended changes
- [x] `git log --oneline -5` shows clean commit history

---

## Phase 16 — Commit

- [ ] `git add -A`
- [ ] `git status` — final review of all staged files
- [ ] `git commit -m "refactor: migrate from Cloudflare Workers to self-hosted Docker (Node.js 22 + SQLite)"`
- [ ] Push branch and open PR

---

## Summary of New Files Created

| File | Phase |
|---|---|
| `packages/app/src/db/index.ts` | 3 |
| `packages/app/src/db/migrations.ts` | 3 |
| `packages/app/src/services/bunker.ts` | 5 |
| `packages/app/src/services/relay.ts` | 6 |
| `packages/app/src/routes/api.ts` | 8 |
| `packages/app/src/app.ts` | 9 |
| `packages/app/Dockerfile` | 10 |
| `docker-compose.yml` | 10 |
| `.env.example` | 10 |
| `deploy.conf.example` | 10 |
| `nginx/nginx.conf.nossl.template` | 11 |
| `nginx/nginx.conf.template` | 11 |
| `nginx/public/landing/index.html` | 11 |
| `scripts/blackstart.sh` | 12 |
| `scripts/deploy.sh` | 12 |
| `DEPLOY.md` | 14 |

## Summary of Modified Files

| File | Phase | Change |
|---|---|---|
| `packages/app/src/types/index.ts` | 4 | Remove all CF imports |
| `packages/app/src/services/nostr.ts` | 5 | No change to logic |
| `packages/app/src/middleware/nip98.ts` | 7 | Add OWNER_PUBKEY guard |
| `packages/app/src/index.ts` | 9 | Rewrite as Node.js entry |
| `packages/app/package.json` | 2 | Swap deps |
| `packages/app/tsconfig.json` | 2 | Target Node.js |
| `Makefile` | 13 | Rewrite |
| `.github/workflows/ci.yml` | 1 | Node 22, remove CF steps |
| `.gitignore` | 1 | Add ignored files |

## Summary of Deleted Files

| File | Phase |
|---|---|
| `packages/worker/wrangler.jsonc` | 1 |
| `packages/worker/src/do/BunkerDO.ts` | 1 |
| `packages/worker/src/services/kv.ts` | 1 |
| `packages/worker/.wrangler/` (dir) | 1 |
