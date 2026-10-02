import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, resolveInstallerScriptPath } from '../app.js';

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


describe('Installer script resolution', () => {
  const original = process.env['INSTALL_SCRIPT_PATH'];
  const restore = () => {
    if (original === undefined) delete process.env['INSTALL_SCRIPT_PATH'];
    else process.env['INSTALL_SCRIPT_PATH'] = original;
  };

  it('finds scripts/install.sh relative to the module without an override', () => {
    delete process.env['INSTALL_SCRIPT_PATH'];
    try {
      expect(resolveInstallerScriptPath()).toMatch(/scripts[\\/]install\.sh$/);
    } finally {
      restore();
    }
  });

  it('serves the file named by INSTALL_SCRIPT_PATH', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilo-install-'));
    const file = path.join(dir, 'custom.sh');
    fs.writeFileSync(file, '#!/usr/bin/env bash\necho custom\n');
    process.env['INSTALL_SCRIPT_PATH'] = file;
    try {
      const res = await createApp(bunker, relay).request('/install.sh');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('echo custom');
    } finally {
      restore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 404 when INSTALL_SCRIPT_PATH does not exist', async () => {
    process.env['INSTALL_SCRIPT_PATH'] = '/nonexistent/install.sh';
    try {
      const res = await createApp(bunker, relay).request('/install.sh');
      expect(res.status).toBe(404);
    } finally {
      restore();
    }
  });
});
