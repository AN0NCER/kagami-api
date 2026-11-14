const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseProducerPage } = require('../parsers/producerPage');
const { upsertFromSnapshot } = require('./producerIndex');
const { ApiError } = require('../errors');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Разобранная страница студии (шапка + все тайтлы) из кэша или с MAL.
 * Агрегаты в снимок не входят — они считаются при запросе, поэтому sfw не требует нового похода на MAL.
 * Каждая свежая загрузка обновляет запись студии в индексе.
 * force — не смотреть на TTL и скачать заново (при ошибке MAL отдаётся старая копия с cache: 'STALE').
 * @returns {Promise<{data: object, cache: string}>}
 */
function getProducerSnapshot(id, { force = false } = {}) {
  return cached(`producers/${id}/page`, async () => {
    const snapshot = parseProducerPage(await fetchPage(`/anime/producer/${id}`));
    if (!snapshot.mal_id) {
      throw new ApiError(404, 'BadResponseException', 'Resource does not exist');
    }
    snapshot.fetched_at = new Date().toISOString();
    try {
      upsertFromSnapshot(snapshot);
    } catch (err) {
      console.error(`[index] producer ${id}: ${err.message}`);
    }
    return snapshot;
  }, force ? 0 : DAY_MS);
}

module.exports = { getProducerSnapshot };
