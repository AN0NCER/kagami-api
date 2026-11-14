const db = require('../db');
const { HITS_HALF_LIFE_DAYS } = require('../config');

// Востребованность студии: число запросов с затуханием (полураспад HITS_HALF_LIFE_DAYS).
// Запросы копятся в памяти и пишутся в БД пачкой, чтобы не писать на диск при каждом запросе.
db.exec(`
  CREATE TABLE IF NOT EXISTS producer_hits (
    id         INTEGER PRIMARY KEY,
    score      REAL NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

const selectAll = db.prepare('SELECT id, score, updated_at FROM producer_hits');
const selectOne = db.prepare('SELECT score, updated_at FROM producer_hits WHERE id = ?');
const upsert = db.prepare(`
  INSERT INTO producer_hits (id, score, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
`);

const DAY_MS = 24 * 60 * 60 * 1000;
const FLUSH_MS = 60 * 1000;

const pending = new Map();
let timer = null;

function decay(score, from, to) {
  return score * 0.5 ** (Math.max(to - from, 0) / DAY_MS / HITS_HALF_LIFE_DAYS);
}

/** Засчитывает запрос к студии. */
function recordHit(id) {
  pending.set(id, (pending.get(id) || 0) + 1);
}

/** Записывает накопленные запросы в БД. */
function flush(now = Date.now()) {
  if (!pending.size) return;
  const batch = [...pending];
  pending.clear();
  db.exec('BEGIN');
  try {
    for (const [id, n] of batch) {
      const row = selectOne.get(id);
      upsert.run(id, (row ? decay(row.score, row.updated_at, now) : 0) + n, now);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    for (const [id, n] of batch) pending.set(id, (pending.get(id) || 0) + n);
    throw err;
  }
}

/** Востребованность всех студий на момент now: Map id -> число (с затуханием, с учётом ещё не записанных). */
function getScores(now = Date.now()) {
  const scores = new Map();
  for (const row of selectAll.all()) scores.set(row.id, decay(row.score, row.updated_at, now));
  for (const [id, n] of pending) scores.set(id, (scores.get(id) || 0) + n);
  return scores;
}

/** Периодическая запись и запись при остановке процесса. */
function startFlushing() {
  if (timer) return;
  timer = setInterval(() => {
    try {
      flush();
    } catch (err) {
      console.error('[hits] flush failed:', err.message);
    }
  }, FLUSH_MS);
  timer.unref();

  const onExit = () => {
    try {
      flush();
    } catch { /* при остановке пропускаем */ }
  };
  process.on('exit', onExit);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      onExit();
      process.exit(0);
    });
  }
}

module.exports = { recordHit, flush, getScores, startFlushing };
