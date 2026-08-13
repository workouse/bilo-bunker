import Database from 'better-sqlite3';
import { getPublicKey, finalizeEvent, verifyEvent, nip19, type VerifiedEvent, type EventTemplate } from 'nostr-tools';
import WebSocket from 'ws';
import {
  createKeyPair,
  parseNsecToKeypair,
  parseNpubToHex,
  extractRelaysFromNostrEvent,
  hexToBytes,
  nip44EncryptPayload,
  nip44DecryptPayload,
  nip04EncryptPayload,
  nip04DecryptPayload,
} from './nostr.js';
import type {
  AuthorizedClientRecord,
  BunkerConnectionRecord,
  NIP46RequestPayload,
  RPCAuditLogRecord,
  SafeBunkerConnectionRecord,
  UserProfile,
} from '../types/index.js';

// ── BunkerService ─────────────────────────────────────────────────────────────
//
// Central business-logic layer. Replaces the deleted Cloudflare BunkerDO.
// All public methods are synchronous except the NIP-04 pair and handleNip46Request,
// which must remain async because the underlying nip04.encrypt/decrypt are async.
//
// Dependency injection: callers pass in the `db` singleton from `../db/index.ts`
// so that the service is easily testable and has no top-level side-effects.

export class BunkerService {
  private readonly db: Database.Database;
  private readonly secretKeyHex: string;
  private readonly publicKey: string;
  private readonly mode: 'single_user' | 'multi_user';
  private readonly ownerPubkey?: string;

  // ── 5.2 Constructor ─────────────────────────────────────────────────────────

  constructor(db: Database.Database) {
    this.db = db;

    const ownerNsecEnv =
      process.env['OWNER_NSEC'] ||
      process.env['OWNER_SECRET_KEY'] ||
      process.env['NSEC'];
    const envKeyPair = ownerNsecEnv ? parseNsecToKeypair(ownerNsecEnv) : null;

    const ownerNpubEnv = process.env['OWNER_NPUB'] || process.env['OWNER_PUBKEY'];
    const parsedOwnerNpub = ownerNpubEnv ? parseNpubToHex(ownerNpubEnv) : null;

    if (envKeyPair) {
      // Secret key provided via environment: single user mode.
      db.prepare('DELETE FROM keys').run();
      db.prepare(
        'INSERT INTO keys (pubkey, secret_key, created_at) VALUES (?, ?, ?)'
      ).run(envKeyPair.publicKey, envKeyPair.secretKeyHex, Math.floor(Date.now() / 1000));
      this.secretKeyHex = envKeyPair.secretKeyHex;
      this.publicKey = envKeyPair.publicKey;
      this.ownerPubkey = envKeyPair.publicKey;
      this.mode = 'single_user';
      process.env['OWNER_PUBKEY'] = envKeyPair.publicKey;
      console.log(`[bunker] Operating in SINGLE USER MODE for owner: ${this.publicKey}`);
    } else {
      if (parsedOwnerNpub) {
        this.ownerPubkey = parsedOwnerNpub;
        process.env['OWNER_PUBKEY'] = parsedOwnerNpub;
        this.mode = 'multi_user';
        console.log(`[bunker] Operating in MULTI USER MODE (Owner pubkey: ${parsedOwnerNpub})`);
      } else {
        this.mode = 'multi_user';
      }

      const existing = db
        .prepare<[], { pubkey: string; secret_key: string }>(
          'SELECT pubkey, secret_key FROM keys LIMIT 1'
        )
        .get();

      if (existing) {
        this.secretKeyHex = existing.secret_key;
        this.publicKey = existing.pubkey;
      } else {
        const { secretKeyHex, publicKey } = createKeyPair();
        db.prepare(
          'INSERT INTO keys (pubkey, secret_key, created_at) VALUES (?, ?, ?)'
        ).run(publicKey, secretKeyHex, Math.floor(Date.now() / 1000));
        this.secretKeyHex = secretKeyHex;
        this.publicKey = publicKey;
      }
    }

    // Log the bunker public key on every boot so operators can verify identity.
    console.log(`[bunker] public key: ${this.publicKey}`);
  }

  getMode(): 'single_user' | 'multi_user' {
    return this.mode;
  }

  isSingleUserMode(): boolean {
    return this.mode === 'single_user';
  }

  getOwnerInfo(): { pubkey?: string; npub?: string; mode: 'single_user' | 'multi_user' } {
    const pubkey = this.ownerPubkey || this.publicKey;
    let npub: string | undefined;
    try {
      npub = nip19.npubEncode(pubkey);
    } catch {
      // Ignore encoding error
    }
    return {
      pubkey,
      npub,
      mode: this.mode,
    };
  }


  // ── 5.3 Core methods ────────────────────────────────────────────────────────

  /** Return the bunker's own NIP-46 public key. */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Return all public keys managed by this Bunker instance:
   * 1. Master owner public key
   * 2. Public keys for all connection profiles stored in `connections` table
   */
  getAllPublicKeys(): string[] {
    const pubkeys = [this.publicKey];

    const connRows = this.db
      .prepare<[], { nsec: string }>('SELECT nsec FROM connections')
      .all();

    for (const row of connRows) {
      if (row.nsec) {
        const kp = parseNsecToKeypair(row.nsec);
        if (kp) pubkeys.push(kp.publicKey);
      }
    }

    return [...new Set(pubkeys.map(pk => pk.trim().toLowerCase()).filter(Boolean))];
  }

  /**
   * Determine the appropriate secret key (hex) to use for decrypting and signing
   * an inbound NIP-46 event based on its `p` tag or target pubkey.
   */
  getSecretKeyForEvent(event: VerifiedEvent): { secretKeyHex: string; profile?: BunkerConnectionRecord } {
    const targetTag = event.tags.find(t => t[0] === 'p')?.[1]?.toLowerCase();

    if (targetTag && targetTag !== this.publicKey.toLowerCase()) {
      const connRows = this.db
        .prepare<[], BunkerConnectionRecord>('SELECT * FROM connections')
        .all();

      for (const conn of connRows) {
        if (conn.nsec) {
          const kp = parseNsecToKeypair(conn.nsec);
          if (kp && kp.publicKey.toLowerCase() === targetTag) {
            return { secretKeyHex: kp.secretKeyHex, profile: conn };
          }
        }
      }
    }

    return { secretKeyHex: this.secretKeyHex };
  }

  /**
   * Authorise a client that is completing the NIP-46 `connect` handshake.
   *
   * Secret validation is mandatory: the caller must supply the same secret that
   * was embedded in the bunker URI by `generateBunkerUri()`. The secret is stored
   * in the `state` table under key `bunker_connect_secret` and remains valid until
   * a new URI is generated (which replaces it).
   */
  connectClient(
    clientPubkey: string,
    secret?: string
  ): { success: boolean; result?: string; error?: string } {
    // If client is already authorized, allow reconnection without requiring a secret.
    const isAlreadyAuth = this.db
      .prepare<[string], { client_pubkey: string }>(
        'SELECT client_pubkey FROM authorized_clients WHERE client_pubkey = ?'
      )
      .get(clientPubkey);

    if (isAlreadyAuth) {
      return { success: true, result: 'ack' };
    }

    // Retrieve the currently active connect secret.
    const storedRow = this.db
      .prepare<[], { value: string }>(
        "SELECT value FROM state WHERE key = 'bunker_connect_secret'"
      )
      .get();

    if (!storedRow) {
      return {
        success: false,
        error: 'No active bunker URI — call generateBunkerUri first',
      };
    }

    if (!secret || secret !== storedRow.value) {
      return { success: false, error: 'Invalid or missing connection secret' };
    }

    // Secret is valid: upsert the client into authorized_clients.
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO authorized_clients (client_pubkey, permissions, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(client_pubkey) DO UPDATE SET
           permissions = excluded.permissions,
           updated_at  = excluded.updated_at`
      )
      .run(clientPubkey, '*', now, now);

    return { success: true, result: 'ack' };
  }

  /** Sign a Nostr event template on behalf of an authorised client. */
  signEvent(clientPubkey: string, eventTemplate: EventTemplate): VerifiedEvent {
    this.assertAuthorized(clientPubkey, 'sign_event');
    return finalizeEvent(eventTemplate, hexToBytes(this.secretKeyHex));
  }

  /** NIP-44 encrypt a payload on behalf of an authorised client. */
  nip44Encrypt(
    clientPubkey: string,
    recipientPubkey: string,
    plaintext: string
  ): string {
    this.assertAuthorized(clientPubkey, 'nip44_encrypt');
    return nip44EncryptPayload(this.secretKeyHex, recipientPubkey, plaintext);
  }

  /** NIP-44 decrypt a payload on behalf of an authorised client. */
  nip44Decrypt(
    clientPubkey: string,
    senderPubkey: string,
    ciphertext: string
  ): string {
    this.assertAuthorized(clientPubkey, 'nip44_decrypt');
    return nip44DecryptPayload(this.secretKeyHex, senderPubkey, ciphertext);
  }

  /** NIP-04 encrypt a payload on behalf of an authorised client (async). */
  async nip04Encrypt(
    clientPubkey: string,
    recipientPubkey: string,
    plaintext: string
  ): Promise<string> {
    this.assertAuthorized(clientPubkey, 'nip04_encrypt');
    return nip04EncryptPayload(this.secretKeyHex, recipientPubkey, plaintext);
  }

  /** NIP-04 decrypt a payload on behalf of an authorised client (async). */
  async nip04Decrypt(
    clientPubkey: string,
    senderPubkey: string,
    ciphertext: string
  ): Promise<string> {
    this.assertAuthorized(clientPubkey, 'nip04_decrypt');
    return nip04DecryptPayload(this.secretKeyHex, senderPubkey, ciphertext);
  }

  /** NIP-46 liveness check. */
  ping(): string {
    return 'pong';
  }

  // ── 5.4 Query methods ───────────────────────────────────────────────────────

  /** List all clients that have been granted connect permission. */
  getAuthorizedClients(): AuthorizedClientRecord[] {
    return this.db
      .prepare<[], AuthorizedClientRecord>(
        'SELECT * FROM authorized_clients ORDER BY created_at DESC'
      )
      .all();
  }

  /**
   * Remove a client's authorisation.
   * @returns `true` if a row was deleted, `false` if the client was not found.
   */
  revokeClientPermission(clientPubkey: string): boolean {
    const result = this.db
      .prepare('DELETE FROM authorized_clients WHERE client_pubkey = ?')
      .run(clientPubkey);
    return result.changes > 0;
  }

  /** Return the most recent RPC audit log entries (newest first). */
  getAuditLogs(limit = 50): RPCAuditLogRecord[] {
    return this.db
      .prepare<[number], RPCAuditLogRecord>(
        'SELECT * FROM rpc_audit_logs ORDER BY created_at DESC LIMIT ?'
      )
      .all(limit);
  }

  /**
   * Return all named relay connections.
   * The `nsec` field is intentionally excluded — callers always receive the
   * safe projection so that private keys are never leaked over the HTTP API.
   */
  getConnections(): SafeBunkerConnectionRecord[] {
    const rows = this.db
      .prepare<[], BunkerConnectionRecord>(
        `SELECT id, name, nsec, expiration, whitelisted_npub, relays, created_at, updated_at
         FROM connections
         ORDER BY created_at DESC`
      )
      .all();

    return rows.map((r) => {
      const kp = parseNsecToKeypair(r.nsec);
      const pubkey = kp ? kp.publicKey : this.publicKey;
      return {
        id: r.id,
        name: r.name,
        pubkey,
        expiration: r.expiration,
        whitelisted_npub: r.whitelisted_npub,
        relays: r.relays,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  }

  // ── 5.5 Connection CRUD ─────────────────────────────────────────────────────

  /**
   * Generate a NIP-46 bunker URI for the current keypair.
   *
   * A random 32-character hex secret is generated on every call, stored in the
   * `state` table (replacing any previous secret), and embedded in the URI.
   * Clients that attempt `connect` without this exact secret will be rejected.
   */
  generateBunkerUri(relays?: string[]): string {
    const relayList = relays ?? this.getRelayUrls();

    // Generate a cryptographically random secret and persist it.
    const secret = crypto.randomUUID().replace(/-/g, '');
    this.db
      .prepare(
        "INSERT OR REPLACE INTO state (key, value) VALUES ('bunker_connect_secret', ?)"
      )
      .run(secret);

    const params = new URLSearchParams();
    for (const relay of relayList) {
      params.append('relay', relay);
    }
    params.set('secret', secret);

    return `bunker://${this.publicKey}?${params.toString()}`;
  }

  /** Create a named relay connection profile. Returns the safe record (no nsec). */
  createConnection(params: {
    name: string;
    nsec: string;
    expiration?: number;
    whitelisted_npub?: string;
    whitelistedNpub?: string;
    relays?: string | string[];
  }): SafeBunkerConnectionRecord {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const relaysStr = Array.isArray(params.relays)
      ? params.relays.join(', ')
      : typeof params.relays === 'string'
      ? params.relays
      : '';

    const whitelistedNpubStr =
      typeof params.whitelisted_npub === 'string'
        ? params.whitelisted_npub
        : typeof params.whitelistedNpub === 'string'
        ? params.whitelistedNpub
        : '';

    this.db
      .prepare(
        `INSERT INTO connections
           (id, name, nsec, expiration, whitelisted_npub, relays, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.name,
        params.nsec,
        params.expiration ?? 0,
        whitelistedNpubStr,
        relaysStr,
        now,
        now
      );

    const kp = parseNsecToKeypair(params.nsec);
    const pubkey = kp ? kp.publicKey : this.publicKey;

    return {
      id,
      name: params.name,
      pubkey,
      expiration: params.expiration ?? 0,
      whitelisted_npub: whitelistedNpubStr,
      relays: relaysStr,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Update an existing connection profile.
   * Only the fields present in `params` are changed; all others retain their
   * current database values. Throws if the connection id does not exist.
   */
  updateConnection(
    id: string,
    params: Partial<{
      name: string;
      nsec: string;
      expiration: number;
      whitelisted_npub: string;
      whitelistedNpub: string;
      relays: string | string[];
    }>
  ): SafeBunkerConnectionRecord {
    const existing = this.db
      .prepare<[string], BunkerConnectionRecord>(
        'SELECT * FROM connections WHERE id = ?'
      )
      .get(id);

    if (!existing) {
      throw new Error(`Connection '${id}' not found`);
    }

    const now = Math.floor(Date.now() / 1000);

    const relaysStr =
      params.relays !== undefined
        ? Array.isArray(params.relays)
          ? params.relays.join(', ')
          : String(params.relays)
        : existing.relays;

    const whitelistedNpubStr =
      params.whitelisted_npub !== undefined
        ? String(params.whitelisted_npub)
        : params.whitelistedNpub !== undefined
        ? String(params.whitelistedNpub)
        : existing.whitelisted_npub;

    const merged: BunkerConnectionRecord = {
      ...existing,
      name: params.name ?? existing.name,
      nsec: params.nsec ?? existing.nsec,
      expiration: params.expiration ?? existing.expiration,
      whitelisted_npub: whitelistedNpubStr,
      relays: relaysStr,
      updated_at: now,
    };

    this.db
      .prepare(
        `UPDATE connections
         SET name = ?, nsec = ?, expiration = ?, whitelisted_npub = ?, relays = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        merged.name,
        merged.nsec,
        merged.expiration,
        merged.whitelisted_npub,
        merged.relays,
        now,
        id
      );

    const kp = parseNsecToKeypair(merged.nsec);
    const pubkey = kp ? kp.publicKey : this.publicKey;

    // Return safe projection — never expose nsec.
    return {
      id: merged.id,
      name: merged.name,
      pubkey,
      expiration: merged.expiration,
      whitelisted_npub: merged.whitelisted_npub,
      relays: merged.relays,
      created_at: merged.created_at,
      updated_at: now,
    };
  }

  /**
   * Delete a connection profile.
   * @returns `true` if a row was deleted, `false` if the id was not found.
   */
  deleteConnection(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM connections WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  // ── 5.6 New methods ─────────────────────────────────────────────────────────

  /**
   * Return the deduplicated and normalized union of relay URLs from:
   *   1. System default relays fallback ('wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol')
   *   2. The `DEFAULT_RELAYS` environment variable (comma-separated).
   *   3. The `relays` column of every row in the `connections` table (user's custom relays).
   *
   * Normalizes URLs by trimming whitespace and removing trailing slashes.
   */
  /**
   * Return the deduplicated and normalized union of relay URLs from:
   *   1. System default relays fallback ('wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol')
   *   2. The `DEFAULT_RELAYS` environment variable (comma-separated).
   *   3. The `relays` column of every row in the `connections` table (user's custom relays).
   *   4. NIP-65 & Kind 3 user personal relays fetched from the network and cached in state (`fetched_user_relays`).
   *
   * Normalizes URLs by trimming whitespace and removing trailing slashes.
   */
  getRelayUrls(): string[] {
    const normalize = (url: string): string =>
      url.trim().replace(/\/+$/, '');

    const systemDefaults = [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://nos.lol',
    ];

    const rows = this.db
      .prepare<[], { relays: string }>('SELECT relays FROM connections')
      .all();

    const fromDb = rows
      .flatMap(r => r.relays.split(','))
      .map(normalize)
      .filter(Boolean);

    const fromEnv = (process.env['DEFAULT_RELAYS'] ?? '')
      .split(',')
      .map(normalize)
      .filter(Boolean);

    const fetchedRow = this.db
      .prepare<[], { value: string }>(
        "SELECT value FROM state WHERE key = 'fetched_user_relays'"
      )
      .get();

    const fromFetched = fetchedRow
      ? fetchedRow.value
          .split(',')
          .map(normalize)
          .filter(Boolean)
      : [];

    const merged = [...systemDefaults, ...fromEnv, ...fromDb, ...fromFetched];
    return [...new Set(merged.map(normalize))];
  }

  /**
   * Query Nostr indexer relays (including wss://relay.emre.xyz) for kind 10002 & kind 3 events
   * for all managed pubkeys, extract user personal relays, save to SQLite `state`, and return discovered relays.
   */
  async fetchUserRelaysFromNetwork(extraPubkeys?: string[]): Promise<string[]> {
    const managedPubkeys = this.getAllPublicKeys();
    const ownerPubkeyEnv = process.env['OWNER_PUBKEY'];
    if (ownerPubkeyEnv) managedPubkeys.push(ownerPubkeyEnv.trim().toLowerCase());
    if (extraPubkeys) managedPubkeys.push(...extraPubkeys);

    const pubkeys = [...new Set(managedPubkeys.filter(Boolean))];
    if (pubkeys.length === 0) return [];

    const indexerRelays = [
      'wss://purplepag.es',
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://relay.primal.net',
      'wss://relay.emre.xyz',
      'wss://nos.lol',
    ];

    const discoveredRelays = new Set<string>();

    await Promise.all(
      indexerRelays.map(async (relayUrl) => {
        try {
          const fetched = await new Promise<string[]>((resolve) => {
            const ws = new WebSocket(relayUrl);
            const found: string[] = [];
            const subId = `nip65-fetch-${Math.random().toString(36).slice(2, 7)}`;
            const timer = setTimeout(() => {
              try { ws.close(); } catch { /* ignore close error */ }
              resolve(found);
            }, 3500);

            ws.on('open', () => {
              ws.send(
                JSON.stringify([
                  'REQ',
                  subId,
                  { kinds: [10002, 3], authors: pubkeys, limit: 10 },
                ])
              );
            });

            ws.on('message', (data) => {
              try {
                const parsed = JSON.parse(data.toString()) as unknown[];
                if (Array.isArray(parsed) && parsed[0] === 'EVENT' && parsed[2]) {
                  const ev = parsed[2] as { kind: number; tags?: string[][]; content?: string };
                  const extracted = extractRelaysFromNostrEvent(ev);
                  found.push(...extracted);
                } else if (Array.isArray(parsed) && parsed[0] === 'EOSE') {
                  clearTimeout(timer);
                  try { ws.close(); } catch { /* ignore close error */ }
                  resolve(found);
                }
              } catch {
                // Ignore parse errors
              }
            });

            ws.on('error', () => {
              clearTimeout(timer);
              resolve(found);
            });
          });

          for (const r of fetched) {
            discoveredRelays.add(r);
          }
        } catch {
          // Ignore connection errors
        }
      })
    );

    if (discoveredRelays.size > 0) {
      const relayListStr = Array.from(discoveredRelays).join(',');
      this.db
        .prepare(
          "INSERT OR REPLACE INTO state (key, value) VALUES ('fetched_user_relays', ?)"
        )
        .run(relayListStr);
      console.log(
        `[bunker] Discovered & cached ${discoveredRelays.size} personal user relay(s) from network`
      );
    }

    return Array.from(discoveredRelays);
  }

  /** Return the owner's profile, or `null` if none has been set yet. */
  getProfile(): UserProfile | null {
    return (
      this.db
        .prepare<[], UserProfile>('SELECT * FROM profiles LIMIT 1')
        .get() ?? null
    );
  }

  /**
   * Create or update the owner's profile.
   * The pubkey is always the bunker's own public key — it cannot be overridden
   * by callers, preventing profile spoofing.
   */
  setProfile(data: Omit<UserProfile, 'pubkey' | 'updated_at'>): UserProfile {
    const now = Math.floor(Date.now() / 1000);

    this.db
      .prepare(
        `INSERT INTO profiles (pubkey, name, nip05, picture, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET
           name       = excluded.name,
           nip05      = excluded.nip05,
           picture    = excluded.picture,
           updated_at = excluded.updated_at`
      )
      .run(
        this.publicKey,
        data.name ?? null,
        data.nip05 ?? null,
        data.picture ?? null,
        now
      );

    return { pubkey: this.publicKey, ...data, updated_at: now };
  }

  // ── 5.7 NIP-46 handler ──────────────────────────────────────────────────────

  /**
   * Process a single inbound NIP-46 relay event and send the encrypted response
   * back on the same WebSocket connection.
   *
   * Flow (11 steps):
   *  1. Kind guard (104 | 24133 | 1059 only)
   *  2. Signature verification
   *  3. Update last_processed_timestamp in state
   *  4. Decrypt payload (NIP-04 for kind 104, NIP-44 otherwise)
   *  5. JSON-parse { id, method, params }
   *  6. Route method to appropriate service call
   *  7. Audit-log every RPC call (success or error)
   *  8. Build response payload { id, result?, error? }
   *  9. Encrypt response (same scheme as decryption)
   * 10. Sign response event
   * 11. Send ["EVENT", signedResponse] over responseWs
   */
  async handleNip46Request(event: VerifiedEvent, responseWs: WebSocket): Promise<void> {
    // 1. Kind guard (4 = NIP-04 DM, 104 = legacy, 24133 = NIP-46 ephemeral, 1059 = gift wrap)
    if (![4, 104, 24133, 1059].includes(event.kind)) {
      console.warn(`[bunker] Ignoring unexpected event kind ${event.kind}`);
      return;
    }

    // 2. Signature verification
    if (!verifyEvent(event)) {
      console.warn('[bunker] Received event with invalid Nostr signature — dropping');
      return;
    }

    // 3. Persist relay watermark
    this.db
      .prepare(
        "INSERT OR REPLACE INTO state (key, value) VALUES ('last_processed_timestamp', ?)"
      )
      .run(String(Math.floor(Date.now() / 1000)));

    // 4. Resolve target keypair & profile
    const { secretKeyHex, profile } = this.getSecretKeyForEvent(event);

    if (profile) {
      const now = Math.floor(Date.now() / 1000);
      if (profile.expiration > 0 && now > profile.expiration) {
        console.warn(`[bunker] Rejecting request: connection profile '${profile.name}' has expired`);
        return;
      }

      if (profile.whitelisted_npub && profile.whitelisted_npub.trim()) {
        const whitelistedKp = parseNsecToKeypair(profile.whitelisted_npub);
        const whitelistedPubkey = whitelistedKp ? whitelistedKp.publicKey : profile.whitelisted_npub.trim();
        if (whitelistedPubkey.toLowerCase() !== event.pubkey.toLowerCase()) {
          console.warn(
            `[bunker] Rejecting request: client ${event.pubkey} is not whitelisted on profile '${profile.name}'`
          );
          return;
        }
      }
    }

    // 4b. Decrypt payload & unwrap NIP-59 Gift Wrap if kind 1059
    let decrypted: string;
    let clientPubkey = event.pubkey;

    try {
      if (event.kind === 1059) {
        // NIP-59 Gift Wrap: decrypt 1059 -> 1054 Seal -> Rumor event -> JSON-RPC content
        const sealJson = nip44DecryptPayload(secretKeyHex, event.pubkey, event.content);
        const sealEvent = JSON.parse(sealJson) as { pubkey: string; content: string };
        const sealSender = sealEvent.pubkey || event.pubkey;

        const rumorJson = nip44DecryptPayload(secretKeyHex, sealSender, sealEvent.content);
        try {
          const rumorEvent = JSON.parse(rumorJson) as { pubkey?: string; content?: string };
          clientPubkey = rumorEvent.pubkey || sealSender;
          decrypted = rumorEvent.content || rumorJson;
        } catch {
          clientPubkey = sealSender;
          decrypted = rumorJson;
        }
      } else if ([4, 104].includes(event.kind)) {
        decrypted = await nip04DecryptPayload(secretKeyHex, event.pubkey, event.content);
      } else {
        decrypted = nip44DecryptPayload(secretKeyHex, event.pubkey, event.content);
      }
    } catch (err) {
      console.error('[bunker] Failed to decrypt NIP-46 payload:', err);
      return;
    }

    // 5. Parse
    let payload: NIP46RequestPayload;
    try {
      payload = JSON.parse(decrypted) as NIP46RequestPayload;
    } catch {
      console.error('[bunker] NIP-46 payload is not valid JSON — dropping');
      return;
    }

    const { id } = payload;
    const method = payload.method ?? (payload as unknown as { req?: { method?: string } }).req?.method;
    const paramsArr = Array.isArray(payload.params)
      ? payload.params
      : Array.isArray((payload as unknown as { req?: { params?: unknown[] } }).req?.params)
      ? (payload as unknown as { req: { params: unknown[] } }).req.params
      : [];

    console.log(
      `[bunker] Processing NIP-46 method '${method ?? 'unknown'}' (id: ${id}) from client ${clientPubkey} ${
        profile ? `(profile: '${profile.name}')` : ''
      }`
    );

    // 6. Route
    let result: unknown;
    let rpcError: string | undefined;

    try {
      switch (method) {
        case 'connect': {
          const connResult = this.connectClient(clientPubkey, paramsArr[0] as string | undefined);
          if (!connResult.success) throw new Error(connResult.error ?? 'connect failed');
          result = connResult.result ?? 'ack';
          break;
        }
        case 'get_public_key': {
          const skBytes = hexToBytes(secretKeyHex);
          result = getPublicKey(skBytes);
          break;
        }
        case 'sign_event': {
          this.assertAuthorized(clientPubkey, 'sign_event');
          result = JSON.stringify(finalizeEvent(paramsArr[0] as EventTemplate, hexToBytes(secretKeyHex)));
          break;
        }
        case 'nip44_encrypt':
          this.assertAuthorized(clientPubkey, 'nip44_encrypt');
          result = nip44EncryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'nip44_decrypt':
          this.assertAuthorized(clientPubkey, 'nip44_decrypt');
          result = nip44DecryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'nip04_encrypt':
          this.assertAuthorized(clientPubkey, 'nip04_encrypt');
          result = await nip04EncryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'nip04_decrypt':
          this.assertAuthorized(clientPubkey, 'nip04_decrypt');
          result = await nip04DecryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'ping':
          result = this.ping();
          break;
        default:
          rpcError = `Unknown NIP-46 method: ${method ?? 'unknown'}`;
      }
    } catch (err) {
      rpcError = err instanceof Error ? err.message : String(err);
    }

    if (rpcError) {
      console.warn(`[bunker] Method '${method ?? 'unknown'}' failed: ${rpcError}`);
    } else {
      console.log(`[bunker] Method '${method}' executed successfully`);
    }

    // 7. Audit log (always — even for errors)
    this.logRpc(
      clientPubkey,
      method,
      JSON.stringify(paramsArr),
      rpcError ? 'error' : 'success'
    );

    // 8. Build response
    const responsePayload = rpcError
      ? { id, error: rpcError }
      : { id, result };

    // 9. Encrypt response
    let encryptedResponse: string;
    try {
      const responseJson = JSON.stringify(responsePayload);
      encryptedResponse =
        [4, 104].includes(event.kind)
          ? await nip04EncryptPayload(secretKeyHex, clientPubkey, responseJson)
          : nip44EncryptPayload(secretKeyHex, clientPubkey, responseJson);
    } catch (err) {
      console.error('[bunker] Failed to encrypt NIP-46 response:', err);
      return;
    }

    // 10. Sign response event
    const signedResponse = finalizeEvent(
      {
        kind: event.kind,
        content: encryptedResponse,
        tags: [
          ['p', clientPubkey],
          ['e', event.id],
        ],
        created_at: Math.floor(Date.now() / 1000),
      },
      hexToBytes(secretKeyHex)
    );

    // 11. Transmit
    responseWs.send(JSON.stringify(['EVENT', signedResponse]));
  }

  // ── 5.8 Private helpers ─────────────────────────────────────────────────────

  /**
   * Throw if `clientPubkey` is not present in `authorized_clients`.
   * The `method` parameter is included in the error message for auditability
   * and is reserved for future per-method permission checks.
   */
  private assertAuthorized(clientPubkey: string, method: string): void {
    const row = this.db
      .prepare<[string], { client_pubkey: string }>(
        'SELECT client_pubkey FROM authorized_clients WHERE client_pubkey = ?'
      )
      .get(clientPubkey);

    if (!row) {
      throw new Error(
        `Client ${clientPubkey} is not authorized to call '${method}'`
      );
    }
  }

  /** Append a single entry to the immutable RPC audit log. */
  private logRpc(
    clientPubkey: string,
    method: string | undefined,
    params: string,
    status: string
  ): void {
    const safeMethod = method || 'unknown';
    this.db
      .prepare(
        `INSERT INTO rpc_audit_logs (client_pubkey, method, params, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(clientPubkey, safeMethod, params, status, Math.floor(Date.now() / 1000));
  }

}
