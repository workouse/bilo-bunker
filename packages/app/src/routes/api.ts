import { Hono } from 'hono';
import { nip19 } from 'nostr-tools';
import { createNip98AuthMiddleware } from '../middleware/nip98.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';
import { parseNsecToKeypair } from '../services/nostr.js';
import type { NIP98AuthContext } from '../types/index.js';

// Hex pubkey pattern: 32 bytes expressed as 64 lowercase hex characters.
const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/;

/**
 * Build the NIP-98-protected API sub-router.
 *
 * All business logic is delegated to the injected `bunkerService`.
 * `relayManager` is only used by the two connection-mutation routes to trigger
 * an immediate relay refresh after persisting a change.
 *
 * Mount this router under a versioned prefix in app.ts:
 *   app.route('/api/v1', createApiRouter(bunker, relay))
 */
export function createApiRouter(
  bunkerService: BunkerService,
  relayManager: RelayManager
): Hono<{ Variables: { user: NIP98AuthContext } }> {
  const api = new Hono<{ Variables: { user: NIP98AuthContext } }>();

  // ── Auth guard ──────────────────────────────────────────────────────────────
  // Every route in this router requires a valid NIP-98 Authorization header
  // from the owner pubkey or active bunker master pubkey.
  api.use('*', createNip98AuthMiddleware(bunkerService));

  // ── 8.2 Routes ──────────────────────────────────────────────────────────────

  // GET /user/profile
  // Returns the owner's bunker pubkey and stored profile metadata.
  api.get('/user/profile', (c) => {
    const bunkerPubkey = bunkerService.getPublicKey();
    const profile = bunkerService.getProfile();
    const user = c.get('user');

    return c.json({
      userPubkey: user.pubkey,
      bunkerPubkey,
      profile: profile ?? { pubkey: bunkerPubkey, updated_at: Math.floor(Date.now() / 1000) },
    });
  });

  // POST /user/profile
  // Create or update the owner profile stored in the `profiles` SQLite table.
  api.post('/user/profile', async (c) => {
    const body = await c.req.json<{ name?: string; nip05?: string; picture?: string }>();

    const updated = bunkerService.setProfile({
      name: body.name,
      nip05: body.nip05,
      picture: body.picture,
    });

    return c.json({ success: true, profile: updated });
  });

  // POST /bunker/connect
  // Authorise a NIP-46 client that is completing the connect handshake.
  api.post('/bunker/connect', async (c) => {
    const body = await c.req.json<{ clientPubkey?: string; secret?: string }>();

    // Validate clientPubkey: must be a 64-char lowercase hex Nostr pubkey.
    if (!body.clientPubkey || !HEX_PUBKEY_RE.test(body.clientPubkey)) {
      return c.json(
        {
          error: 'Bad Request',
          message: 'clientPubkey must be a valid 64-character lowercase hex Nostr pubkey',
        },
        400
      );
    }

    // secret is required — it is the primary anti-CSRF token for the NIP-46 connect flow.
    if (!body.secret || typeof body.secret !== 'string' || body.secret.trim() === '') {
      return c.json(
        {
          error: 'Bad Request',
          message: 'secret is required and must be a non-empty string',
        },
        400
      );
    }

    const response = bunkerService.connectClient(body.clientPubkey, body.secret);
    return c.json(response);
  });

  // GET /bunker/uri
  // Generate a fresh NIP-46 bunker:// URI (rotates the connect secret).
  api.get('/bunker/uri', (c) => {
    const uri = bunkerService.generateBunkerUri();
    return c.json({ success: true, uri });
  });

  // POST /bunker/relays/fetch
  // Query Nostr indexer network for kind 10002 & kind 3 relays for a given nsec/pubkey.
  api.post('/bunker/relays/fetch', async (c) => {
    const body = await c.req.json<{ nsec?: string; pubkey?: string }>();
    let targetPubkey = '';

    if (body.nsec) {
      const kp = parseNsecToKeypair(body.nsec);
      if (kp) targetPubkey = kp.publicKey;
    }

    if (!targetPubkey && body.pubkey) {
      const trimmed = body.pubkey.trim();
      if (trimmed.startsWith('npub1')) {
        try {
          const decoded = nip19.decode(trimmed);
          if (decoded.type === 'npub') {
            targetPubkey = decoded.data as string;
          }
        } catch {
          // ignore decode error
        }
      } else if (HEX_PUBKEY_RE.test(trimmed.toLowerCase())) {
        targetPubkey = trimmed.toLowerCase();
      }
    }

    const relays = await bunkerService.fetchUserRelaysFromNetwork(
      targetPubkey ? [targetPubkey] : undefined
    );
    return c.json({ success: true, relays });
  });

  // GET /bunker/connections
  // List all named relay connection profiles (nsec never returned).
  api.get('/bunker/connections', (c) => {
    const connections = bunkerService.getConnections();
    return c.json({ success: true, connections });
  });

  // POST /bunker/connections
  // Create a new named relay connection profile, then refresh active relay sockets.
  api.post('/bunker/connections', async (c) => {
    const body = await c.req.json<{
      name: string;
      nsec: string;
      expiration?: number;
      whitelisted_npub?: string;
      relays?: string;
    }>();

    const connection = bunkerService.createConnection(body);

    // Pick up any newly added relay URLs without requiring a restart.
    relayManager.refreshRelays();

    return c.json({ success: true, connection });
  });

  // PUT /bunker/connections/:id
  // Partially update an existing relay connection profile.
  api.put('/bunker/connections/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      nsec?: string;
      expiration?: number;
      whitelisted_npub?: string;
      relays?: string;
    }>();

    let connection: ReturnType<BunkerService['updateConnection']>;
    try {
      connection = bunkerService.updateConnection(id, body);
    } catch (err) {
      return c.json(
        {
          error: 'Not Found',
          message: err instanceof Error ? err.message : `Connection '${id}' not found`,
        },
        404
      );
    }

    // Pick up any relay URL changes immediately.
    relayManager.refreshRelays();

    return c.json({ success: true, connection });
  });

  // DELETE /bunker/connections/:id
  // Remove a named relay connection profile.
  api.delete('/bunker/connections/:id', (c) => {
    const id = c.req.param('id');
    const success = bunkerService.deleteConnection(id);
    return c.json({ success });
  });

  // GET /bunker/clients
  // List all NIP-46 clients that have been granted connect permission.
  api.get('/bunker/clients', (c) => {
    const clients = bunkerService.getAuthorizedClients();
    return c.json({ success: true, clients });
  });

  // DELETE /bunker/clients/:clientPubkey
  // Revoke a client's connect permission.
  api.delete('/bunker/clients/:clientPubkey', (c) => {
    const clientPubkey = c.req.param('clientPubkey');
    const success = bunkerService.revokeClientPermission(clientPubkey);
    return c.json({ success });
  });

  // GET /bunker/logs
  // Return the most recent RPC audit log entries (newest first).
  api.get('/bunker/logs', (c) => {
    const limitStr = c.req.query('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const logs = bunkerService.getAuditLogs(limit);
    return c.json({ success: true, logs });
  });

  return api;
}
