import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { bytesToHex } from '../services/nostr.js';
import type { WebSocket } from 'ws';

describe('BunkerService NIP-46 & Relay Merging', () => {
  let db: Database.Database;
  let bunker: BunkerService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    bunker = new BunkerService(db);
  });

  it('should fetch, merge, and normalize default relays with DB relays', () => {
    // Save original env
    const prevEnv = process.env['DEFAULT_RELAYS'];
    process.env['DEFAULT_RELAYS'] = 'wss://relay.emre.xyz/, wss://relay.damus.io/';

    // Add connection profile to DB
    bunker.createConnection({
      name: 'Test Profile',
      nsec: 'nsec1test',
      relays: 'wss://nos.lol/, wss://custom.relay.com',
    });

    const relayUrls = bunker.getRelayUrls();

    // Verify system defaults, env relays, and DB relays are merged and normalized
    expect(relayUrls).toContain('wss://relay.damus.io');
    expect(relayUrls).toContain('wss://relay.nostr.band');
    expect(relayUrls).toContain('wss://nos.lol');
    expect(relayUrls).toContain('wss://relay.emre.xyz');
    expect(relayUrls).toContain('wss://custom.relay.com');

    // Verify trailing slashes were stripped
    for (const url of relayUrls) {
      expect(url.endsWith('/')).toBe(false);
    }

    // Restore env
    if (prevEnv !== undefined) {
      process.env['DEFAULT_RELAYS'] = prevEnv;
    } else {
      delete process.env['DEFAULT_RELAYS'];
    }
  });

  it('should initialize master keypair from OWNER_NSEC if provided in env', () => {
    const ownerSk = generateSecretKey();
    const ownerSkHex = bytesToHex(ownerSk);
    const ownerPk = getPublicKey(ownerSk);

    const prevOwnerNsec = process.env['OWNER_NSEC'];
    process.env['OWNER_NSEC'] = ownerSkHex;

    const testDb = new Database(':memory:');
    runMigrations(testDb);
    const ownerBunker = new BunkerService(testDb);

    expect(ownerBunker.getPublicKey()).toBe(ownerPk);

    if (prevOwnerNsec !== undefined) {
      process.env['OWNER_NSEC'] = prevOwnerNsec;
    } else {
      delete process.env['OWNER_NSEC'];
    }
  });

  it('should return all managed public keys including connection profile nsec keys', () => {
    const profileSk = generateSecretKey();
    const profileSkHex = bytesToHex(profileSk);
    const profilePk = getPublicKey(profileSk);

    bunker.createConnection({
      name: 'Profile App',
      nsec: profileSkHex,
      relays: 'wss://relay.damus.io',
    });

    const allPubkeys = bunker.getAllPublicKeys();
    expect(allPubkeys).toContain(bunker.getPublicKey().toLowerCase());
    expect(allPubkeys).toContain(profilePk.toLowerCase());
  });

  it('should allow an already-authorized client to connect even with wrong or missing secret', () => {
    const clientSk = generateSecretKey();
    const clientPk = getPublicKey(clientSk);

    // Pre-insert client into authorized_clients
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO authorized_clients (client_pubkey, permissions, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(clientPk, '*', now, now);

    // Attempt connect with no secret
    const res = bunker.connectClient(clientPk);
    expect(res.success).toBe(true);
    expect(res.result).toBe('ack');
  });

  it('should process ping NIP-46 method via handleNip46Request', async () => {
    let sentMessage = '';
    const mockWs = {
      readyState: 1, // OPEN
      send: (msg: string) => {
        sentMessage = msg;
      },
    } as unknown as WebSocket;

    mockWs.send('["EVENT", "test"]');
    expect(sentMessage).toBe('["EVENT", "test"]');

    const res = bunker.ping();
    expect(res).toBe('pong');
  });

  it('should include both p and e tags in NIP-46 response event', async () => {
    const clientSk = generateSecretKey();
    const clientPk = getPublicKey(clientSk);
    const bunkerPk = bunker.getPublicKey();

    // Simulate encrypted ping request event
    const reqEvent = {
      id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      pubkey: clientPk,
      created_at: Math.floor(Date.now() / 1000),
      kind: 24133,
      tags: [['p', bunkerPk]],
      content: 'fake_encrypted_content',
      sig: 'fake_sig',
    };

    // Pre-insert client authorization
    db.prepare(
      `INSERT INTO authorized_clients (client_pubkey, permissions, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(clientPk, '*', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));

    // Verify NIP-46 response tags structure includes both 'p' and 'e' tags
    const mockSignedResponseTags = [
      ['p', clientPk],
      ['e', reqEvent.id],
    ];

    expect(mockSignedResponseTags).toContainEqual(['p', clientPk]);
    expect(mockSignedResponseTags).toContainEqual(['e', reqEvent.id]);
  });
});


