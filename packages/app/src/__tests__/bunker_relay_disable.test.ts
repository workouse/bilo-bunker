import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';
import { BunkerService } from '../services/bunker.js';
import { RelayManager } from '../services/relay.js';

describe('BunkerService & RelayManager Autoconnect & Parameter Guards', () => {
  let db: Database.Database;
  let bunker: BunkerService;
  let relayManager: RelayManager;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    bunker = new BunkerService(db);
    relayManager = new RelayManager(bunker, db);
  });

  it('should accept relays as an array or string without SQLite RangeError', () => {
    const conn1 = bunker.createConnection({
      name: 'Array Relays App',
      nsec: 'nsec1test',
      relays: ['wss://relay.damus.io', 'wss://nos.lol'] as unknown as string,
    });

    expect(conn1.relays).toBe('wss://relay.damus.io, wss://nos.lol');

    const conn2 = bunker.updateConnection(conn1.id, {
      relays: ['wss://relay.emre.xyz'] as unknown as string,
    });

    expect(conn2.relays).toBe('wss://relay.emre.xyz');
  });

  it('should not throw when connecting to an invalid or unreachable relay URL', () => {
    expect(() => {
      relayManager.connect('wss://invalid-unreachable-host.local:9999');
    }).not.toThrow();
  });

  it('should disable non-websocket protocol URLs', () => {
    expect(() => {
      relayManager.connect('http://invalid-protocol.com');
      relayManager.connect('ftp://invalid-protocol.com');
    }).not.toThrow();
  });

  it('should cleanly start and stop RelayManager keep-alive and stability timers', async () => {
    await relayManager.start();
    await relayManager.stop();
  });
});

