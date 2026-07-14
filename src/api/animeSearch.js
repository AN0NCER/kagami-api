const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseAnimeSearch } = require('../parsers/animeSearch');
const { ApiError } = require('../errors');

const DAY_MS = 24 * 60 * 60 * 1000;

const TYPE_MAP = { tv: 1, ova: 2, movie: 3, special: 4, ona: 5, music: 6, cm: 7, pv: 8, tv_special: 9 };
const STATUS_MAP = { airing: 1, complete: 2, completed: 2, upcoming: 3 };
const RATING_MAP = { g: 1, pg: 2, pg13: 3, r17: 4, r: 5, rx: 6 };
const ORDER_MAP = { title: 1, start_date: 2, score: 3, episodes: 4, end_date: 5, type: 6, members: 7, rated: 8, rating: 8 };

/**
 * GET /v4/anime — поиск (маппинг параметров Jikan v4 -> anime.php MAL).
 * Поддержано: q, page, limit, letter, type, status, rating, score/min_score,
 * genres, genres_exclude, producers, start_date, end_date, order_by, sort, sfw.
 * @param {import('express').Router} v4
 */
module.exports = function register(v4) {
  v4.get('/anime', async (req, res, next) => {
    try {
      const q = req.query.q ? String(req.query.q) : '';
      if (q && q.length < 3) {
        throw new ApiError(400, 'BadRequestException', 'Search queries require at least 3 characters');
      }

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const malQuery = buildMalQuery(req.query, page);

      const { data: parsed, cache } = await cached(
        `search/anime?${malQuery}`,
        async () => parseAnimeSearch(await fetchPage(`/anime.php?${malQuery}`)),
        DAY_MS // поисковая выдача меняется чаще — TTL 1 день
      );

      let list = parsed.results;
      if (isTruthy(req.query.sfw)) list = list.filter((e) => e.rating !== 'Rx');

      // MAL отдаёт 50 на страницу; limit режет сверху
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 50);
      const pageItems = list.slice(0, limit);

      res.set('X-Cache', cache);
      res.json({
        pagination: {
          last_visible_page: parsed.lastPage,
          has_next_page: parsed.hasNextPage,
          current_page: page,
          items: { count: pageItems.length, total: null, per_page: limit },
        },
        data: pageItems,
      });
    } catch (err) {
      next(err);
    }
  });
};

function buildMalQuery(query, page) {
  const params = new URLSearchParams();
  params.set('q', query.q ? String(query.q) : '');
  if (page > 1) params.set('show', String(50 * (page - 1)));
  if (query.letter) params.set('letter', String(query.letter).slice(0, 1));

  const type = TYPE_MAP[String(query.type || '').toLowerCase()];
  if (type) params.set('type', String(type));

  const status = STATUS_MAP[String(query.status || '').toLowerCase()];
  if (status) params.set('status', String(status));

  const rating = RATING_MAP[String(query.rating || '').toLowerCase()];
  if (rating) params.set('r', String(rating));

  const score = Number.parseFloat(query.min_score ?? query.score);
  if (Number.isFinite(score) && score > 0) params.set('score', String(Math.floor(score)));

  if (query.producers) {
    const producer = Number.parseInt(String(query.producers).split(',')[0], 10);
    if (producer) params.set('p', String(producer));
  }

  setDate(params, query.start_date, 'sy', 'sm', 'sd');
  setDate(params, query.end_date, 'ey', 'em', 'ed');

  const order = ORDER_MAP[String(query.order_by || '').toLowerCase()];
  if (order) {
    params.set('o', String(order));
    params.set('w', String(query.sort === 'asc' ? 2 : 1));
  }

  let qs = params.toString();

  // Жанры: genre[]=1&genre[]=2 (+gx=1 для исключения)
  const genres = String(query.genres || query.genres_exclude || '')
    .split(',')
    .map((g) => Number.parseInt(g, 10))
    .filter((g) => Number.isInteger(g) && g > 0);
  if (genres.length) {
    if (!query.genres && query.genres_exclude) qs += '&gx=1';
    for (const g of genres) qs += `&genre[]=${g}`;
  }

  // Колонки результатов (как у Jikan)
  qs += '&c[]=a&c[]=b&c[]=c&c[]=f&c[]=d&c[]=e&c[]=g';
  return qs;
}

function setDate(params, value, yKey, mKey, dKey) {
  if (!value) return;
  const m = String(value).match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return;
  params.set(yKey, m[1]);
  if (m[2]) params.set(mKey, String(Number.parseInt(m[2], 10)));
  if (m[3]) params.set(dKey, String(Number.parseInt(m[3], 10)));
}

function isTruthy(v) {
  return v === '' || v === 'true' || v === '1' || v === true;
}
