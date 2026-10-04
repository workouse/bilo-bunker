import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';
import { createApp } from '../app.js';

const db = new Database(':memory:');
runMigrations(db);
const bunker = new BunkerService(db);
const relay = new RelayManager(bunker, db);

describe('Static SPA serving', () => {
  let publicDir: string;

  beforeAll(() => {
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-public-'));
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><div id="root"></div>');
    fs.mkdirSync(path.join(publicDir, 'assets'));
    fs.writeFileSync(path.join(publicDir, 'assets', 'app.js'), 'console.log("app");');
  });

  afterAll(() => {
    fs.rmSync(publicDir, { recursive: true, force: true });
  });

  it('serves index.html at /', async () => {
    const res = await createApp(bunker, relay, { publicDir }).request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await createApp(bunker, relay, { publicDir }).request('/dashboard/connections');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  it('serves static assets', async () => {
    const res = await createApp(bunker, relay, { publicDir }).request('/assets/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log("app");');
  });

  it('returns the JSON 404 for unknown API routes instead of the SPA', async () => {
    const res = await createApp(bunker, relay, { publicDir }).request('/api/v2/does-not-exist');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not Found');
  });

  it('keeps API routes working alongside the SPA', async () => {
    const res = await createApp(bunker, relay, { publicDir }).request('/api/v1/health');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('ok');
  });

  it('returns the JSON 404 at / when no SPA build is present', async () => {
    const missing = path.join(publicDir, 'missing');
    const res = await createApp(bunker, relay, { publicDir: missing }).request('/');
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('Not Found');
  });
});
