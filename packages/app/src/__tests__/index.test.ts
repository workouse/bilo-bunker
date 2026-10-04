import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  it('should serve the installer script on /install.sh and /install', async () => {
    const resSh = await app.request('/install.sh');
    expect(resSh.status).toBe(200);
    expect(resSh.headers.get('content-type')).toContain('text/x-shellscript');
    const textSh = await resSh.text();
    expect(textSh).toContain('#!/usr/bin/env bash');
    expect(textSh).toContain('Bilo Bunker');

    const resAlias = await app.request('/install');
    expect(resAlias.status).toBe(200);
    expect(resAlias.headers.get('content-type')).toContain('text/x-shellscript');
    const textAlias = await resAlias.text();
    expect(textAlias).toBe(textSh);
  });
});


describe('Installer script path (INSTALL_SCRIPT_PATH)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-install-'));
  });

  afterEach(() => {
    delete process.env['INSTALL_SCRIPT_PATH'];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves the file at INSTALL_SCRIPT_PATH', async () => {
    const scriptPath = path.join(tmpDir, 'install.sh');
    fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\necho custom installer\n');
    process.env['INSTALL_SCRIPT_PATH'] = scriptPath;

    const res = await createApp(bunker, relay).request('/install.sh');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('echo custom installer');
  });

  it('returns 404 with an error script when the file is missing', async () => {
    process.env['INSTALL_SCRIPT_PATH'] = path.join(tmpDir, 'does-not-exist.sh');

    const res = await createApp(bunker, relay).request('/install.sh');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Installer script not found');
  });

  it('reads the file once when the app is created', async () => {
    const scriptPath = path.join(tmpDir, 'install.sh');
    fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\necho v1\n');
    process.env['INSTALL_SCRIPT_PATH'] = scriptPath;

    const cachedApp = createApp(bunker, relay);
    fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\necho v2\n');

    const res = await cachedApp.request('/install.sh');
    expect(await res.text()).toContain('echo v1');
  });
});
