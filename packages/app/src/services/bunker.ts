import Database from 'better-sqlite3';
import { getPublicKey, finalizeEvent, verifyEvent, nip19, type VerifiedEvent, type EventTemplate } from 'nostr-tools';
import WebSocket from 'ws';
import {
  createKeyPair,
  parseNsecToKeypair,
  parseNpubToHex,
  extractRelaysFromNostrEvent,
  hexToBytes,
  bytesToHex,
  nip44EncryptPayload,
  nip44DecryptPayload,
  nip04EncryptPayload,
  nip04DecryptPayload,
} from './nostr.js';
import type {
  AuthorizedClientRecord,
  BunkerConnectionRecord,
  ClientPermissionRecord,
  GranularRule,
  GranularRuleWithLabel,
  NIP46RequestPayload,
  RPCAuditLogRecord,
  SafeBunkerConnectionRecord,
  UserProfile,
} from '../types/index.js';
import { getFriendlyOperationLabel } from '../types/index.js';

// ── BunkerService ─────────────────────────────────────────────────────────────
//
// Central business-logic layer for bunker state management.
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

    if (targetTag) {
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
   * in the `state` table and remains valid until a new URI is generated.
   */
  connectClient(
    clientPubkey: string,
    secret?: string,
    userPubkeyOrPermissions?: string,
    profilePermissions?: string,
    profile?: BunkerConnectionRecord
  ): { success: boolean; result?: string; error?: string } {
    let cleanPubkey = profile?.user_pubkey || '';
    let perms = profile?.permissions || profilePermissions;

    if (userPubkeyOrPermissions && !cleanPubkey) {
      if (
        userPubkeyOrPermissions.startsWith('[') ||
        userPubkeyOrPermissions.startsWith('{') ||
        userPubkeyOrPermissions === '*'
      ) {
        perms = userPubkeyOrPermissions;
      } else {
        cleanPubkey = userPubkeyOrPermissions.trim().toLowerCase();
      }
    }

    // Check whitelisting if profile specifies one
    if (profile?.whitelisted_npub && profile.whitelisted_npub.trim()) {
      const whitelistedHex = parseNpubToHex(profile.whitelisted_npub) || profile.whitelisted_npub.trim().toLowerCase();
      if (whitelistedHex !== clientPubkey.toLowerCase()) {
        return {
          success: false,
          error: `Client '${clientPubkey}' is not whitelisted for connection profile '${profile.name}'`,
        };
      }
    }

    // If client is already authorized for this user, allow reconnection without requiring a secret.
    const isAlreadyAuth = cleanPubkey
      ? this.db
          .prepare<[string, string], { client_pubkey: string }>(
            'SELECT client_pubkey FROM authorized_clients WHERE client_pubkey = ? AND LOWER(user_pubkey) = ?'
          )
          .get(clientPubkey, cleanPubkey)
      : this.db
          .prepare<[string], { client_pubkey: string }>(
            'SELECT client_pubkey FROM authorized_clients WHERE client_pubkey = ?'
          )
          .get(clientPubkey);

    if (isAlreadyAuth) {
      return { success: true, result: 'ack' };
    }

    let matchedUserPubkey = cleanPubkey;

    // If connecting directly to a connection profile, authorize the client without requiring a master rotation secret
    if (!profile) {
      if (cleanPubkey) {
        const storedRow = this.db
          .prepare<[string], { value: string }>(
            'SELECT value FROM state WHERE key = ?'
          )
          .get(`bunker_connect_secret:${cleanPubkey}`);

        const fallbackRow = this.db
          .prepare<[], { value: string }>(
            "SELECT value FROM state WHERE key = 'bunker_connect_secret'"
          )
          .get();

        const expectedSecret = storedRow?.value || fallbackRow?.value;
        if (expectedSecret && (!secret || secret !== expectedSecret)) {
          return { success: false, error: 'Invalid or missing connection secret' };
        }
      } else if (secret !== undefined) {
        const allSecrets = this.db
          .prepare<[], { key: string; value: string }>(
            "SELECT key, value FROM state WHERE key LIKE 'bunker_connect_secret%'"
          )
          .all();

        if (allSecrets.length > 0) {
          const matched = allSecrets.find((s) => s.value === secret);
          if (!matched) {
            return { success: false, error: 'Invalid or missing connection secret' };
          }
          if (matched.key.startsWith('bunker_connect_secret:')) {
            matchedUserPubkey = matched.key.split(':')[1] || '';
          }
        }
      }
    }

    // Insert the client into authorized_clients.
    const now = Math.floor(Date.now() / 1000);
    const initialPerms = perms || '*';

    this.db
      .prepare(
        `INSERT INTO authorized_clients (user_pubkey, client_pubkey, permissions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(matchedUserPubkey, clientPubkey, initialPerms, now, now);

    // If profile has granular rules defined, initialize client_permissions
    if (perms && perms !== '*') {
      try {
        const rules = JSON.parse(perms);
        if (Array.isArray(rules) && rules.length > 0) {
          this.setClientRules(clientPubkey, rules, matchedUserPubkey);
        }
      } catch {
        // ignore
      }
    }

    return { success: true, result: 'ack' };
  }

  /** Sign a Nostr event template on behalf of an authorised client. */
  signEvent(clientPubkey: string, eventTemplate: EventTemplate, userPubkey?: string): VerifiedEvent {
    this.assertAuthorized(clientPubkey, 'sign_event', eventTemplate?.kind, userPubkey);
    return finalizeEvent(eventTemplate, hexToBytes(this.secretKeyHex));
  }

  /** NIP-44 encrypt a payload on behalf of an authorised client. */
  nip44Encrypt(
    clientPubkey: string,
    recipientPubkey: string,
    plaintext: string,
    userPubkey?: string
  ): string {
    this.assertAuthorized(clientPubkey, 'nip44_encrypt', undefined, userPubkey);
    return nip44EncryptPayload(this.secretKeyHex, recipientPubkey, plaintext);
  }

  /** NIP-44 decrypt a payload on behalf of an authorised client. */
  nip44Decrypt(
    clientPubkey: string,
    senderPubkey: string,
    ciphertext: string,
    userPubkey?: string
  ): string {
    this.assertAuthorized(clientPubkey, 'nip44_decrypt', undefined, userPubkey);
    return nip44DecryptPayload(this.secretKeyHex, senderPubkey, ciphertext);
  }

  /** NIP-04 encrypt a payload on behalf of an authorised client (async). */
  async nip04Encrypt(
    clientPubkey: string,
    recipientPubkey: string,
    plaintext: string,
    userPubkey?: string
  ): Promise<string> {
    this.assertAuthorized(clientPubkey, 'nip04_encrypt', undefined, userPubkey);
    return nip04EncryptPayload(this.secretKeyHex, recipientPubkey, plaintext);
  }

  /** NIP-04 decrypt a payload on behalf of an authorised client (async). */
  async nip04Decrypt(
    clientPubkey: string,
    senderPubkey: string,
    ciphertext: string,
    userPubkey?: string
  ): Promise<string> {
    this.assertAuthorized(clientPubkey, 'nip04_decrypt', undefined, userPubkey);
    return nip04DecryptPayload(this.secretKeyHex, senderPubkey, ciphertext);
  }

  /** NIP-46 liveness check. */
  ping(): string {
    return 'pong';
  }

  // ── 5.4 Granular permissions and client queries ─────────────────────────────

  /** Get all configured granular rules for a specific client with friendly labels. */
  getClientRules(clientPubkey: string, userPubkey?: string): GranularRuleWithLabel[] {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    const rows = cleanPubkey
      ? this.db
          .prepare<[string, string], ClientPermissionRecord>(
            'SELECT * FROM client_permissions WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\') ORDER BY method, kind'
          )
          .all(clientPubkey, cleanPubkey)
      : this.db
          .prepare<[string], ClientPermissionRecord>(
            'SELECT * FROM client_permissions WHERE client_pubkey = ? ORDER BY method, kind'
          )
          .all(clientPubkey);

    return rows.map((r) => ({
      method: r.method,
      kind: r.kind,
      policy: r.policy,
      label: getFriendlyOperationLabel(r.method, r.kind),
    }));
  }

  /**
   * Set granular rules for a client in an atomic transaction.
   * Replaces all existing rules for this client.
   */
  setClientRules(
    clientPubkey: string,
    rules: GranularRule[],
    userPubkey?: string
  ): GranularRuleWithLabel[] {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';

    const isAuth = cleanPubkey
      ? this.db
          .prepare<[string, string], { client_pubkey: string }>(
            'SELECT client_pubkey FROM authorized_clients WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
          )
          .get(clientPubkey, cleanPubkey)
      : this.db
          .prepare<[string], { client_pubkey: string }>(
            'SELECT client_pubkey FROM authorized_clients WHERE client_pubkey = ?'
          )
          .get(clientPubkey);

    if (!isAuth) {
      throw new Error(`Client '${clientPubkey}' is not in authorized clients list`);
    }

    const now = Math.floor(Date.now() / 1000);

    this.db.transaction(() => {
      if (cleanPubkey) {
        this.db
          .prepare(
            'DELETE FROM client_permissions WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
          )
          .run(clientPubkey, cleanPubkey);
      } else {
        this.db
          .prepare('DELETE FROM client_permissions WHERE client_pubkey = ?')
          .run(clientPubkey);
      }

      const insertStmt = this.db.prepare(
        `INSERT INTO client_permissions (user_pubkey, client_pubkey, method, kind, policy, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const rule of rules) {
        const safeKind = typeof rule.kind === 'number' ? rule.kind : null;
        insertStmt.run(cleanPubkey, clientPubkey, rule.method, safeKind, rule.policy, now, now);
      }
    })();

    return this.getClientRules(clientPubkey, cleanPubkey);
  }

  /** Delete all granular rules for a client, reverting to default authorization. */
  deleteClientRules(clientPubkey: string, userPubkey?: string): boolean {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    let result: Database.RunResult;

    if (cleanPubkey) {
      result = this.db
        .prepare(
          'DELETE FROM client_permissions WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
        )
        .run(clientPubkey, cleanPubkey);
    } else {
      result = this.db
        .prepare('DELETE FROM client_permissions WHERE client_pubkey = ?')
        .run(clientPubkey);
    }
    return result.changes > 0;
  }

  /** List all clients that have been granted connect permission. */
  getAuthorizedClients(userPubkey?: string): AuthorizedClientRecord[] {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';

    if (cleanPubkey && !this.isSingleUserMode()) {
      return this.db
        .prepare<[string], AuthorizedClientRecord>(
          'SELECT user_pubkey, client_pubkey, permissions, created_at, updated_at FROM authorized_clients WHERE LOWER(user_pubkey) = ? ORDER BY created_at DESC'
        )
        .all(cleanPubkey);
    }

    return this.db
      .prepare<[], AuthorizedClientRecord>(
        'SELECT user_pubkey, client_pubkey, permissions, created_at, updated_at FROM authorized_clients ORDER BY created_at DESC'
      )
      .all();
  }

  /**
   * Remove a client's authorisation and any associated granular rules.
   * @returns `true` if a row was deleted, `false` if the client was not found.
   */
  revokeClientPermission(clientPubkey: string, userPubkey?: string): boolean {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';

    if (cleanPubkey && !this.isSingleUserMode()) {
      this.db
        .prepare(
          'DELETE FROM client_permissions WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
        )
        .run(clientPubkey, cleanPubkey);
      const result = this.db
        .prepare(
          'DELETE FROM authorized_clients WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
        )
        .run(clientPubkey, cleanPubkey);
      return result.changes > 0;
    }

    this.db
      .prepare('DELETE FROM client_permissions WHERE client_pubkey = ?')
      .run(clientPubkey);
    const result = this.db
      .prepare('DELETE FROM authorized_clients WHERE client_pubkey = ?')
      .run(clientPubkey);
    return result.changes > 0;
  }

  /** Return the most recent RPC audit log entries (newest first). */
  getAuditLogs(limit = 50, userPubkey?: string): RPCAuditLogRecord[] {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';

    if (cleanPubkey && !this.isSingleUserMode()) {
      return this.db
        .prepare<[string, number], RPCAuditLogRecord>(
          'SELECT id, user_pubkey, client_pubkey, method, params, status, created_at FROM rpc_audit_logs WHERE LOWER(user_pubkey) = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(cleanPubkey, limit);
    }

    return this.db
      .prepare<[number], RPCAuditLogRecord>(
        'SELECT id, user_pubkey, client_pubkey, method, params, status, created_at FROM rpc_audit_logs ORDER BY created_at DESC LIMIT ?'
      )
      .all(limit);
  }

  /**
   * Return all named relay connections.
   * The `nsec` field is intentionally excluded — callers always receive the
   * safe projection so that private keys are never leaked over the HTTP API.
   */
  getConnections(userPubkey?: string): SafeBunkerConnectionRecord[] {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    let rows: BunkerConnectionRecord[];

    if (cleanPubkey && !this.isSingleUserMode()) {
      rows = this.db
        .prepare<[string], BunkerConnectionRecord>(
          `SELECT id, user_pubkey, name, nsec, expiration, whitelisted_npub, relays, permissions, created_at, updated_at
           FROM connections
           WHERE LOWER(user_pubkey) = ?
           ORDER BY created_at DESC`
        )
        .all(cleanPubkey);
    } else {
      rows = this.db
        .prepare<[], BunkerConnectionRecord>(
          `SELECT id, user_pubkey, name, nsec, expiration, whitelisted_npub, relays, permissions, created_at, updated_at
           FROM connections
           ORDER BY created_at DESC`
        )
        .all();
    }

    return rows.map((r) => {
      const kp = parseNsecToKeypair(r.nsec);
      const pubkey = kp ? kp.publicKey : this.publicKey;
      let parsedRules: GranularRuleWithLabel[] | undefined;
      if (r.permissions && r.permissions !== '*') {
        try {
          const rawRules = JSON.parse(r.permissions);
          if (Array.isArray(rawRules)) {
            parsedRules = rawRules.map((rule: GranularRule) => ({
              ...rule,
              label: getFriendlyOperationLabel(rule.method, rule.kind),
            }));
          }
        } catch {
          // ignore
        }
      }

      return {
        id: r.id,
        user_pubkey: r.user_pubkey,
        name: r.name,
        pubkey,
        expiration: r.expiration,
        whitelisted_npub: r.whitelisted_npub,
        relays: r.relays,
        permissions: r.permissions ?? '*',
        rules: parsedRules,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  }

  // ── 5.5 Connection CRUD ─────────────────────────────────────────────────────

  /**
   * Generate a NIP-46 bunker URI for the current keypair or user.
   *
   * A random 32-character hex secret is generated on every call, stored in the
   * `state` table (scoped by userPubkey if provided), and embedded in the URI.
   * Clients that attempt `connect` without this exact secret will be rejected.
   */
  generateBunkerUri(userPubkey?: string, relays?: string[]): string {
    const relayList = relays ?? this.getRelayUrls();
    const secret = crypto.randomUUID().replace(/-/g, '');
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';

    if (cleanPubkey) {
      this.db
        .prepare(
          'INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)'
        )
        .run(`bunker_connect_secret:${cleanPubkey}`, secret);
    }

    // Persist global secret only in single user mode or when no cleanPubkey is provided
    if (this.isSingleUserMode() || !cleanPubkey) {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO state (key, value) VALUES ('bunker_connect_secret', ?)"
        )
        .run(secret);
    }

    const params = new URLSearchParams();
    for (const relay of relayList) {
      params.append('relay', relay);
    }
    params.set('secret', secret);

    return `bunker://${this.publicKey}?${params.toString()}`;
  }

  /** Create a named relay connection profile. Returns the safe record (no nsec). */
  createConnection(
    params: {
      name: string;
      nsec: string;
      expiration?: number;
      whitelisted_npub?: string;
      whitelistedNpub?: string;
      relays?: string | string[];
      permissions?: string;
      rules?: GranularRule[];
    },
    userPubkey?: string
  ): SafeBunkerConnectionRecord {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';

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

    const permissionsStr =
      params.rules && Array.isArray(params.rules) && params.rules.length > 0
        ? JSON.stringify(params.rules)
        : typeof params.permissions === 'string' && params.permissions.trim()
        ? params.permissions.trim()
        : '*';

    this.db
      .prepare(
        `INSERT INTO connections
           (id, user_pubkey, name, nsec, expiration, whitelisted_npub, relays, permissions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        cleanPubkey,
        params.name,
        params.nsec,
        params.expiration ?? 0,
        whitelistedNpubStr,
        relaysStr,
        permissionsStr,
        now,
        now
      );

    // If a whitelisted client pubkey is given, immediately authorize & apply rules
    if (whitelistedNpubStr) {
      const hexPubkey = parseNpubToHex(whitelistedNpubStr);
      if (hexPubkey) {
        this.db
          .prepare(
            `INSERT INTO authorized_clients (user_pubkey, client_pubkey, permissions, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(cleanPubkey, hexPubkey, permissionsStr, now, now);

        if (params.rules && Array.isArray(params.rules) && params.rules.length > 0) {
          this.setClientRules(hexPubkey, params.rules, cleanPubkey);
        }
      }
    }

    const kp = parseNsecToKeypair(params.nsec);
    const pubkey = kp ? kp.publicKey : this.publicKey;

    let parsedRules: GranularRuleWithLabel[] | undefined;
    if (params.rules && Array.isArray(params.rules)) {
      parsedRules = params.rules.map((rule) => ({
        ...rule,
        label: getFriendlyOperationLabel(rule.method, rule.kind),
      }));
    }

    return {
      id,
      user_pubkey: cleanPubkey,
      name: params.name,
      pubkey,
      expiration: params.expiration ?? 0,
      whitelisted_npub: whitelistedNpubStr,
      relays: relaysStr,
      permissions: permissionsStr,
      rules: parsedRules,
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
      permissions: string;
      rules: GranularRule[];
    }>,
    userPubkey?: string
  ): SafeBunkerConnectionRecord {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    const existing = this.db
      .prepare<[string], BunkerConnectionRecord>(
        'SELECT * FROM connections WHERE id = ?'
      )
      .get(id);

    if (!existing) {
      throw new Error(`Connection '${id}' not found`);
    }

    if (
      cleanPubkey &&
      !this.isSingleUserMode() &&
      existing.user_pubkey &&
      existing.user_pubkey.toLowerCase() !== cleanPubkey
    ) {
      throw new Error(`Connection '${id}' not found or access denied`);
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

    const permissionsStr =
      params.rules && Array.isArray(params.rules) && params.rules.length > 0
        ? JSON.stringify(params.rules)
        : params.permissions !== undefined
        ? String(params.permissions)
        : existing.permissions ?? '*';

    const merged: BunkerConnectionRecord = {
      ...existing,
      name: params.name ?? existing.name,
      nsec: params.nsec ?? existing.nsec,
      expiration: params.expiration ?? existing.expiration,
      whitelisted_npub: whitelistedNpubStr,
      relays: relaysStr,
      permissions: permissionsStr,
      updated_at: now,
    };

    this.db
      .prepare(
        `UPDATE connections
         SET name = ?, nsec = ?, expiration = ?, whitelisted_npub = ?, relays = ?, permissions = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        merged.name,
        merged.nsec,
        merged.expiration,
        merged.whitelisted_npub,
        merged.relays,
        merged.permissions,
        now,
        id
      );

    if (whitelistedNpubStr) {
      const hexPubkey = parseNpubToHex(whitelistedNpubStr);
      if (hexPubkey) {
        if (params.rules && Array.isArray(params.rules) && params.rules.length > 0) {
          this.setClientRules(hexPubkey, params.rules, cleanPubkey);
        }
      }
    }

    const kp = parseNsecToKeypair(merged.nsec);
    const pubkey = kp ? kp.publicKey : this.publicKey;

    let parsedRules: GranularRuleWithLabel[] | undefined;
    if (params.rules && Array.isArray(params.rules)) {
      parsedRules = params.rules.map((rule) => ({
        ...rule,
        label: getFriendlyOperationLabel(rule.method, rule.kind),
      }));
    } else if (permissionsStr && permissionsStr !== '*') {
      try {
        const raw = JSON.parse(permissionsStr);
        if (Array.isArray(raw)) {
          parsedRules = raw.map((r: GranularRule) => ({
            ...r,
            label: getFriendlyOperationLabel(r.method, r.kind),
          }));
        }
      } catch {
        // ignore
      }
    }

    return {
      id: merged.id,
      user_pubkey: merged.user_pubkey,
      name: merged.name,
      pubkey,
      expiration: merged.expiration,
      whitelisted_npub: merged.whitelisted_npub,
      relays: merged.relays,
      permissions: merged.permissions,
      rules: parsedRules,
      created_at: merged.created_at,
      updated_at: now,
    };
  }

  /**
   * Delete a connection profile.
   * @returns `true` if a row was deleted, `false` if the id was not found.
   */
  deleteConnection(id: string, userPubkey?: string): boolean {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    let result: Database.RunResult;

    if (cleanPubkey && !this.isSingleUserMode()) {
      result = this.db
        .prepare(
          "DELETE FROM connections WHERE id = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = '')"
        )
        .run(id, cleanPubkey);
    } else {
      result = this.db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    }
    return result.changes > 0;
  }

  // ── 5.6 Relay URL Discovery ──────────────────────────────────────────────────

  /**
   * Return the deduplicated and normalized union of relay URLs from:
   *   1. System default relays fallback ('wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol')
   *   2. The `DEFAULT_RELAYS` environment variable (comma-separated).
   *   3. The `relays` column of every row in the `connections` table (user's custom relays).
   *   4. NIP-65 & Kind 3 user personal relays fetched from the network and cached in state (`fetched_user_relays`).
   *
   * Normalizes URLs by trimming whitespace and removing trailing slashes.
   */
  getRelayUrls(userPubkey?: string): string[] {
    const normalize = (url: string): string =>
      url.trim().replace(/\/+$/, '');

    const systemDefaults = [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://nos.lol',
    ];

    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    let fromDb: string[] = [];

    if (cleanPubkey && !this.isSingleUserMode()) {
      const rows = this.db
        .prepare<[string], { relays: string }>(
          'SELECT relays FROM connections WHERE LOWER(user_pubkey) = ?'
        )
        .all(cleanPubkey);
      fromDb = rows
        .flatMap((r) => r.relays.split(','))
        .map(normalize)
        .filter(Boolean);
    } else {
      const rows = this.db
        .prepare<[], { relays: string }>('SELECT relays FROM connections')
        .all();
      fromDb = rows
        .flatMap((r) => r.relays.split(','))
        .map(normalize)
        .filter(Boolean);
    }

    const fromEnv = (process.env['DEFAULT_RELAYS'] ?? '')
      .split(',')
      .map(normalize)
      .filter(Boolean);

    let fromFetched: string[] = [];
    if (cleanPubkey && !this.isSingleUserMode()) {
      const userFetchedRow = this.db
        .prepare<[string], { value: string }>(
          'SELECT value FROM state WHERE key = ?'
        )
        .get(`fetched_user_relays:${cleanPubkey}`);
      if (userFetchedRow) {
        fromFetched = userFetchedRow.value.split(',').map(normalize).filter(Boolean);
      }
    } else {
      const fetchedRow = this.db
        .prepare<[], { value: string }>(
          "SELECT value FROM state WHERE key = 'fetched_user_relays'"
        )
        .get();
      if (fetchedRow) {
        fromFetched = fetchedRow.value.split(',').map(normalize).filter(Boolean);
      }
    }

    const merged = [...systemDefaults, ...fromEnv, ...fromDb, ...fromFetched];
    return [...new Set(merged.map(normalize))];
  }

  /**
   * Query Nostr indexer relays (including wss://relay.emre.xyz) for kind 10002 & kind 3 events
   * for all managed pubkeys, extract user personal relays, save to SQLite `state`, and return discovered relays.
   */
  async fetchUserRelaysFromNetwork(extraPubkeys?: string[], userPubkey?: string): Promise<string[]> {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    const pubkeysToQuery: string[] = [];

    if (cleanPubkey && !this.isSingleUserMode()) {
      pubkeysToQuery.push(cleanPubkey);
      const connRows = this.db
        .prepare<[string], { nsec: string }>(
          'SELECT nsec FROM connections WHERE LOWER(user_pubkey) = ?'
        )
        .all(cleanPubkey);
      for (const row of connRows) {
        if (row.nsec) {
          const kp = parseNsecToKeypair(row.nsec);
          if (kp) pubkeysToQuery.push(kp.publicKey);
        }
      }
    } else {
      pubkeysToQuery.push(...this.getAllPublicKeys());
      const ownerPubkeyEnv = process.env['OWNER_PUBKEY'];
      if (ownerPubkeyEnv) pubkeysToQuery.push(ownerPubkeyEnv.trim().toLowerCase());
    }

    if (extraPubkeys) pubkeysToQuery.push(...extraPubkeys);

    const pubkeys = [...new Set(pubkeysToQuery.map((pk) => pk.trim().toLowerCase()).filter(Boolean))];
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
                const msg = JSON.parse(data.toString());
                if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[2]) {
                  const event = msg[2] as { kind: number; tags?: string[][]; content?: string };
                  const relays = extractRelaysFromNostrEvent(event);
                  for (const r of relays) found.push(r);
                } else if (Array.isArray(msg) && msg[0] === 'EOSE') {
                  clearTimeout(timer);
                  try { ws.close(); } catch { /* ignore */ }
                  resolve(found);
                }
              } catch {
                // ignore
              }
            });

            ws.on('error', () => {
              clearTimeout(timer);
              resolve(found);
            });
          });

          for (const r of fetched) discoveredRelays.add(r);
        } catch {
          // ignore indexer connection failure
        }
      })
    );

    if (discoveredRelays.size > 0) {
      const relayListStr = Array.from(discoveredRelays).join(',');
      if (cleanPubkey && !this.isSingleUserMode()) {
        this.db
          .prepare(
            'INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)'
          )
          .run(`fetched_user_relays:${cleanPubkey}`, relayListStr);
      } else {
        this.db
          .prepare(
            "INSERT OR REPLACE INTO state (key, value) VALUES ('fetched_user_relays', ?)"
          )
          .run(relayListStr);
      }
      console.log(
        `[bunker] Discovered & cached ${discoveredRelays.size} personal user relay(s) from network`
      );
    }

    return Array.from(discoveredRelays);
  }

  /** Return the user's profile, or `null` if none has been set yet. */
  getProfile(userPubkey?: string): UserProfile | null {
    const targetPubkey = (userPubkey || this.publicKey).toLowerCase();
    const row = this.db
      .prepare<[string], UserProfile>('SELECT * FROM profiles WHERE LOWER(pubkey) = ?')
      .get(targetPubkey);

    if (row) return row;

    if (!userPubkey) {
      return (
        this.db
          .prepare<[], UserProfile>('SELECT * FROM profiles LIMIT 1')
          .get() ?? null
      );
    }

    return null;
  }

  /**
   * Create or update the user's profile.
   */
  setProfile(
    data: Omit<UserProfile, 'pubkey' | 'updated_at'>,
    userPubkey?: string
  ): UserProfile {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = (userPubkey || this.publicKey).toLowerCase();

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
        targetPubkey,
        data.name ?? null,
        data.nip05 ?? null,
        data.picture ?? null,
        now
      );

    return { pubkey: targetPubkey, ...data, updated_at: now };
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
        const whitelistedHex = parseNpubToHex(profile.whitelisted_npub) || profile.whitelisted_npub.trim().toLowerCase();
        if (whitelistedHex !== event.pubkey.toLowerCase()) {
          console.warn(
            `[bunker] Rejecting request: client ${event.pubkey} is not whitelisted on profile '${profile.name}'`
          );
          return;
        }
      }
    }

    // 4b. Decrypt payload & detect encryption scheme
    let decrypted: string;
    let clientPubkey = event.pubkey;
    let encryptionScheme: 'nip44' | 'nip04' | 'nip59' = 'nip44';

    try {
      if (event.kind === 1059) {
        encryptionScheme = 'nip59';
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
        encryptionScheme = 'nip04';
        decrypted = await nip04DecryptPayload(secretKeyHex, event.pubkey, event.content);
      } else {
        // Kind 24133 or other: auto-detect NIP-04 vs NIP-44
        if (event.content.includes('?iv=')) {
          try {
            decrypted = await nip04DecryptPayload(secretKeyHex, event.pubkey, event.content);
            encryptionScheme = 'nip04';
          } catch {
            decrypted = nip44DecryptPayload(secretKeyHex, event.pubkey, event.content);
            encryptionScheme = 'nip44';
          }
        } else {
          try {
            decrypted = nip44DecryptPayload(secretKeyHex, event.pubkey, event.content);
            encryptionScheme = 'nip44';
          } catch {
            decrypted = await nip04DecryptPayload(secretKeyHex, event.pubkey, event.content);
            encryptionScheme = 'nip04';
          }
        }
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
    const tenantUserPubkey = profile?.user_pubkey;

    try {
      switch (method) {
        case 'connect': {
          let secretParam: string | undefined;
          if (typeof paramsArr[1] === 'string' && paramsArr[1].trim()) {
            secretParam = paramsArr[1].trim();
          } else if (
            typeof paramsArr[0] === 'string' &&
            paramsArr[0].trim().length !== 64 &&
            paramsArr[0].trim()
          ) {
            secretParam = paramsArr[0].trim();
          }

          const connResult = this.connectClient(
            clientPubkey,
            secretParam,
            tenantUserPubkey,
            profile?.permissions,
            profile
          );
          if (!connResult.success) throw new Error(connResult.error ?? 'connect failed');
          result = connResult.result ?? 'ack';
          break;
        }
        case 'get_public_key': {
          this.assertAuthorized(clientPubkey, 'get_public_key', undefined, tenantUserPubkey);
          const skBytes = hexToBytes(secretKeyHex);
          result = getPublicKey(skBytes);
          break;
        }
        case 'describe': {
          result = [
            'describe',
            'get_public_key',
            'sign_event',
            'nip04_encrypt',
            'nip04_decrypt',
            'nip44_encrypt',
            'nip44_decrypt',
            'ping',
            'connect',
            'get_relays',
          ];
          break;
        }
        case 'get_relays': {
          const relaysList = profile?.relays
            ? profile.relays.split(',').map((r) => r.trim()).filter(Boolean)
            : this.getRelayUrls();
          const relayMap: Record<string, { read: boolean; write: boolean }> = {};
          for (const r of relaysList) {
            relayMap[r] = { read: true, write: true };
          }
          result = relayMap;
          break;
        }
        case 'sign_event': {
          let eventTemplate = paramsArr[0];
          if (typeof eventTemplate === 'string') {
            try {
              eventTemplate = JSON.parse(eventTemplate);
            } catch {
              throw new Error('Invalid JSON string passed for sign_event event template');
            }
          }
          if (!eventTemplate || typeof eventTemplate !== 'object') {
            throw new Error('sign_event requires a valid event template object');
          }
          this.assertAuthorized(clientPubkey, 'sign_event', (eventTemplate as EventTemplate).kind, tenantUserPubkey);
          result = JSON.stringify(finalizeEvent(eventTemplate as EventTemplate, hexToBytes(secretKeyHex)));
          break;
        }
        case 'nip44_encrypt':
          this.assertAuthorized(clientPubkey, 'nip44_encrypt', undefined, tenantUserPubkey);
          result = nip44EncryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'nip44_decrypt':
          this.assertAuthorized(clientPubkey, 'nip44_decrypt', undefined, tenantUserPubkey);
          result = nip44DecryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'nip04_encrypt':
          this.assertAuthorized(clientPubkey, 'nip04_encrypt', undefined, tenantUserPubkey);
          result = await nip04EncryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'nip04_decrypt':
          this.assertAuthorized(clientPubkey, 'nip04_decrypt', undefined, tenantUserPubkey);
          result = await nip04DecryptPayload(
            secretKeyHex,
            paramsArr[0] as string,
            paramsArr[1] as string
          );
          break;
        case 'ping':
          this.assertAuthorized(clientPubkey, 'ping', undefined, tenantUserPubkey);
          result = this.ping();
          break;
        default: {
          this.assertAuthorized(clientPubkey, method || 'unknown', undefined, tenantUserPubkey);
          rpcError = `Unknown NIP-46 method: ${method ?? 'unknown'}`;
          break;
        }
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
      rpcError ? 'error' : 'success',
      profile?.user_pubkey
    );

    // 8. Build response
    const responsePayload = rpcError
      ? { id, error: rpcError }
      : { id, result };

    const responseJson = JSON.stringify(responsePayload);
    let signedResponse: VerifiedEvent;

    if (encryptionScheme === 'nip59') {
      const rumorEvent = {
        kind: 24133,
        pubkey: getPublicKey(hexToBytes(secretKeyHex)),
        content: responseJson,
        tags: [
          ['p', clientPubkey],
          ['e', event.id],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };
      const sealContent = nip44EncryptPayload(secretKeyHex, clientPubkey, JSON.stringify(rumorEvent));
      const sealEvent = finalizeEvent(
        {
          kind: 1054,
          content: sealContent,
          tags: [],
          created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 100),
        },
        hexToBytes(secretKeyHex)
      );

      const { secretKey: wrapSk } = createKeyPair();
      const wrapSkHex = bytesToHex(wrapSk);
      const wrapContent = nip44EncryptPayload(wrapSkHex, clientPubkey, JSON.stringify(sealEvent));
      signedResponse = finalizeEvent(
        {
          kind: 1059,
          content: wrapContent,
          tags: [['p', clientPubkey]],
          created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 100),
        },
        wrapSk
      );
    } else {
      let encryptedResponse: string;
      try {
        encryptedResponse =
          encryptionScheme === 'nip04' || [4, 104].includes(event.kind)
            ? await nip04EncryptPayload(secretKeyHex, clientPubkey, responseJson)
            : nip44EncryptPayload(secretKeyHex, clientPubkey, responseJson);
      } catch (err) {
        console.error('[bunker] Failed to encrypt NIP-46 response:', err);
        return;
      }

      // 10. Sign response event
      signedResponse = finalizeEvent(
        {
          kind: event.kind === 1059 ? 24133 : event.kind,
          content: encryptedResponse,
          tags: [
            ['p', clientPubkey],
            ['e', event.id],
          ],
          created_at: Math.floor(Date.now() / 1000),
        },
        hexToBytes(secretKeyHex)
      );
    }

    // 11. Transmit
    responseWs.send(JSON.stringify(['EVENT', signedResponse]));
  }

  // ── 5.8 Private helpers ─────────────────────────────────────────────────────

  /**
   * Enforce granular permission policies for a client method and optional event kind.
   */
  assertAuthorized(
    clientPubkey: string,
    method: string,
    kind?: number,
    userPubkey?: string
  ): void {
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    const authRow = cleanPubkey
      ? this.db
          .prepare<[string, string], { client_pubkey: string; permissions: string }>(
            'SELECT client_pubkey, permissions FROM authorized_clients WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
          )
          .get(clientPubkey, cleanPubkey)
      : this.db
          .prepare<[string], { client_pubkey: string; permissions: string }>(
            'SELECT client_pubkey, permissions FROM authorized_clients WHERE client_pubkey = ?'
          )
          .get(clientPubkey);

    if (!authRow) {
      throw new Error(
        `Client ${clientPubkey} is not authorized to call '${method}'`
      );
    }

    const rules = cleanPubkey
      ? this.db
          .prepare<[string, string], { method: string; kind: number | null; policy: string }>(
            'SELECT method, kind, policy FROM client_permissions WHERE client_pubkey = ? AND (LOWER(user_pubkey) = ? OR user_pubkey = \'\')'
          )
          .all(clientPubkey, cleanPubkey)
      : this.db
          .prepare<[string], { method: string; kind: number | null; policy: string }>(
            'SELECT method, kind, policy FROM client_permissions WHERE client_pubkey = ?'
          )
          .all(clientPubkey);

    if (rules.length === 0) {
      // Legacy fallback: check comma-separated permissions string or wildcard '*'
      const allowedList = authRow.permissions
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      if (allowedList.includes('*') || allowedList.includes(method)) {
        return;
      }
      const label = getFriendlyOperationLabel(method, kind);
      throw new Error(`Blocked by security policy: ${label}`);
    }

    // Evaluate matching rules with cascading priority
    let matchedPolicy: string | undefined;

    // 1. Exact match (method + exact kind)
    if (kind !== undefined && kind !== null) {
      const exact = rules.find((r) => r.method === method && r.kind === kind);
      if (exact) matchedPolicy = exact.policy;
    }

    // 2. Method wildcard (method + any kind)
    if (!matchedPolicy) {
      const methodWildcard = rules.find(
        (r) => r.method === method && (r.kind === null || r.kind === undefined)
      );
      if (methodWildcard) matchedPolicy = methodWildcard.policy;
    }

    // 3. Global wildcard ('*')
    if (!matchedPolicy) {
      const globalWildcard = rules.find((r) => r.method === '*');
      if (globalWildcard) matchedPolicy = globalWildcard.policy;
    }

    const label = getFriendlyOperationLabel(method, kind);

    if (matchedPolicy === 'block') {
      throw new Error(`Blocked by security policy: ${label}`);
    }

    if (matchedPolicy === 'allow') {
      return;
    }

    // Default deny for unconfigured methods when granular rules are active
    throw new Error(`Blocked by security policy (no rule allowing): ${label}`);
  }

  /** Append a single entry to the immutable RPC audit log. */
  private logRpc(
    clientPubkey: string,
    method: string | undefined,
    params: string,
    status: string,
    userPubkey?: string
  ): void {
    const safeMethod = method || 'unknown';
    const cleanPubkey = userPubkey ? userPubkey.trim().toLowerCase() : '';
    this.db
      .prepare(
        `INSERT INTO rpc_audit_logs (user_pubkey, client_pubkey, method, params, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(cleanPubkey, clientPubkey, safeMethod, params, status, Math.floor(Date.now() / 1000));
  }

}
