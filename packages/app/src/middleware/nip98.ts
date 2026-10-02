import { Context, Next } from 'hono';
import { validateNip98Header } from '../services/nostr.js';
import type { BunkerService } from '../services/bunker.js';

/**
 * Reconstructs the URL the client actually called, so it can be compared to
 * the NIP-98 `u` tag.
 *
 * Behind a TLS-terminating reverse proxy (Caddy, Nginx Proxy Manager, ...)
 * the app receives plain HTTP, so `c.req.url` starts with `http://` while the
 * browser signed `https://`. The scheme is taken from `X-Forwarded-Proto`;
 * the host is kept from the Host header (forwarded by the proxy) so a token
 * signed for another site cannot be replayed here by spoofing a header.
 * `PUBLIC_URL` pins the origin explicitly when the proxy setup is unusual.
 */
export function getExternalRequestUrl(c: Context): string {
  const url = new URL(c.req.url);

  const publicUrl = process.env.PUBLIC_URL?.trim();
  if (publicUrl) {
    return new URL(url.pathname + url.search, new URL(publicUrl).origin).toString();
  }

  const forwardedProto = c.req.header('X-Forwarded-Proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwardedProto === 'https' || forwardedProto === 'http') {
    url.protocol = `${forwardedProto}:`;
  }

  return url.toString();
}

export function createNip98AuthMiddleware(bunkerService: BunkerService) {
  return async function nip98AuthMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization') || '';
    const url = getExternalRequestUrl(c);
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

    if (bunkerService.isSingleUserMode() && !isOwner) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Single-user mode: only the bunker owner can access this instance.',
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

