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
  // Returns the user's profile metadata and bunker pubkey.
  api.get('/user/profile', (c) => {
    const user = c.get('user');
    const bunkerPubkey = bunkerService.getPublicKey();
    const profile = bunkerService.getProfile(user.pubkey);

    return c.json({
      userPubkey: user.pubkey,
      bunkerPubkey,
      profile: profile ?? { pubkey: user.pubkey, updated_at: Math.floor(Date.now() / 1000) },
    });
  });

  // POST /user/profile
  // Create or update the user profile stored in the `profiles` SQLite table.
  api.post('/user/profile', async (c) => {
    const user = c.get('user');
    const body = await c.req.json<{ name?: string; nip05?: string; picture?: string }>();

    const updated = bunkerService.setProfile({
      name: body.name,
      nip05: body.nip05,
      picture: body.picture,
    }, user.pubkey);

    return c.json({ success: true, profile: updated });
  });

  // POST /bunker/connect
  // Authorise a NIP-46 client that is completing the connect handshake.
  api.post('/bunker/connect', async (c) => {
    const user = c.get('user');
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

    const response = bunkerService.connectClient(body.clientPubkey, body.secret, user.pubkey);
    return c.json(response);
  });

  // GET /bunker/uri
  // Generate a fresh NIP-46 bunker:// URI (rotates the connect secret for this user).
  api.get('/bunker/uri', (c) => {
    const user = c.get('user');
    const uri = bunkerService.generateBunkerUri(user.pubkey);
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

    const user = c.get('user');
    const relays = await bunkerService.fetchUserRelaysFromNetwork(
      targetPubkey ? [targetPubkey] : undefined,
      user.pubkey
    );
    return c.json({ success: true, relays });
  });

  // GET /bunker/connections
  // List all named relay connection profiles for the authenticated user.
  api.get('/bunker/connections', (c) => {
    const user = c.get('user');
    const connections = bunkerService.getConnections(user.pubkey);
    return c.json({ success: true, connections });
  });

  // POST /bunker/connections
  // Create a new named relay connection profile for the authenticated user.
  api.post('/bunker/connections', async (c) => {
    const user = c.get('user');
    const body = await c.req.json<{
      name: string;
      nsec: string;
      expiration?: number;
      whitelisted_npub?: string;
      whitelistedNpub?: string;
      relays?: string | string[];
      permissions?: string;
      rules?: Array<{
        method: string;
        kind?: number | null;
        policy: 'allow' | 'block';
      }>;
    }>();

    const connection = bunkerService.createConnection(body, user.pubkey);

    // Pick up any newly added relay URLs without requiring a restart.
    relayManager.refreshRelays();

    return c.json({ success: true, connection });
  });

  // PUT /bunker/connections/:id
  // Partially update an existing relay connection profile.
  api.put('/bunker/connections/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      nsec?: string;
      expiration?: number;
      whitelisted_npub?: string;
      whitelistedNpub?: string;
      relays?: string | string[];
      permissions?: string;
      rules?: Array<{
        method: string;
        kind?: number | null;
        policy: 'allow' | 'block';
      }>;
    }>();

    let connection: ReturnType<BunkerService['updateConnection']>;
    try {
      connection = bunkerService.updateConnection(id, body, user.pubkey);
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
    const user = c.get('user');
    const id = c.req.param('id');
    const success = bunkerService.deleteConnection(id, user.pubkey);
    return c.json({ success });
  });

  // GET /bunker/clients
  // List all NIP-46 clients that have been granted connect permission for this user.
  api.get('/bunker/clients', (c) => {
    const user = c.get('user');
    const clients = bunkerService.getAuthorizedClients(user.pubkey);
    return c.json({ success: true, clients });
  });

  // GET /bunker/clients/:clientPubkey/rules
  // Get all granular permission rules configured for a client under this user.
  api.get('/bunker/clients/:clientPubkey/rules', (c) => {
    const user = c.get('user');
    const clientPubkey = c.req.param('clientPubkey');
    const rules = bunkerService.getClientRules(clientPubkey, user.pubkey);
    return c.json({ success: true, rules });
  });

  // PUT /bunker/clients/:clientPubkey/rules
  // Replace granular permission rules for a client under this user.
  api.put('/bunker/clients/:clientPubkey/rules', async (c) => {
    const user = c.get('user');
    const clientPubkey = c.req.param('clientPubkey');
    const body = await c.req.json<{
      rules?: Array<{
        method: string;
        kind?: number | null;
        policy: 'allow' | 'block';
      }>;
    }>();

    if (!Array.isArray(body.rules)) {
      return c.json(
        {
          error: 'Bad Request',
          message: 'rules must be an array of rule objects',
        },
        400
      );
    }

    // Validate each rule
    for (const r of body.rules) {
      if (!r.method || typeof r.method !== 'string') {
        return c.json(
          {
            error: 'Bad Request',
            message: 'Each rule must have a valid string method',
          },
          400
        );
      }
      if (r.policy !== 'allow' && r.policy !== 'block') {
        return c.json(
          {
            error: 'Bad Request',
            message: "Rule policy must be either 'allow' or 'block'",
          },
          400
        );
      }
      if (r.kind !== undefined && r.kind !== null && typeof r.kind !== 'number') {
        return c.json(
          {
            error: 'Bad Request',
            message: 'Rule kind must be a number or null',
          },
          400
        );
      }
    }

    try {
      const updatedRules = bunkerService.setClientRules(clientPubkey, body.rules, user.pubkey);
      return c.json({ success: true, rules: updatedRules });
    } catch (err) {
      return c.json(
        {
          error: 'Bad Request',
          message: err instanceof Error ? err.message : String(err),
        },
        400
      );
    }
  });

  // DELETE /bunker/clients/:clientPubkey/rules
  // Reset client granular rules back to default permissions.
  api.delete('/bunker/clients/:clientPubkey/rules', (c) => {
    const user = c.get('user');
    const clientPubkey = c.req.param('clientPubkey');
    const success = bunkerService.deleteClientRules(clientPubkey, user.pubkey);
    return c.json({ success });
  });

  // DELETE /bunker/clients/:clientPubkey
  // Revoke a client's connect permission.
  api.delete('/bunker/clients/:clientPubkey', (c) => {
    const user = c.get('user');
    const clientPubkey = c.req.param('clientPubkey');
    const success = bunkerService.revokeClientPermission(clientPubkey, user.pubkey);
    return c.json({ success });
  });

  // GET /bunker/logs
  // Return the most recent RPC audit log entries (newest first) for this user.
  api.get('/bunker/logs', (c) => {
    const user = c.get('user');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const logs = bunkerService.getAuditLogs(limit, user.pubkey);
    return c.json({ success: true, logs });
  });

  return api;
}
