import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type { BunkerService } from './services/bunker.js';
import type { RelayManager } from './services/relay.js';
import { createApiRouter } from './routes/api.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('app');

/**
 * Path of the installer served at /install.sh. INSTALL_SCRIPT_PATH wins (set
 * to /app/scripts/install.sh in the Docker image); otherwise it is resolved
 * relative to this module, which sits three levels below the repo root in
 * both src/ and dist/, so it does not depend on the working directory.
 */
function resolveInstallScriptPath(): string {
  const fromEnv = process.env.INSTALL_SCRIPT_PATH?.trim();
  if (fromEnv) return fromEnv;
  return fileURLToPath(new URL('../../../scripts/install.sh', import.meta.url));
}

function loadInstallScript(): string | null {
  const scriptPath = resolveInstallScriptPath();
  try {
    return fs.readFileSync(scriptPath, 'utf-8');
  } catch {
    log.warn(`Installer script not found at ${scriptPath}; /install.sh will return 404`);
    return null;
  }
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
  // Read once at startup; the script only changes with a new release/image.
  const installScript = loadInstallScript();
  const serveInstallerScript = (c: import('hono').Context) => {
    if (installScript === null) {
      return c.text('#!/usr/bin/env bash\necho "Error: Installer script not found." >&2\nexit 1\n', 404);
    }
    return c.text(installScript, 200, {
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

