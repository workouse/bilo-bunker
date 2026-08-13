import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { parseNpubToHex, bytesToHex } from '../services/nostr.js';
import { createApp } from '../app.js';
import { RelayManager } from '../services/relay.js';

describe('BunkerService Operating Modes & Key Utilities', () => {
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

  it('should correctly parse npub1 strings and hex pubkeys with parseNpubToHex', () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const npub = nip19.npubEncode(pk);

    expect(parseNpubToHex(npub)).toBe(pk.toLowerCase());
    expect(parseNpubToHex(pk)).toBe(pk.toLowerCase());
    expect(parseNpubToHex('invalid_npub')).toBeNull();
  });

  it('should initialize SINGLE USER MODE when OWNER_NSEC is provided', () => {
    const sk = generateSecretKey();
    const skHex = bytesToHex(sk);
    const pk = getPublicKey(sk);

    process.env['OWNER_NSEC'] = skHex;

    const bunker = new BunkerService(db);
    expect(bunker.getMode()).toBe('single_user');
    expect(bunker.isSingleUserMode()).toBe(true);
    expect(bunker.getPublicKey()).toBe(pk);
    expect(bunker.getOwnerInfo().pubkey).toBe(pk);
  });

  it('should initialize MULTI USER MODE when OWNER_NPUB is provided without OWNER_NSEC', () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const npub = nip19.npubEncode(pk);

    process.env['OWNER_NPUB'] = npub;

    const bunker = new BunkerService(db);
    expect(bunker.getMode()).toBe('multi_user');
    expect(bunker.isSingleUserMode()).toBe(false);
    expect(bunker.getOwnerInfo().pubkey).toBe(pk);
  });

  it('should return mode and owner info via health and config endpoints', async () => {
    const sk = generateSecretKey();
    const skHex = bytesToHex(sk);
    const pk = getPublicKey(sk);

    process.env['OWNER_NSEC'] = skHex;

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    const healthRes = await app.request('/api/v1/health');
    expect(healthRes.status).toBe(200);
    const healthData = (await healthRes.json()) as { mode: string; owner: { pubkey: string } };
    expect(healthData.mode).toBe('single_user');
    expect(healthData.owner.pubkey).toBe(pk);

    const configRes = await app.request('/api/v1/config');
    expect(configRes.status).toBe(200);
    const configData = (await configRes.json()) as { mode: string; bunker_pubkey: string };
    expect(configData.mode).toBe('single_user');
    expect(configData.bunker_pubkey).toBe(pk);
  });
});
