// dotenv must be the first import so that all subsequent modules see the
// populated process.env, including the db singleton which reads DB_PATH.
import 'dotenv/config';

import { serve } from '@hono/node-server';
import { db } from './db/index.js';
import { BunkerService } from './services/bunker.js';
import { RelayManager } from './services/relay.js';
import { createApp } from './app.js';

// ── Service instantiation ──────────────────────────────────────────────────────
// db import triggers runMigrations() synchronously, so the schema is guaranteed
// to be current before BunkerService or RelayManager access any tables.
const bunker = new BunkerService(db);
const relay = new RelayManager(bunker, db);
const app = createApp(bunker, relay);


// ── HTTP server ────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port });

console.log(`[app] Bilo Bunker listening on port ${port}`);
console.log(`[app] Bunker pubkey: ${bunker.getPublicKey()}`);

// ── Relay connections ──────────────────────────────────────────────────────────
// Start after the HTTP server is up so health checks can pass during the
// (potentially slow) initial relay handshake.
await relay.start();

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// Close all relay WebSocket connections cleanly before the process exits.
// This prevents in-flight NIP-46 responses from being dropped on deploys.
const shutdown = (): void => {
  console.log('[app] Shutting down…');
  relay.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
