const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseSeasonPage } = require('../parsers/seasons');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Текущий сезон (кэш 6 часов); общий для /seasons/now и фонового индекса студий. */
function getSeasonNow() {
  return cached('seasons/now', async () => parseSeasonPage(await fetchPage('/anime/season')), SIX_HOURS_MS);
}

module.exports = { getSeasonNow };
