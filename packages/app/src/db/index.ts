import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

/**
 * Resolve path to the SQLite database file.
 * Creates parent directory if missing.
 */
function resolveDatabasePath(): string {
  if (process.env.DB_PATH) {
    const customPath = process.env.DB_PATH;
    if (customPath !== ':memory:') {
      try {
        fs.mkdirSync(path.dirname(customPath), { recursive: true });
      } catch (err) {
        console.error(`[db] Failed to create parent directory for DB_PATH '${customPath}':`, err);
      }
    }
    return customPath;
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      fs.mkdirSync('/data', { recursive: true });
    } catch {
      // directory creation attempt
    }
    return '/data/bunker.db';
  }

  // Development/local default: ./data/bunker.db
  const localDir = path.resolve(process.cwd(), 'data');
  try {
    fs.mkdirSync(localDir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(localDir, 'bunker.db');
}

const targetPath = resolveDatabasePath();

let dbInstance: Database.Database;
try {
  dbInstance = new Database(targetPath);
  console.log(`[db] Connected to SQLite database at: ${targetPath}`);
} catch (err) {
  console.error(`[db] FATAL: Unable to open SQLite database at '${targetPath}'.`);
  console.error(`[db] Ensure that the target directory exists and has write permissions for the application user.`);
  throw err;
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

