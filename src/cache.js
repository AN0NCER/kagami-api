const db = require('./db');
const { CACHE_TTL_MS } = require('./config');

const selectStmt = db.prepare('SELECT data, cached_at FROM cache WHERE key = ?');
const upsertStmt = db.prepare(`
  INSERT INTO cache (key, data, cached_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET data = excluded.data, cached_at = excluded.cached_at
`);

// Защита от параллельных одинаковых запросов: пока идёт fetch по ключу,
// остальные ждут тот же промис, а не бомбят MAL.
const inflight = new Map();

/**
 * Возвращает данные из кэша либо вызывает fetcher.
 * Логика:
 *  - кэш свежий (< TTL)        -> отдать из БД        (cache: HIT)
 *  - кэша нет                  -> fetch, сохранить    (cache: MISS)
 *  - кэш протух                -> fetch, обновить     (cache: UPDATED)
 *  - кэш протух, fetch упал    -> отдать протухший    (cache: STALE)
 *
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {number} [ttlMs] TTL для этого ключа (по умолчанию 7 дней из конфига)
 * @returns {Promise<{data: any, cache: string}>}
 */
async function cached(key, fetcher, ttlMs = CACHE_TTL_MS) {
  const row = selectStmt.get(key);
  const now = Date.now();

  if (row && now - row.cached_at < ttlMs) {
    return { data: JSON.parse(row.data), cache: 'HIT' };
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    try {
      const fresh = await fetcher();
      upsertStmt.run(key, JSON.stringify(fresh), Date.now());
      return { data: fresh, cache: row ? 'UPDATED' : 'MISS' };
    } catch (err) {
      if (row) {
        // MAL недоступен — отдаём устаревшую копию вместо ошибки
        return { data: JSON.parse(row.data), cache: 'STALE' };
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

module.exports = { cached };
