const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseSeasonPage, parseSeasonArchive } = require('../parsers/seasons');
const { ApiError } = require('../errors');

const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const DAY_MS = 24 * 60 * 60 * 1000;
const TYPE_FILTERS = { tv: 'TV', movie: 'Movie', ova: 'OVA', ona: 'ONA', special: 'Special', music: 'Music', tv_special: 'TV Special' };

/**
 * Эндпоинты /v4/seasons*
 * @param {import('express').Router} v4
 */
module.exports = function register(v4) {
  // Список всех сезонов (архив)
  v4.get('/seasons', async (req, res, next) => {
    try {
      const { data, cache } = await cached('seasons/archive', async () => {
        const html = await fetchPage('/anime/season/archive');
        return parseSeasonArchive(html);
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Текущий сезон — TTL 6 часов
  v4.get('/seasons/now', async (req, res, next) => {
    try {
      const { data, cache } = await cached(
        'seasons/now',
        async () => parseSeasonPage(await fetchPage('/anime/season')),
        6 * 60 * 60 * 1000
      );
      res.set('X-Cache', cache);
      res.json(buildResponse(data, req.query));
    } catch (err) {
      next(err);
    }
  });

  // Конкретный сезон
  v4.get('/seasons/:year/:season', async (req, res, next) => {
    try {
      const year = Number.parseInt(req.params.year, 10);
      const season = String(req.params.season).toLowerCase();
      if (!Number.isInteger(year) || year < 1917 || year > 2100 || !SEASONS.includes(season)) {
        throw new ApiError(400, 'BadRequestException', 'Invalid year or season');
      }

      const { data, cache } = await cached(
        `seasons/${year}/${season}`,
        async () => parseSeasonPage(await fetchPage(`/anime/season/${year}/${season}`)),
        7 * DAY_MS
      );
      res.set('X-Cache', cache);
      res.json(buildResponse(data, req.query));
    } catch (err) {
      next(err);
    }
  });
};

/** Фильтры и пагинация как у Jikan: filter, sfw, continuing, unapproved, page, limit */
function buildResponse(parsed, query) {
  let list = parsed.entries;

  // По умолчанию продолжающиеся тайтлы не входят (как в Jikan v4)
  if (!isTruthy(query.continuing)) {
    list = list.filter((e) => !e.continuing);
  }
  if (isTruthy(query.sfw)) {
    list = list.filter((e) => !e.r18);
  }
  if (query.filter) {
    const type = TYPE_FILTERS[String(query.filter).toLowerCase()];
    if (type) list = list.filter((e) => (e.type || '').toLowerCase() === type.toLowerCase());
  }

  const total = list.length;
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 25);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const start = (page - 1) * limit;
  const pageItems = list.slice(start, start + limit);
  const lastPage = Math.max(Math.ceil(total / limit), 1);

  // Служебные поля наружу не отдаём
  const data = pageItems.map(({ continuing, r18, kids, ...rest }) => rest);

  return {
    pagination: {
      last_visible_page: lastPage,
      has_next_page: page < lastPage,
      current_page: page,
      items: { count: pageItems.length, total, per_page: limit },
    },
    data,
  };
}

function isTruthy(v) {
  return v === '' || v === 'true' || v === '1' || v === true;
}
