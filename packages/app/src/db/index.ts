import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

/**
 * Resolve path to the SQLite database file.
 * Creates parent directory if missing. Falls back gracefully if /data volume lacks write permission.
 */
function resolveDatabasePath(): string {
  if (process.env.DB_PATH) {
    const customPath = process.env.DB_PATH;
    try {
      fs.mkdirSync(path.dirname(customPath), { recursive: true });
    } catch {
      // ignore
    }
    return customPath;
  }

  // Attempt to use /data/bunker.db if /data is writable
  try {
    fs.mkdirSync('/data', { recursive: true });
    fs.accessSync('/data', fs.constants.W_OK);
    return '/data/bunker.db';
  } catch {
    // /data is not writable (e.g. host volume owned by root), fallback to ./data/bunker.db inside workdir
    const localDir = path.resolve(process.cwd(), 'data');
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch {
      // ignore
    }
    return path.join(localDir, 'bunker.db');
  }
}

const targetPath = resolveDatabasePath();

let dbInstance: Database.Database;
try {
  dbInstance = new Database(targetPath);
  console.log(`[db] Connected to SQLite database at: ${targetPath}`);
} catch (err) {
  const code = (err as { code?: string }).code;
  if (code === 'SQLITE_CANTOPEN') {
    const fallbackPath = path.resolve(process.cwd(), 'bunker.db');
    console.warn(`[db] Unable to open '${targetPath}'. Falling back to '${fallbackPath}'`);
    dbInstance = new Database(fallbackPath);
  } else {
    throw err;
  }
}

export const db = dbInstance;

// WAL mode: allows concurrent reads during writes — essential since
// RelayManager writes (audit logs, state) while API routes read simultaneously.
db.pragma('journal_mode = WAL');

// Enforce referential integrity at the SQLite level.
db.pragma('foreign_keys = ON');

// NORMAL is safe under WAL: writes are durable on OS crash (not power loss),
// which is acceptable for this workload and avoids the fsync cost of FULL.
db.pragma('synchronous = NORMAL');

// Apply schema — idempotent, runs on every boot.
runMigrations(db);

