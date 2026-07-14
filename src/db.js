const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./config');

// Node.js >= 22.5 имеет встроенный node:sqlite; на более старых версиях
// используем better-sqlite3 (ставится готовым бинарником, API совпадает).
function openDatabase(dbPath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(dbPath);
  } catch {
    const Database = require('better-sqlite3');
    return new Database(dbPath);
  }
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = openDatabase(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key       TEXT PRIMARY KEY,
    data      TEXT NOT NULL,
    cached_at INTEGER NOT NULL
  )
`);

module.exports = db;
