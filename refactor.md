# Bilo Bunker — Refactor Technical Specification

**From:** Cloudflare Workers + Durable Objects  
**To:** Node.js 22 + SQLite + Docker + Nginx  

This document is the single source of truth for the technical implementation.
It is intended to be read and executed step-by-step by an engineer or AI agent.

---

## 1. Why We Are Doing This

The current Cloudflare Durable Object architecture is fundamentally broken for the
Nostr bunker use case. A Nostr bunker must maintain **persistent outbound WebSocket
connections** to relay servers in order to receive NIP-46 signing requests. Cloudflare
Durable Objects go dormant between alarm ticks — outbound WebSocket objects are garbage
collected when the DO sleeps, so `message` events are never delivered in practice.

The self-hosted model solves this with a single long-running Node.js process that owns
all relay connections for the lifetime of the container.

---

## 2. Open Source Policy

**No domain names, IP addresses, pubkeys, emails, or server credentials may appear
in any git-tracked file.**

- All user-specific values live in `.env` (git-ignored)
- Server connection config lives in `deploy.conf` (git-ignored)
- Nginx configs are stored as `*.template` files with `{{PLACEHOLDER}}` tokens
- Templates are rendered to `nginx/nginx.conf` (git-ignored) by `scripts/blackstart.sh`
- `*.example` files are committed as templates with all values empty

`.gitignore` must include:
```
.env
deploy.conf
nginx/nginx.conf
backups/
packages/*/dist
```

---

## 3. Final Repository Structure

```
bilo-bunker/
├── packages/
│   ├── app/                          ← renamed from packages/worker
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── index.ts          ← SQLite connection singleton
│   │   │   │   └── migrations.ts     ← schema init + seed
│   │   │   ├── services/
│   │   │   │   ├── bunker.ts         ← BunkerService (replaces BunkerDO)
│   │   │   │   ├── relay.ts          ← RelayManager (persistent WS)
│   │   │   │   └── nostr.ts          ← crypto utils (unchanged)
│   │   │   ├── routes/
│   │   │   │   └── api.ts            ← all HTTP routes
│   │   │   ├── middleware/
│   │   │   │   └── nip98.ts          ← NIP-98 + OWNER_PUBKEY guard
│   │   │   ├── types/
│   │   │   │   └── index.ts          ← all types, no CF imports
│   │   │   ├── app.ts                ← Hono factory
│   │   │   └── index.ts              ← Node.js entry point
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/                           ← unchanged React/Vite app
├── nginx/
│   ├── nginx.conf.template           ← TLS virtual hosts ({{PLACEHOLDERS}})
│   ├── nginx.conf.nossl.template     ← HTTP-only bootstrap version
│   └── public/
│       ├── landing/
│       │   └── index.html            ← static landing, no hardcoded domains
│       └── app/                      ← populated by Docker build from packages/ui
├── scripts/
│   ├── blackstart.sh                 ← interactive first-run setup wizard
│   └── deploy.sh                     ← SSH + rsync + Docker deployment
├── docker-compose.yml
├── .env.example
├── deploy.conf.example
├── Makefile
├── DEPLOY.md
├── refactor.md                       ← this file
└── refactor.task.md                  ← task checklist
```

---

## 4. Deleted Files

These files must be **removed** as part of the refactor:

| File | Reason |
|---|---|
| `packages/worker/wrangler.jsonc` | Cloudflare-specific config |
| `packages/worker/src/do/BunkerDO.ts` | Replaced by BunkerService |
| `packages/worker/src/services/kv.ts` | Replaced by SQLite profiles table |
| `packages/worker/.wrangler/` | Wrangler build cache |

The entire `packages/worker/` directory is renamed to `packages/app/` before any source
changes are made.

---

## 5. Package Dependencies

### packages/app/package.json

**Remove:**
- `wrangler` (devDependency)
- `@cloudflare/workers-types` (devDependency)

**Add (dependencies):**
- `better-sqlite3` — synchronous SQLite driver, ideal for single-process Node.js
- `ws` — battle-tested WebSocket client for Node.js
- `@hono/node-server` — Hono adapter for Node.js HTTP server
- `dotenv` — loads `.env` into `process.env` on startup

**Add (devDependencies):**
- `@types/better-sqlite3`
- `@types/ws`
- `tsx` — TypeScript execution for dev mode

**Scripts:**
```json
{
  "dev":       "tsx watch src/index.ts",
  "build":     "tsc",
  "start":     "node dist/index.js",
  "typecheck": "tsc --noEmit",
  "lint":      "eslint src/",
  "test":      "vitest run --passWithNoTests"
}
```

### packages/app/tsconfig.json

Change compiler target from Cloudflare Workers to Node.js:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  }
}
```

Remove any `types` reference to `@cloudflare/workers-types`.

---

## 6. Component Specifications

### 6.1 `src/db/index.ts`

Opens the SQLite database and exports a singleton. Must be the **first module imported**
in `index.ts` so migrations run before any service initializes.

```typescript
import Database from 'better-sqlite3';
import { runMigrations } from './migrations';

const DB_PATH = process.env.DB_PATH ?? '/data/bunker.db';
export const db = new Database(DB_PATH);

// Performance and safety settings
db.pragma('journal_mode = WAL');     // concurrent reads, crash-safe writes
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');   // WAL makes this safe at NORMAL

runMigrations(db);
```

Key rules:
- `better-sqlite3` is **synchronous** — no `await`, no `.then()` anywhere in DB code
- The same `db` instance is shared across all services (not pooled — single process)
- WAL mode allows reads during writes — essential since RelayManager writes while API reads

---

### 6.2 `src/db/migrations.ts`

Runs all schema creation statements idempotently using `IF NOT EXISTS`. Also adds the
`profiles` table (replacing the old KV store) and an index for audit log queries.

Tables to create:

```sql
CREATE TABLE IF NOT EXISTS keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pubkey     TEXT    UNIQUE NOT NULL,
  secret_key TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS authorized_clients (
  client_pubkey TEXT    PRIMARY KEY,
  permissions   TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rpc_audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_pubkey TEXT    NOT NULL,
  method        TEXT    NOT NULL,
  params        TEXT    NOT NULL,
  status        TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON rpc_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS connections (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  nsec             TEXT    NOT NULL,
  expiration       INTEGER NOT NULL,
  whitelisted_npub TEXT    NOT NULL,
  relays           TEXT    NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  pubkey     TEXT    PRIMARY KEY,
  name       TEXT,
  nip05      TEXT,
  picture    TEXT,
  updated_at INTEGER NOT NULL
);
```

Migration function signature:
```typescript
export function runMigrations(db: Database.Database): void
```

---

### 6.3 `src/types/index.ts`

Remove all Cloudflare imports. Replace `Env` with a simple `AppConfig` object.
Remove `extends Record<string, SqlStorageValue>` from all record interfaces.

```typescript
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';

export interface BunkerConnectionRecord {
  id: string; name: string; nsec: string; expiration: number;
  whitelisted_npub: string; relays: string; created_at: number; updated_at: number;
}

export interface SafeBunkerConnectionRecord {
  id: string; name: string; expiration: number;
  whitelisted_npub: string; relays: string; created_at: number; updated_at: number;
}

export interface AuthorizedClientRecord {
  client_pubkey: string; permissions: string; created_at: number; updated_at: number;
}

export interface RPCAuditLogRecord {
  id: number; client_pubkey: string; method: string;
  params: string; status: string; created_at: number;
}

export interface NIP98AuthContext {
  pubkey: string; event: VerifiedEvent;
}

export interface NIP46RequestPayload {
  id: string; method: string; params: unknown[];
}

export interface NIP46ResponsePayload {
  id: string; result?: unknown; error?: string;
}

export interface UserProfile {
  pubkey: string; name?: string; nip05?: string; picture?: string; updated_at: number;
}
```

Note: Most BunkerService methods are now **synchronous** because `better-sqlite3` is sync.
Only `nip04Encrypt` / `nip04Decrypt` remain async (WebCrypto requirement from nostr-tools).

---

### 6.4 `src/services/bunker.ts`

`BunkerService` is a plain class wrapping the SQLite database. Same method signatures
as `BunkerDOInterface` but synchronous. Instantiated once at startup.

**Constructor** — initializes keypair synchronously:
```typescript
constructor(db: Database.Database) {
  this.db = db;
  const row = db.prepare('SELECT pubkey, secret_key FROM keys ORDER BY id ASC LIMIT 1').get() as any;
  if (row) {
    this.publicKey    = row.pubkey;
    this.secretKeyHex = row.secret_key;
  } else {
    const { secretKeyHex, publicKey } = createKeyPair();
    const now = Math.floor(Date.now() / 1000);
    db.prepare('INSERT INTO keys (pubkey, secret_key, created_at) VALUES (?, ?, ?)').run(publicKey, secretKeyHex, now);
    this.publicKey    = publicKey;
    this.secretKeyHex = secretKeyHex;
  }
}
```

**DB call pattern** (better-sqlite3 sync):
```typescript
// SELECT single:  db.prepare('SELECT ... WHERE id = ?').get(id) as Type | undefined
// SELECT many:    db.prepare('SELECT ...').all() as Type[]
// INSERT/UPDATE:  db.prepare('INSERT INTO ...').run(val1, val2)
// Upsert:         db.prepare('... ON CONFLICT(key) DO UPDATE SET value = ?').run(key, val, val)
```

**Key differences from BunkerDO:**
- No `ctx.storage.sql` → `this.db.prepare().run/get/all()`
- No `ctx.waitUntil()`, no alarms, no `this.websockets` map
- `getPublicKey()` returns `string` synchronously (not `Promise<string>`)
- `generateBunkerUri()` returns `string` synchronously
- `handleNip46Request(event, ws)` is a **public async method** (called by RelayManager)
- New: `getRelayUrls(): string[]` — returns union of DB connection relays + DEFAULT_RELAYS
- New: `getProfile(): UserProfile | null`
- New: `setProfile(data): UserProfile`

**`handleNip46Request`** — moved from BunkerDO unchanged, just adapted to use `this.db.prepare()`.
The `ws` parameter is the response WebSocket (provided by RelayManager).

---

### 6.5 `src/services/relay.ts`

`RelayManager` owns all outbound WebSocket connections. Runs for process lifetime.

```typescript
import WebSocket from 'ws';

export class RelayManager {
  private connections:     Map<string, WebSocket>        = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout>  = new Map();
  private reconnectDelay:  Map<string, number>           = new Map();
  private readonly subscriptionId = 'nip46-sub';
  private stopped = false;

  constructor(private bunker: BunkerService, private db: Database.Database) {}

  async start(): Promise<void>            // connect to all relays from bunker.getRelayUrls()
  private connect(relayUrl: string): void // create ws, attach open/message/close/error handlers
  private subscribe(ws: WebSocket): void  // send REQ with pubkey filter and since timestamp
  private async handleMessage(raw: string): Promise<void>  // parse + delegate to bunker
  private scheduleReconnect(relayUrl: string): void         // exponential backoff (2s→60s)
  refreshRelays(): void                   // pick up new relay URLs after connection CRUD
  stop(): void                            // close all ws, clear all timers
}
```

**Reconnection backoff:** initial 2s, doubles per failure, max 60s, resets to 2s on success.

**`since` timestamp:** loaded from `state` table on each subscription; updated by
`bunker.handleNip46Request()` after processing each event. Default: `now - 3600`.

**Response routing:** after handling a message, the response event is sent back via
any open WebSocket connection (the `responseWs` passed to `handleNip46Request`).

---

### 6.6 `src/middleware/nip98.ts`

Add `OWNER_PUBKEY` guard immediately after signature verification:

```typescript
const ownerPubkey = process.env.OWNER_PUBKEY;
if (result.pubkey !== ownerPubkey) {
  return c.json({ error: 'Forbidden', message: 'This bunker does not belong to you' }, 403);
}
```

Startup validation in `index.ts` ensures `OWNER_PUBKEY` is set, so the middleware
can assume it exists.

---

### 6.7 `src/routes/api.ts`

Extract all routes from old `index.ts`. Accept `bunkerService` and `relayManager`
via function parameter. All `c.env.BUNKER_DO.getByName(user.pubkey).method()` calls
become `bunkerService.method()`.

After `createConnection` and `updateConnection` succeed: call `relayManager.refreshRelays()`.

Profile routes replace `getUserProfile(c.env.BUNKER_KV, ...)` with `bunkerService.getProfile()`.

---

### 6.8 `src/app.ts`

```typescript
export function createApp(bunkerService: BunkerService, relayManager: RelayManager): Hono {
  const app = new Hono();
  app.use('*', cors());
  app.get('/api/v1/health', (c) => c.json({ status: 'ok', version: '2.0.0' }));
  app.route('/api/v1', createApiRouter(bunkerService, relayManager));
  app.notFound((c) => c.json({ error: 'Not Found' }, 404));
  return app;
}
```

The inline HTML fallback is removed — Nginx serves the UI and landing page.

---

### 6.9 `src/index.ts`

```typescript
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { db }            from './db';
import { BunkerService } from './services/bunker';
import { RelayManager }  from './services/relay';
import { createApp }     from './app';

if (!process.env.OWNER_PUBKEY) {
  console.error('FATAL: OWNER_PUBKEY environment variable is required');
  process.exit(1);
}

const bunker = new BunkerService(db);
const relay  = new RelayManager(bunker, db);
const app    = createApp(bunker, relay);

await relay.start();

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, () => {
  console.log(`[app] listening on :${process.env.PORT ?? 3000}`);
  console.log(`[app] bunker pubkey: ${bunker.getPublicKey()}`);
});

process.on('SIGTERM', () => { relay.stop(); process.exit(0); });
process.on('SIGINT',  () => { relay.stop(); process.exit(0); });
```

---

### 6.10 `services/nostr.ts`

**Unchanged.** All crypto functions are portable. The only structural change is that
`handleNip46Request` logic is **moved out of BunkerDO and into BunkerService**.

---

## 7. Nginx Template Specification

### Placeholder tokens
| Token | Example |
|---|---|
| `{{DOMAIN}}` | `bunker.example.com` |
| `{{APP_DOMAIN}}` | `app.bunker.example.com` |
| `{{API_DOMAIN}}` | `api.bunker.example.com` |

### `nginx.conf.nossl.template`
Three port-80 server blocks. Each serves `.well-known/acme-challenge/` from certbot webroot.
`{{API_DOMAIN}}` proxies to `http://app:3000`.

### `nginx.conf.template` (TLS)
Six server blocks: 3 HTTP-to-HTTPS redirects + 3 HTTPS handlers.

- `{{DOMAIN}}` — `root /var/www/html/landing`, expires 24h, gzip on
- `{{APP_DOMAIN}}` — `root /var/www/html/app`, SPA fallback, assets cached 1y immutable
- `{{API_DOMAIN}}` — `proxy_pass http://app:3000`, rate 60r/m, no-cache, proxy headers

Shared TLS config:
```nginx
ssl_certificate     /etc/letsencrypt/live/{{DOMAIN}}/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/{{DOMAIN}}/privkey.pem;
ssl_protocols       TLSv1.2 TLSv1.3;
ssl_ciphers         HIGH:!aNULL:!MD5;
add_header          Strict-Transport-Security "max-age=31536000" always;
```

---

## 8. Dockerfile (`packages/app/Dockerfile`)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
RUN addgroup -S bunker && adduser -S bunker -G bunker
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /build/dist ./dist
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
USER bunker
CMD ["node", "dist/index.js"]
```

---

## 9. Scripts

### `scripts/blackstart.sh`
- `#!/usr/bin/env bash` + `set -euo pipefail`
- Color ANSI output
- Check local tools: `docker`, `rsync`, `ssh`
- Prompt for: DOMAIN (derives APP/API subdomains), OWNER_PUBKEY (validated hex64), CERTBOT_EMAIL, DEFAULT_RELAYS, DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY
- Write `.env` from `.env.example`
- Render `nginx/nginx.conf.nossl.template` → `nginx/nginx.conf` via `sed`
- Write `deploy.conf` from `deploy.conf.example`
- Print summary, ask confirmation
- Offer `make deploy` immediately

### `scripts/deploy.sh`
- `#!/usr/bin/env bash` + `set -euo pipefail`
- Source `deploy.conf` and `.env`
- Verify SSH connectivity
- Create versioned release directory `$DEPLOY_ROOT/releases/$(date +%Y%m%d%H%M%S)/`
- Detect OS and install Docker if missing (apt / dnf / apk)
- `rsync` all files (exclude `.git`, `node_modules`, `.env`, `deploy.conf`, `backups/`)
- `rsync` `.env` separately
- Symlink `shared/data` into release (SQLite persistence across releases)
- Atomic `current` symlink swap
- First-run: render nossl nginx → start nginx → `cert-init` → render TLS nginx
- Subsequent runs: render TLS nginx → `docker compose restart nginx`
- `docker compose build && docker compose up -d` on remote
- Health check with 5 retries
- Prune old releases (keep `$DEPLOY_KEEP_RELEASES`)

---

## 10. Landing Page

`nginx/public/landing/index.html` — no hardcoded domains. Uses:
```javascript
const host = window.location.hostname;
const parts = host.split('.');
const base = parts.slice(-2).join('.');
const sub = parts.slice(0, -2).join('.');
const appUrl = `https://app.${sub}.${base}`;
const apiUrl = `https://api.${sub}.${base}`;
```

---

## 11. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Node.js HTTP port |
| `DB_PATH` | No | `/data/bunker.db` | SQLite file path |
| `OWNER_PUBKEY` | **Yes** | — | 64-char hex pubkey; process exits if unset |
| `DEFAULT_RELAYS` | No | damus + nostr.band | Comma-separated wss:// URLs |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `DOMAIN` | Cert only | — | Root domain |
| `APP_DOMAIN` | Cert only | — | App subdomain |
| `API_DOMAIN` | Cert only | — | API subdomain |
| `CERTBOT_EMAIL` | Cert only | — | Let's Encrypt email |

---

## 12. Verification Checklist

```bash
# No CF references remain
grep -r "cloudflare\|wrangler\|DurableObject\|KVNamespace" packages/app/src/
# Expected: empty

# No hardcoded domains in tracked files
grep -r "workouse\.com" packages/ nginx/*.template scripts/
# Expected: empty

# TypeScript compiles
cd packages/app && npm run typecheck

# Docker builds and runs
docker compose build
docker compose up -d
curl -sf http://localhost/api/v1/health | jq .

# Relay connections established
docker compose logs app | grep "\[relay\]"
```
