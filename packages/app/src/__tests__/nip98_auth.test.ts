import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';
import { createApp } from '../app.js';
import { bytesToHex } from '../services/nostr.js';

function createNip98AuthHeader(secretKey: Uint8Array, url: string, method: string): string {
  const event = finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', url],
        ['m', method],
      ],
      content: '',
    },
    secretKey
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
}

describe('NIP-98 Authentication & Authorization Middleware', () => {
  let db: Database.Database;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    delete process.env['OWNER_NSEC'];
    delete process.env['OWNER_SECRET_KEY'];
    delete process.env['NSEC'];
    delete process.env['OWNER_NPUB'];
    delete process.env['OWNER_PUBKEY'];
    delete process.env['PUBLIC_URL'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should reject requests with 401 when Authorization header is missing or malformed', async () => {
    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    const resMissing = await app.request('/api/v1/bunker/uri');
    expect(resMissing.status).toBe(401);
    const bodyMissing = (await resMissing.json()) as { error: string };
    expect(bodyMissing.error).toBe('Unauthorized');

    const resMalformed = await app.request('/api/v1/bunker/uri', {
      headers: { Authorization: 'Bearer token123' },
    });
    expect(resMalformed.status).toBe(401);
  });

  it('in MULTI USER MODE: allows authenticated users to access their isolated resources', async () => {
    const userSk = generateSecretKey();

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    expect(bunker.getMode()).toBe('multi_user');

    const targetUrl = 'http://localhost/api/v1/bunker/uri';

    const userAuth = createNip98AuthHeader(userSk, targetUrl, 'GET');
    const userRes = await app.request('/api/v1/bunker/uri', {
      headers: { Authorization: userAuth },
    });
    expect(userRes.status).toBe(200);
    const userData = (await userRes.json()) as { success: boolean; uri: string };
    expect(userData.success).toBe(true);
    expect(userData.uri).toContain('bunker://');
  });

  it('in SINGLE USER MODE: allows owner nsec key and rejects non-owner pubkeys with 403', async () => {
    const ownerSk = generateSecretKey();
    const ownerSkHex = bytesToHex(ownerSk);
    const ownerPk = getPublicKey(ownerSk);
    process.env['OWNER_NSEC'] = ownerSkHex;

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    expect(bunker.getMode()).toBe('single_user');
    expect(bunker.getPublicKey()).toBe(ownerPk);

    const targetUrl = 'http://localhost/api/v1/bunker/connections';

    // 1. Owner signs request -> 200 OK
    const ownerAuth = createNip98AuthHeader(ownerSk, targetUrl, 'GET');
    const ownerRes = await app.request('/api/v1/bunker/connections', {
      headers: { Authorization: ownerAuth },
    });
    expect(ownerRes.status).toBe(200);

    // 2. Attacker / stranger signs request -> 403 Forbidden
    const strangerSk = generateSecretKey();
    const strangerAuth = createNip98AuthHeader(strangerSk, targetUrl, 'GET');
    const strangerRes = await app.request('/api/v1/bunker/connections', {
      headers: { Authorization: strangerAuth },
    });
    expect(strangerRes.status).toBe(403);
    const strangerData = (await strangerRes.json()) as { error: string; message: string };
    expect(strangerData.error).toBe('Forbidden');
    expect(strangerData.message).toContain('Single-user mode');
  });

  describe('behind a TLS-terminating reverse proxy', () => {
    const publicUrl = 'https://bunker.example.com/api/v1/bunker/uri';
    const internalUrl = 'http://bunker.example.com/api/v1/bunker/uri';

    it('accepts an https-signed request forwarded over http with X-Forwarded-Proto', async () => {
      const bunker = new BunkerService(db);
      const app = createApp(bunker, new RelayManager(bunker, db));

      const res = await app.request(internalUrl, {
        headers: {
          Authorization: createNip98AuthHeader(generateSecretKey(), publicUrl, 'GET'),
          'X-Forwarded-Proto': 'https',
        },
      });
      expect(res.status).toBe(200);
    });

    it('uses the first value of a comma-separated X-Forwarded-Proto chain', async () => {
      const bunker = new BunkerService(db);
      const app = createApp(bunker, new RelayManager(bunker, db));

      const res = await app.request(internalUrl, {
        headers: {
          Authorization: createNip98AuthHeader(generateSecretKey(), publicUrl, 'GET'),
          'X-Forwarded-Proto': 'https, http',
        },
      });
      expect(res.status).toBe(200);
    });

    it('still rejects an https-signed request without forwarding headers', async () => {
      const bunker = new BunkerService(db);
      const app = createApp(bunker, new RelayManager(bunker, db));

      const res = await app.request(internalUrl, {
        headers: { Authorization: createNip98AuthHeader(generateSecretKey(), publicUrl, 'GET') },
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { message: string };
      expect(body.message).toContain('NIP-98 URL mismatch');
    });

    it('does not let X-Forwarded-Host replay a token signed for another host', async () => {
      const bunker = new BunkerService(db);
      const app = createApp(bunker, new RelayManager(bunker, db));

      const res = await app.request(internalUrl, {
        headers: {
          Authorization: createNip98AuthHeader(
            generateSecretKey(),
            'https://other-service.example.org/api/v1/bunker/uri',
            'GET'
          ),
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'other-service.example.org',
        },
      });
      expect(res.status).toBe(401);
    });

    it('uses PUBLIC_URL as the origin when set', async () => {
      process.env['PUBLIC_URL'] = 'https://bunker.example.com';
      const bunker = new BunkerService(db);
      const app = createApp(bunker, new RelayManager(bunker, db));

      const res = await app.request('http://app:3000/api/v1/bunker/uri', {
        headers: { Authorization: createNip98AuthHeader(generateSecretKey(), publicUrl, 'GET') },
      });
      expect(res.status).toBe(200);
    });
  });
});
