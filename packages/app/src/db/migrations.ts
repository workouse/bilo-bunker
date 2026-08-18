import type Database from 'better-sqlite3';

/**
 * Runs all schema creation statements idempotently using IF NOT EXISTS.
 * Wrapped in a single transaction so the schema is applied atomically.
 * Safe to call on every process boot.
 */
export function runMigrations(db: Database.Database): void {
  db.transaction(() => {
    // Keypair storage — exactly one row per bunker instance
    db.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        pubkey     TEXT    UNIQUE NOT NULL,
        secret_key TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // NIP-46 clients that have been granted connect permission
    db.exec(`
      CREATE TABLE IF NOT EXISTS authorized_clients (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_pubkey   TEXT    NOT NULL DEFAULT '',
        client_pubkey TEXT    NOT NULL,
        permissions   TEXT    NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
    `);

    // Ensure user_pubkey column exists in authorized_clients if table was created in older migration
    const authCols = db.prepare('PRAGMA table_info(authorized_clients)').all() as Array<{ name: string }>;
    if (authCols.length > 0 && !authCols.some((col) => col.name === 'user_pubkey')) {
      db.exec("ALTER TABLE authorized_clients ADD COLUMN user_pubkey TEXT NOT NULL DEFAULT ''");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_clients_user_client
        ON authorized_clients(user_pubkey, client_pubkey);
    `);

    // Immutable append-only log of every NIP-46 RPC call
    db.exec(`
      CREATE TABLE IF NOT EXISTS rpc_audit_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_pubkey   TEXT    NOT NULL DEFAULT '',
        client_pubkey TEXT    NOT NULL,
        method        TEXT    NOT NULL,
        params        TEXT    NOT NULL,
        status        TEXT    NOT NULL,
        created_at    INTEGER NOT NULL
      );
    `);

    const auditCols = db.prepare('PRAGMA table_info(rpc_audit_logs)').all() as Array<{ name: string }>;
    if (auditCols.length > 0 && !auditCols.some((col) => col.name === 'user_pubkey')) {
      db.exec("ALTER TABLE rpc_audit_logs ADD COLUMN user_pubkey TEXT NOT NULL DEFAULT ''");
    }

    // Index on user_pubkey & created_at DESC for efficient log pagination queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
        ON rpc_audit_logs(user_pubkey, created_at DESC);
    `);

    // Named relay connection profiles — each has its own nsec + relay list + permission rules
    db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id               TEXT    PRIMARY KEY,
        user_pubkey      TEXT    NOT NULL DEFAULT '',
        name             TEXT    NOT NULL,
        nsec             TEXT    NOT NULL,
        expiration       INTEGER NOT NULL,
        whitelisted_npub TEXT    NOT NULL,
        relays           TEXT    NOT NULL,
        permissions      TEXT    NOT NULL DEFAULT '*',
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL
      );
    `);

    // Ensure permissions and user_pubkey columns exist in connections if created in older migration
    const connCols = db.prepare('PRAGMA table_info(connections)').all() as Array<{ name: string }>;
    if (connCols.length > 0) {
      if (!connCols.some((col) => col.name === 'permissions')) {
        db.exec("ALTER TABLE connections ADD COLUMN permissions TEXT NOT NULL DEFAULT '*'");
      }
      if (!connCols.some((col) => col.name === 'user_pubkey')) {
        db.exec("ALTER TABLE connections ADD COLUMN user_pubkey TEXT NOT NULL DEFAULT ''");
      }
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_connections_user_pubkey
        ON connections(user_pubkey);
    `);

    // Generic key-value process state (e.g. last_processed_timestamp for relay SUB, bunker_connect_secret)
    db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Owner profile table
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        pubkey     TEXT    PRIMARY KEY,
        name       TEXT,
        nip05      TEXT,
        picture    TEXT,
        updated_at INTEGER NOT NULL
      );
    `);

    // Granular client permissions and signing rules
    db.exec(`
      CREATE TABLE IF NOT EXISTS client_permissions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_pubkey   TEXT    NOT NULL DEFAULT '',
        client_pubkey TEXT    NOT NULL,
        method        TEXT    NOT NULL,
        kind          INTEGER,
        policy        TEXT    NOT NULL CHECK(policy IN ('allow', 'block')),
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
    `);

    const permCols = db.prepare('PRAGMA table_info(client_permissions)').all() as Array<{ name: string }>;
    if (permCols.length > 0 && !permCols.some((col) => col.name === 'user_pubkey')) {
      db.exec("ALTER TABLE client_permissions ADD COLUMN user_pubkey TEXT NOT NULL DEFAULT ''");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_client_permissions_pubkey
        ON client_permissions(user_pubkey, client_pubkey);
    `);
  })();
}
