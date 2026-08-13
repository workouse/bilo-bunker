import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';
import { createApp } from '../app.js';

// Use an in-memory SQLite database so tests have no filesystem side-effects.
const db = new Database(':memory:');
runMigrations(db);

const bunker = new BunkerService(db);
// RelayManager is injected but never started in unit tests — no real WS connections.
const relay = new RelayManager(bunker, db);
const app = createApp(bunker, relay);

describe('Bilo Bunker Health Check', () => {
  it('should return health status ok', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);

    const data = (await res.json()) as { status: string; service: string };
    expect(data.status).toBe('ok');
    expect(data.service).toBe('Bilo Bunker');
  });

  it('should return 401 Unauthorized for protected API routes without auth', async () => {
    const res = await app.request('/api/v1/bunker/connections');
    expect(res.status).toBe(401);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Unauthorized');
  });
});

