import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';
import { createApp } from '../app.js';
import { bytesToHex } from '../services/nostr.js';
import type { SafeBunkerConnectionRecord } from '../types/index.js';

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

describe('Multi-Tenant Isolation in Multi-User Mode', () => {
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

  it('isolates connection profiles between User A and User B', async () => {
    const userASk = generateSecretKey();
    const userBSk = generateSecretKey();

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    expect(bunker.getMode()).toBe('multi_user');

    const connUrl = 'http://localhost/api/v1/bunker/connections';

    // 1. User A creates a connection profile
    const connASk = bytesToHex(generateSecretKey());
    const authA_Post = createNip98AuthHeader(userASk, connUrl, 'POST');
    const createResA = await app.request('/api/v1/bunker/connections', {
      method: 'POST',
      headers: {
        Authorization: authA_Post,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'User A Damus Signer',
        nsec: connASk,
      }),
    });
    expect(createResA.status).toBe(200);
    const createdAData = (await createResA.json()) as { success: boolean; connection: SafeBunkerConnectionRecord };
    const connectionAId = createdAData.connection.id;
    expect(connectionAId).toBeDefined();

    // 2. User A fetches connections -> sees 1 connection
    const authA_Get = createNip98AuthHeader(userASk, connUrl, 'GET');
    const getResA = await app.request('/api/v1/bunker/connections', {
      headers: { Authorization: authA_Get },
    });
    expect(getResA.status).toBe(200);
    const dataA = (await getResA.json()) as { success: boolean; connections: SafeBunkerConnectionRecord[] };
    expect(dataA.connections.length).toBe(1);
    expect(dataA.connections[0].name).toBe('User A Damus Signer');

    // 3. User B fetches connections -> sees 0 connections (isolated!)
    const authB_Get = createNip98AuthHeader(userBSk, connUrl, 'GET');
    const getResB = await app.request('/api/v1/bunker/connections', {
      headers: { Authorization: authB_Get },
    });
    expect(getResB.status).toBe(200);
    const dataB = (await getResB.json()) as { success: boolean; connections: SafeBunkerConnectionRecord[] };
    expect(dataB.connections.length).toBe(0);

    // 4. User B attempts to update User A's connection -> fails
    const updateUrl = `http://localhost/api/v1/bunker/connections/${connectionAId}`;
    const authB_Put = createNip98AuthHeader(userBSk, updateUrl, 'PUT');
    const updateResB = await app.request(`/api/v1/bunker/connections/${connectionAId}`, {
      method: 'PUT',
      headers: {
        Authorization: authB_Put,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked name' }),
    });
    expect(updateResB.status).toBe(404);

    // 5. User B attempts to delete User A's connection -> returns false / doesn't delete
    const authB_Delete = createNip98AuthHeader(userBSk, updateUrl, 'DELETE');
    const deleteResB = await app.request(`/api/v1/bunker/connections/${connectionAId}`, {
      method: 'DELETE',
      headers: { Authorization: authB_Delete },
    });
    expect(deleteResB.status).toBe(200);
    const deleteDataB = (await deleteResB.json()) as { success: boolean };
    expect(deleteDataB.success).toBe(false);

    // Verify User A still has their connection
    const getResA2 = await app.request('/api/v1/bunker/connections', {
      headers: { Authorization: createNip98AuthHeader(userASk, connUrl, 'GET') },
    });
    const dataA2 = (await getResA2.json()) as { success: boolean; connections: SafeBunkerConnectionRecord[] };
    expect(dataA2.connections.length).toBe(1);
    expect(dataA2.connections[0].name).toBe('User A Damus Signer');
  });

  it('isolates bunker URIs and connect secrets between users', async () => {
    const userASk = generateSecretKey();
    const userBSk = generateSecretKey();

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    const uriUrl = 'http://localhost/api/v1/bunker/uri';

    // User A generates bunker URI
    const authA = createNip98AuthHeader(userASk, uriUrl, 'GET');
    const resA = await app.request('/api/v1/bunker/uri', {
      headers: { Authorization: authA },
    });
    const dataA = (await resA.json()) as { uri: string };
    const secretA = new URL(dataA.uri.replace('bunker://', 'http://')).searchParams.get('secret')!;

    // User B generates bunker URI
    const authB = createNip98AuthHeader(userBSk, uriUrl, 'GET');
    const resB = await app.request('/api/v1/bunker/uri', {
      headers: { Authorization: authB },
    });
    const dataB = (await resB.json()) as { uri: string };
    const secretB = new URL(dataB.uri.replace('bunker://', 'http://')).searchParams.get('secret')!;

    expect(secretA).not.toBe(secretB);

    // Client connects using User A's secret to User A
    const clientSk = generateSecretKey();
    const clientPk = getPublicKey(clientSk);

    const connectUrl = 'http://localhost/api/v1/bunker/connect';
    const authA_Connect = createNip98AuthHeader(userASk, connectUrl, 'POST');
    const connResA = await app.request('/api/v1/bunker/connect', {
      method: 'POST',
      headers: {
        Authorization: authA_Connect,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientPubkey: clientPk,
        secret: secretA,
      }),
    });
    expect(connResA.status).toBe(200);

    // User A sees authorized client
    const clientsUrl = 'http://localhost/api/v1/bunker/clients';
    const resClientsA = await app.request('/api/v1/bunker/clients', {
      headers: { Authorization: createNip98AuthHeader(userASk, clientsUrl, 'GET') },
    });
    const dataClientsA = (await resClientsA.json()) as { clients: Array<{ client_pubkey: string }> };
    expect(dataClientsA.clients.some((c) => c.client_pubkey === clientPk)).toBe(true);

    // User B does NOT see User A's client
    const resClientsB = await app.request('/api/v1/bunker/clients', {
      headers: { Authorization: createNip98AuthHeader(userBSk, clientsUrl, 'GET') },
    });
    const dataClientsB = (await resClientsB.json()) as { clients: Array<{ client_pubkey: string }> };
    expect(dataClientsB.clients.length).toBe(0);
  });

  it('isolates profiles between users', async () => {
    const userASk = generateSecretKey();
    const userBSk = generateSecretKey();

    const bunker = new BunkerService(db);
    const relay = new RelayManager(bunker, db);
    const app = createApp(bunker, relay);

    const profileUrl = 'http://localhost/api/v1/user/profile';

    // User A sets profile
    await app.request('/api/v1/user/profile', {
      method: 'POST',
      headers: {
        Authorization: createNip98AuthHeader(userASk, profileUrl, 'POST'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Alice in Bunker' }),
    });

    // User B sets profile
    await app.request('/api/v1/user/profile', {
      method: 'POST',
      headers: {
        Authorization: createNip98AuthHeader(userBSk, profileUrl, 'POST'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Bob in Bunker' }),
    });

    // User A gets profile
    const resA = await app.request('/api/v1/user/profile', {
      headers: { Authorization: createNip98AuthHeader(userASk, profileUrl, 'GET') },
    });
    const dataA = (await resA.json()) as { profile: { name: string } };
    expect(dataA.profile.name).toBe('Alice in Bunker');

    // User B gets profile
    const resB = await app.request('/api/v1/user/profile', {
      headers: { Authorization: createNip98AuthHeader(userBSk, profileUrl, 'GET') },
    });
    const dataB = (await resB.json()) as { profile: { name: string } };
    expect(dataB.profile.name).toBe('Bob in Bunker');
  });

  it('isolates NIP-46 client authorization between tenants', () => {
    const userASk = generateSecretKey();
    const userAPk = getPublicKey(userASk);
    const userBSk = generateSecretKey();
    const userBPk = getPublicKey(userBSk);

    const clientSk = generateSecretKey();
    const clientPk = getPublicKey(clientSk);

    const bunker = new BunkerService(db);

    // User A generates bunker URI and connects Client
    const uriA = bunker.generateBunkerUri(userAPk);
    const secretA = new URL(uriA.replace('bunker://', 'http://')).searchParams.get('secret')!;
    const connectRes = bunker.connectClient(clientPk, secretA, userAPk);
    expect(connectRes.success).toBe(true);

    // Client is authorized under User A
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1, userAPk)).not.toThrow();

    // Client is NOT authorized under User B -> throws error
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1, userBPk)).toThrow();

    // signEvent under User A works
    const template = {
      kind: 1,
      content: 'Hello from User A',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    };
    expect(() => bunker.signEvent(clientPk, template, userAPk)).not.toThrow();

    // signEvent under User B fails authorization
    expect(() => bunker.signEvent(clientPk, template, userBPk)).toThrow();
  });

  it('isolates relay discovery and lists between tenants', () => {
    const userASk = generateSecretKey();
    const userAPk = getPublicKey(userASk);
    const userBSk = generateSecretKey();
    const userBPk = getPublicKey(userBSk);

    const bunker = new BunkerService(db);

    // User A creates connection with custom relay
    bunker.createConnection(
      {
        name: 'User A Connection',
        nsec: bytesToHex(generateSecretKey()),
        relays: ['wss://relay.user-a.com'],
      },
      userAPk
    );

    // User B creates connection with different relay
    bunker.createConnection(
      {
        name: 'User B Connection',
        nsec: bytesToHex(generateSecretKey()),
        relays: ['wss://relay.user-b.com'],
      },
      userBPk
    );

    const relaysA = bunker.getRelayUrls(userAPk);
    const relaysB = bunker.getRelayUrls(userBPk);

    expect(relaysA).toContain('wss://relay.user-a.com');
    expect(relaysA).not.toContain('wss://relay.user-b.com');

    expect(relaysB).toContain('wss://relay.user-b.com');
    expect(relaysB).not.toContain('wss://relay.user-a.com');
  });
});
