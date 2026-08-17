import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';

describe('BunkerService Granular Permissions & Policy Engine', () => {
  let db: Database.Database;
  let bunker: BunkerService;
  let clientPk: string;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    bunker = new BunkerService(db);

    const clientSk = generateSecretKey();
    clientPk = getPublicKey(clientSk);

    // Authorize the test client
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO authorized_clients (client_pubkey, permissions, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(clientPk, '*', now, now);
  });

  it('should allow all operations by default for legacy wildcard client', () => {
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 4)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 23194)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'nip44_encrypt')).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'ping')).not.toThrow();
  });

  it('should configure granular rules and return friendly labels', () => {
    const rules = bunker.setClientRules(clientPk, [
      { method: 'sign_event', kind: 1, policy: 'allow' },
      { method: 'sign_event', kind: 0, policy: 'allow' },
      { method: 'sign_event', kind: 4, policy: 'block' },
      { method: 'sign_event', kind: 44, policy: 'block' },
      { method: 'sign_event', kind: 23194, policy: 'block' },
      { method: 'nip44_encrypt', policy: 'allow' },
    ]);

    expect(rules).toHaveLength(6);
    const kind1Rule = rules.find((r) => r.method === 'sign_event' && r.kind === 1);
    expect(kind1Rule?.label).toBe('Send Post');
    expect(kind1Rule?.policy).toBe('allow');

    const kind4Rule = rules.find((r) => r.method === 'sign_event' && r.kind === 4);
    expect(kind4Rule?.label).toBe('Legacy DM (NIP-04)');
    expect(kind4Rule?.policy).toBe('block');

    const kind44Rule = rules.find((r) => r.method === 'sign_event' && r.kind === 44);
    expect(kind44Rule?.label).toBe('Direct Message');
    expect(kind44Rule?.policy).toBe('block');

    const kind23194Rule = rules.find((r) => r.method === 'sign_event' && r.kind === 23194);
    expect(kind23194Rule?.label).toBe('Wallet / Zaps');
    expect(kind23194Rule?.policy).toBe('block');
  });

  it('should enforce allow and block policies for specific Nostr kinds', () => {
    bunker.setClientRules(clientPk, [
      { method: 'sign_event', kind: 1, policy: 'allow' },
      { method: 'sign_event', kind: 6, policy: 'allow' },
      { method: 'sign_event', kind: 7, policy: 'allow' },
      { method: 'sign_event', kind: 4, policy: 'block' },
      { method: 'sign_event', kind: 44, policy: 'block' },
      { method: 'sign_event', kind: 23194, policy: 'block' },
      { method: 'nip44_encrypt', policy: 'allow' },
    ]);

    // Kind 1 Public Note -> Allowed
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1)).not.toThrow();

    // Kind 6 Repost -> Allowed
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 6)).not.toThrow();

    // Kind 4 Legacy DM -> Blocked
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 4)).toThrow(
      /Blocked by security policy: Legacy DM/
    );

    // Kind 44 Modern DM -> Blocked
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 44)).toThrow(
      /Blocked by security policy: Direct Message/
    );

    // Kind 23194 Wallet -> Blocked
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 23194)).toThrow(
      /Blocked by security policy: Wallet \/ Zaps/
    );

    // Unconfigured method when rules exist -> Blocked by default deny
    expect(() => bunker.assertAuthorized(clientPk, 'nip04_encrypt')).toThrow(
      /Blocked by security policy/
    );
  });

  it('should evaluate signEvent method and block unauthorized event kinds', () => {
    bunker.setClientRules(clientPk, [
      { method: 'sign_event', kind: 1, policy: 'allow' },
      { method: 'sign_event', kind: 4, policy: 'block' },
    ]);

    // Signing kind 1 should succeed
    const validPost = bunker.signEvent(clientPk, {
      kind: 1,
      content: 'Hello Nostr from Bilo Bunker!',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    });
    expect(validPost).toBeDefined();
    expect(validPost.sig).toBeDefined();

    // Signing kind 4 should throw
    expect(() =>
      bunker.signEvent(clientPk, {
        kind: 4,
        content: 'secret message',
        tags: [['p', '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245']],
        created_at: Math.floor(Date.now() / 1000),
      })
    ).toThrow(/Blocked by security policy: Legacy DM/);
  });

  it('should support method-level wildcard and global wildcard rules', () => {
    // 1. Method wildcard: Allow all sign_event kinds, but block nip04
    bunker.setClientRules(clientPk, [
      { method: 'sign_event', policy: 'allow' },
      { method: 'nip04_encrypt', policy: 'block' },
      { method: 'nip04_decrypt', policy: 'block' },
    ]);

    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 4)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 9999)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'nip04_encrypt')).toThrow(/Blocked by security policy/);

    // 2. Global wildcard: Allow everything except wallet commands
    bunker.setClientRules(clientPk, [
      { method: 'sign_event', kind: 23194, policy: 'block' },
      { method: '*', policy: 'allow' },
    ]);

    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1)).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'nip44_encrypt')).not.toThrow();
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 23194)).toThrow(/Blocked by security policy/);
  });

  it('should delete client rules and revert to authorized_clients baseline', () => {
    bunker.setClientRules(clientPk, [
      { method: 'sign_event', kind: 1, policy: 'allow' },
    ]);

    // Kind 4 is blocked
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 4)).toThrow();

    // Reset rules
    const deleted = bunker.deleteClientRules(clientPk);
    expect(deleted).toBe(true);

    // Reverted back to wildcard '*'
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 4)).not.toThrow();
  });

  it('should remove rules when revoking a client', () => {
    bunker.setClientRules(clientPk, [
      { method: 'sign_event', kind: 1, policy: 'allow' },
    ]);

    bunker.revokeClientPermission(clientPk);

    // Rules table should be empty for client
    expect(bunker.getClientRules(clientPk)).toEqual([]);

    // Client is no longer authorized at all
    expect(() => bunker.assertAuthorized(clientPk, 'sign_event', 1)).toThrow(
      /is not authorized/
    );
  });

  it('should store permissions and rules when creating a connection profile and auto-provision on connect', () => {
    const socialRules = [
      { method: 'sign_event', kind: 1, policy: 'allow' as const },
      { method: 'sign_event', kind: 0, policy: 'allow' as const },
      { method: 'sign_event', kind: 4, policy: 'block' as const },
      { method: 'sign_event', kind: 44, policy: 'block' as const },
      { method: 'sign_event', kind: 23194, policy: 'block' as const },
      { method: 'nip44_encrypt', policy: 'allow' as const },
    ];

    const conn = bunker.createConnection({
      name: 'Damus Mobile Preset',
      nsec: 'nsec1testprofilekey',
      rules: socialRules,
    });

    expect(conn.permissions).toBeDefined();
    expect(conn.rules).toHaveLength(6);

    // Generate bunker uri with secret
    bunker.generateBunkerUri();
    const storedSecret = db
      .prepare<[], { value: string }>("SELECT value FROM state WHERE key = 'bunker_connect_secret'")
      .get()?.value;

    const newClientSk = generateSecretKey();
    const newClientPk = getPublicKey(newClientSk);

    // Connect client using connection profile permissions
    const connResult = bunker.connectClient(newClientPk, storedSecret, conn.permissions);
    expect(connResult.success).toBe(true);

    // Verify rules were automatically provisioned
    const clientRules = bunker.getClientRules(newClientPk);
    expect(clientRules).toHaveLength(6);

    // Post is allowed
    expect(() => bunker.assertAuthorized(newClientPk, 'sign_event', 1)).not.toThrow();

    // DMs and Wallet are blocked
    expect(() => bunker.assertAuthorized(newClientPk, 'sign_event', 4)).toThrow(
      /Blocked by security policy: Legacy DM/
    );
    expect(() => bunker.assertAuthorized(newClientPk, 'sign_event', 44)).toThrow(
      /Blocked by security policy: Direct Message/
    );
    expect(() => bunker.assertAuthorized(newClientPk, 'sign_event', 23194)).toThrow(
      /Blocked by security policy: Wallet \/ Zaps/
    );
  });
});
