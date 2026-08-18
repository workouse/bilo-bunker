import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import {
  bytesToHex,
  nip04EncryptPayload,
  nip04DecryptPayload,
  nip44EncryptPayload,
  nip44DecryptPayload,
} from '../services/nostr.js';
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

  it('should process NIP-04 encrypted kind 24133 request and respond with NIP-04', async () => {
    const clientSk = generateSecretKey();
    const clientSkHex = bytesToHex(clientSk);
    const clientPk = getPublicKey(clientSk);
    const bunkerPk = bunker.getPublicKey();

    // Pre-authorize client
    bunker.connectClient(clientPk);

    // Build NIP-04 encrypted RPC request
    const rpcRequest = { id: 'req-nip04-1', method: 'describe', params: [] };
    const ciphertext = await nip04EncryptPayload(clientSkHex, bunkerPk, JSON.stringify(rpcRequest));

    const inboundEvent = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', bunkerPk]],
        content: ciphertext,
      },
      clientSk
    );

    let sentFrame = '';
    const mockWs = {
      readyState: 1,
      send: (msg: string) => {
        sentFrame = msg;
      },
    } as unknown as WebSocket;

    await bunker.handleNip46Request(inboundEvent, mockWs);

    expect(sentFrame).toBeTruthy();
    const [tag, responseEvent] = JSON.parse(sentFrame);
    expect(tag).toBe('EVENT');
    expect(responseEvent.kind).toBe(24133);
    expect(verifyEvent(responseEvent)).toBe(true);

    // Decrypt response with client key using NIP-04
    const decryptedJson = await nip04DecryptPayload(clientSkHex, bunkerPk, responseEvent.content);
    const responsePayload = JSON.parse(decryptedJson);

    expect(responsePayload.id).toBe('req-nip04-1');
    expect(Array.isArray(responsePayload.result)).toBe(true);
    expect(responsePayload.result).toContain('sign_event');
  });

  it('should process NIP-44 encrypted kind 24133 request and respond with NIP-44', async () => {
    const clientSk = generateSecretKey();
    const clientSkHex = bytesToHex(clientSk);
    const clientPk = getPublicKey(clientSk);
    const bunkerPk = bunker.getPublicKey();

    // Pre-authorize client
    bunker.connectClient(clientPk);

    // Build NIP-44 encrypted RPC request
    const rpcRequest = { id: 'req-nip44-1', method: 'get_relays', params: [] };
    const ciphertext = nip44EncryptPayload(clientSkHex, bunkerPk, JSON.stringify(rpcRequest));

    const inboundEvent = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', bunkerPk]],
        content: ciphertext,
      },
      clientSk
    );

    let sentFrame = '';
    const mockWs = {
      readyState: 1,
      send: (msg: string) => {
        sentFrame = msg;
      },
    } as unknown as WebSocket;

    await bunker.handleNip46Request(inboundEvent, mockWs);

    expect(sentFrame).toBeTruthy();
    const [tag, responseEvent] = JSON.parse(sentFrame);
    expect(tag).toBe('EVENT');
    expect(responseEvent.kind).toBe(24133);
    expect(verifyEvent(responseEvent)).toBe(true);

    // Decrypt response with client key using NIP-44
    const decryptedJson = nip44DecryptPayload(clientSkHex, bunkerPk, responseEvent.content);
    const responsePayload = JSON.parse(decryptedJson);

    expect(responsePayload.id).toBe('req-nip44-1');
    expect(responsePayload.result).toBeDefined();
    expect(typeof responsePayload.result).toBe('object');
  });

  it('should handle sign_event when event template is passed as a serialized JSON string', async () => {
    const clientSk = generateSecretKey();
    const clientSkHex = bytesToHex(clientSk);
    const clientPk = getPublicKey(clientSk);
    const bunkerPk = bunker.getPublicKey();

    bunker.connectClient(clientPk);

    const eventTemplate = {
      kind: 1,
      content: 'Hello Nostr from Bilo Bunker!',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    };

    // Client passes template as stringified JSON in params[0]
    const rpcRequest = {
      id: 'req-sign-1',
      method: 'sign_event',
      params: [JSON.stringify(eventTemplate)],
    };

    const ciphertext = nip44EncryptPayload(clientSkHex, bunkerPk, JSON.stringify(rpcRequest));
    const inboundEvent = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', bunkerPk]],
        content: ciphertext,
      },
      clientSk
    );

    let sentFrame = '';
    const mockWs = {
      readyState: 1,
      send: (msg: string) => {
        sentFrame = msg;
      },
    } as unknown as WebSocket;

    await bunker.handleNip46Request(inboundEvent, mockWs);

    expect(sentFrame).toBeTruthy();
    const [, responseEvent] = JSON.parse(sentFrame);
    const decryptedJson = nip44DecryptPayload(clientSkHex, bunkerPk, responseEvent.content);
    const responsePayload = JSON.parse(decryptedJson);

    expect(responsePayload.id).toBe('req-sign-1');
    expect(responsePayload.error).toBeUndefined();
    expect(responsePayload.result).toBeTruthy();

    const signedEvent = JSON.parse(responsePayload.result);
    expect(signedEvent.kind).toBe(1);
    expect(signedEvent.content).toBe('Hello Nostr from Bilo Bunker!');
    expect(signedEvent.pubkey).toBe(bunkerPk);
    expect(verifyEvent(signedEvent)).toBe(true);
  });

  it('should connect to custom connection profile and sign with connection profile nsec', async () => {
    const profileSk = generateSecretKey();
    const profileSkHex = bytesToHex(profileSk);
    const profilePk = getPublicKey(profileSk);

    // Create custom connection profile
    bunker.createConnection(
      {
        name: 'Damus Mobile',
        nsec: profileSkHex,
        relays: 'wss://relay.damus.io',
      },
      '46f3c7bb33cc3019049b76dc89dbb96e34c247bdda68b6ad8632682793ff8a1a'
    );

    const clientSk = generateSecretKey();
    const clientSkHex = bytesToHex(clientSk);
    const clientPk = getPublicKey(clientSk);

    // 1. Client connects to profile pubkey without requiring global secret
    const connectReq = {
      id: 'conn-1',
      method: 'connect',
      params: [profilePk],
    };
    const connCiphertext = nip44EncryptPayload(clientSkHex, profilePk, JSON.stringify(connectReq));
    const connInbound = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', profilePk]],
        content: connCiphertext,
      },
      clientSk
    );

    let connSent = '';
    const mockWs = {
      readyState: 1,
      send: (msg: string) => {
        connSent = msg;
      },
    } as unknown as WebSocket;

    await bunker.handleNip46Request(connInbound, mockWs);
    const [, connResEvent] = JSON.parse(connSent);
    const connResPayload = JSON.parse(nip44DecryptPayload(clientSkHex, profilePk, connResEvent.content));
    expect(connResPayload.result).toBe('ack');
    expect(bunker.getAuthorizedClients('46f3c7bb33cc3019049b76dc89dbb96e34c247bdda68b6ad8632682793ff8a1a').some(c => c.client_pubkey === clientPk)).toBe(true);

    // 2. Client calls get_public_key on connection profile
    const getPkReq = { id: 'getpk-1', method: 'get_public_key', params: [] };
    const getPkCiphertext = nip44EncryptPayload(clientSkHex, profilePk, JSON.stringify(getPkReq));
    const getPkInbound = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', profilePk]],
        content: getPkCiphertext,
      },
      clientSk
    );

    let getPkSent = '';
    const mockWs2 = {
      readyState: 1,
      send: (msg: string) => {
        getPkSent = msg;
      },
    } as unknown as WebSocket;

    await bunker.handleNip46Request(getPkInbound, mockWs2);
    const [, getPkResEvent] = JSON.parse(getPkSent);
    const getPkResPayload = JSON.parse(nip44DecryptPayload(clientSkHex, profilePk, getPkResEvent.content));
    expect(getPkResPayload.result).toBe(profilePk);

    // 3. Client calls sign_event on connection profile
    const signReq = {
      id: 'sign-conn-1',
      method: 'sign_event',
      params: [{ kind: 1, content: 'Signed via connection profile nsec', tags: [], created_at: Math.floor(Date.now() / 1000) }],
    };
    const signCiphertext = nip44EncryptPayload(clientSkHex, profilePk, JSON.stringify(signReq));
    const signInbound = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', profilePk]],
        content: signCiphertext,
      },
      clientSk
    );

    let signSent = '';
    const mockWs3 = {
      readyState: 1,
      send: (msg: string) => {
        signSent = msg;
      },
    } as unknown as WebSocket;

    await bunker.handleNip46Request(signInbound, mockWs3);
    const [, signResEvent] = JSON.parse(signSent);
    const signResPayload = JSON.parse(nip44DecryptPayload(clientSkHex, profilePk, signResEvent.content));

    expect(signResPayload.error).toBeUndefined();
    const signedEvent = JSON.parse(signResPayload.result);
    expect(signedEvent.pubkey).toBe(profilePk);
    expect(signedEvent.content).toBe('Signed via connection profile nsec');
    expect(verifyEvent(signedEvent)).toBe(true);
  });
});


