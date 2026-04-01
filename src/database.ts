import Database from 'better-sqlite3';
import path from 'path';

// Define the database path
const dbPath = path.join(process.cwd(), 'database.sqlite');
const db = new Database(dbPath); // Removed verbose for production

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS blacklist_rules (
    pattern TEXT NOT NULL,
    type TEXT NOT NULL,          -- 'guild_tag' or 'activity'
    isRegex BOOLEAN NOT NULL DEFAULT 0,
    PRIMARY KEY(pattern, type)
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL UNIQUE,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export default db;
