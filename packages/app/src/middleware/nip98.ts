import { Context, Next } from 'hono';
import { validateNip98Header } from '../services/nostr.js';
import type { BunkerService } from '../services/bunker.js';

export function createNip98AuthMiddleware(bunkerService: BunkerService) {
  return async function nip98AuthMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization') || '';
    const url = c.req.url;
    const method = c.req.method;

    const result = validateNip98Header(authHeader, url, method);

    if (!result.isValid || !result.pubkey) {
      return c.json(
        {
          error: 'Unauthorized',
          message: result.error || 'NIP-98 authentication failed',
        },
        401
      );
    }

    const masterPubkey = bunkerService.getPublicKey().toLowerCase();
    const serviceOwnerPubkey = (bunkerService.getOwnerInfo().pubkey || '').toLowerCase();
    const envOwnerPubkey = (process.env.OWNER_PUBKEY || '').toLowerCase();
    const callerPubkey = result.pubkey.toLowerCase();

    const isOwner =
      callerPubkey === masterPubkey ||
      (Boolean(serviceOwnerPubkey) && callerPubkey === serviceOwnerPubkey) ||
      (Boolean(envOwnerPubkey) && callerPubkey === envOwnerPubkey);

    if (!isOwner) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Forbidden: only the bunker owner can access administrative endpoints.',
        },
        403
      );
    }

    c.set('user', {
      pubkey: result.pubkey,
      event: result.event,
      isOwner,
    });

    await next();
  };
}

