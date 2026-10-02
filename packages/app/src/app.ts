import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type { BunkerService } from './services/bunker.js';
import type { RelayManager } from './services/relay.js';
import { createApiRouter } from './routes/api.js';
import { logger } from './utils/logger.js';

/**
 * Locate scripts/install.sh relative to this module rather than the CWD.
 *
 * - Docker image: /app/dist/app.js → /app/scripts/install.sh
 * - Repository (tsx src/ or compiled dist/): packages/app/{src,dist}/app.* → <repo>/scripts/install.sh
 *
 * INSTALL_SCRIPT_PATH overrides both.
 */
export function resolveInstallerScriptPath(): string | null {
  const override = process.env['INSTALL_SCRIPT_PATH'];
  if (override) return fs.existsSync(override) ? override : null;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../scripts/install.sh'),
    path.resolve(here, '../../../scripts/install.sh'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function loadInstallerScript(): string | null {
  const scriptPath = resolveInstallerScriptPath();
  if (!scriptPath) {
    logger.warn('[app] scripts/install.sh not found; /install.sh will return 404');
    return null;
  }
  return fs.readFileSync(scriptPath, 'utf-8');
}

/**
 * Pure Hono app factory.
 *
 * Accepts the two service singletons and returns a fully-configured Hono
 * application with no top-level side-effects.
 */
export function createApp(bunkerService: BunkerService, relayManager: RelayManager): Hono {
  const app = new Hono();

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use('*', cors());

  // ── Public routes ──────────────────────────────────────────────────────────

  // Health check — unauthenticated
  app.get('/api/v1/health', (c) =>
    c.json({
      status: 'ok',
      service: 'Bilo Bunker',
      version: '1.0.0',
      mode: bunkerService.getMode(),
      owner: bunkerService.getOwnerInfo(),
      timestamp: new Date().toISOString(),
    })
  );

  // Config check — unauthenticated
  app.get('/api/v1/config', (c) =>
    c.json({
      mode: bunkerService.getMode(),
      bunker_pubkey: bunkerService.getPublicKey(),
      owner: bunkerService.getOwnerInfo(),
    })
  );

  // ── Public Installer Script Serving ────────────────────────────────────────
  const installerScript = loadInstallerScript();
  const serveInstallerScript = (c: import('hono').Context) => {
    if (installerScript === null) {
      return c.text('#!/usr/bin/env bash\necho "Error: Installer script not found." >&2\nexit 1\n', 404);
    }
    return c.text(installerScript, 200, {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    });
  };

  app.get('/install.sh', serveInstallerScript);
  app.get('/install', serveInstallerScript);

  // ── Protected API sub-router ───────────────────────────────────────────────
  app.route('/api/v1', createApiRouter(bunkerService, relayManager));

  // ── Static SPA Serving (Single Container Mode) ──────────────────────────────
  const publicDir = './public';
  if (fs.existsSync(publicDir) && fs.existsSync(`${publicDir}/index.html`)) {
    app.use('/*', serveStatic({ root: publicDir }));
    app.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) return next();
      return serveStatic({ path: `${publicDir}/index.html` })(c, next);
    });
  }


  // ── 404 fallback ───────────────────────────────────────────────────────────
  app.notFound((c) =>
    c.json(
      {
        error: 'Not Found',
        message: `${c.req.method} ${c.req.path} is not a valid endpoint`,
      },
      404
    )
  );

  return app;
}

