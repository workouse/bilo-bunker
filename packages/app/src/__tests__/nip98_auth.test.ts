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

  it('in MULTI USER MODE: allows designated owner pubkey and rejects non-owner pubkeys with 403', async () => {
    const ownerSk = generateSecretKey();
    const ownerPk = getPublicKey(ownerSk);
    process.env['OWNER_PUBKEY'] = ownerPk;

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    expect(bunker.getMode()).toBe('multi_user');

    const targetUrl = 'http://localhost/api/v1/bunker/uri';

    // 1. Designated owner signs request -> 200 OK
    const ownerAuth = createNip98AuthHeader(ownerSk, targetUrl, 'GET');
    const ownerRes = await app.request('/api/v1/bunker/uri', {
      headers: { Authorization: ownerAuth },
    });
    expect(ownerRes.status).toBe(200);
    const ownerData = (await ownerRes.json()) as { success: boolean; uri: string };
    expect(ownerData.success).toBe(true);
    expect(ownerData.uri).toContain('bunker://');

    // 2. Random third-party / attacker signs request with valid Nostr key -> 403 Forbidden
    const strangerSk = generateSecretKey();
    const strangerAuth = createNip98AuthHeader(strangerSk, targetUrl, 'GET');
    const strangerRes = await app.request('/api/v1/bunker/uri', {
      headers: { Authorization: strangerAuth },
    });
    expect(strangerRes.status).toBe(403);
    const strangerData = (await strangerRes.json()) as { error: string; message: string };
    expect(strangerData.error).toBe('Forbidden');
    expect(strangerData.message).toContain('only the bunker owner can access');
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
  });
});
