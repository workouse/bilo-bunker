import fs from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type { BunkerService } from './services/bunker.js';
import type { RelayManager } from './services/relay.js';
import { createApiRouter } from './routes/api.js';

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
  const serveInstallerScript = (c: import('hono').Context) => {
    const candidatePaths = [
      './scripts/install.sh',
      '../../scripts/install.sh',
      '../scripts/install.sh',
      './public/install.sh',
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        return c.text(content, 200, {
          'Content-Type': 'text/x-shellscript; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        });
      }
    }
    return c.text('#!/usr/bin/env bash\necho "Error: Installer script not found." >&2\nexit 1\n', 404);
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

