const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseProducersList, parseProducerFull } = require('../parsers/producers');
const { ApiError } = require('../errors');
const { getProducerSnapshot } = require('../lib/producerSnapshot');
const { buildSummary, baseTitles, genreVector, cosine } = require('../lib/producerStats');
const { listTitles } = require('../lib/producerTitles');
const {
  ORDER_KEYS, queryCatalog, catalogItemsByIds, similarCandidates, indexedCount,
} = require('../lib/producerIndex');
const { recordHit } = require('../lib/producerHits');

const CATALOG_PARAMS = ['order_by', 'sort', 'founded_from', 'founded_to', 'adult', 'sfw', 'role'];

function parseId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'BadRequestException', 'Invalid producer id');
  }
  return id;
}

function isTruthy(v) {
  return v === '' || v === 'true' || v === '1' || v === true;
}

function badRequest(message) {
  return new ApiError(400, 'BadRequestException', message);
}

/** Параметры каталога по индексу с проверкой значений. */
function parseCatalogQuery(query) {
  const oneOf = (value, allowed, name) => {
    if (value === undefined || value === '') return undefined;
    const v = String(value).toLowerCase();
    if (!allowed.includes(v)) throw badRequest(`Invalid ${name}: expected one of ${allowed.join(', ')}`);
    return v;
  };
  const year = (value, name) => {
    if (value === undefined || value === '') return undefined;
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 1800 || n > 2100) throw badRequest(`Invalid ${name}`);
    return n;
  };

  return {
    q: query.q ? String(query.q) : undefined,
    order_by: oneOf(query.order_by, ORDER_KEYS, 'order_by'),
    sort: oneOf(query.sort, ['asc', 'desc'], 'sort'),
    founded_from: year(query.founded_from, 'founded_from'),
    founded_to: year(query.founded_to, 'founded_to'),
    adult: oneOf(query.adult, ['only', 'exclude'], 'adult'),
    role: oneOf(query.role, ['studio', 'all'], 'role'),
    sfw: isTruthy(query.sfw),
  };
}

/**
 * Эндпоинты /v4/producers*
 * @param {import('express').Router} v4
 */
module.exports = function register(v4) {
  // Список студий/продюсеров (q, page, limit).
  // С параметрами order_by, sort, founded_from, founded_to, adult, sfw, role — каталог по индексу студий
  // (в него входят компании от INDEX_MIN_TITLES тайтлов; по умолчанию только студии, role=all — все);
  // без них — полный список MAL, где у компаний из индекса добавлены цифры.
  v4.get('/producers', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const start = (page - 1) * limit;
      const pagination = (total, count) => {
        const lastPage = Math.max(Math.ceil(total / limit), 1);
        return {
          last_visible_page: lastPage,
          has_next_page: page < lastPage,
          current_page: page,
          items: { count, total, per_page: limit },
        };
      };

      if (CATALOG_PARAMS.some((k) => req.query[k] !== undefined)) {
        const { total, items } = queryCatalog({ ...parseCatalogQuery(req.query), limit, offset: start });
        return res.json({
          pagination: pagination(total, items.length),
          meta: { indexed: indexedCount() },
          data: items,
        });
      }

      const { data: all, cache } = await cached('producers/list', async () => {
        const html = await fetchPage('/anime/producer');
        return parseProducersList(html);
      });

      let list = all;
      if (req.query.q) {
        const q = String(req.query.q).toLowerCase();
        list = list.filter((p) => p.titles.some((t) => t.title.toLowerCase().includes(q)));
      }

      const pageItems = list.slice(start, start + limit);
      const extra = catalogItemsByIds(pageItems.map((p) => p.mal_id));

      res.set('X-Cache', cache);
      res.json({
        pagination: pagination(list.length, pageItems.length),
        data: pageItems.map((p) => {
          const e = extra.get(p.mal_id);
          return e ? { ...p, ...e, count: p.count } : { ...p, indexed: false };
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  // Похожие студии по жанрам: у обычной студии — только обычные, у 18+ студии — только 18+
  v4.get('/producers/:id/similar', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const { data: snap, cache } = await getProducerSnapshot(id);
      recordHit(id);

      const summary = buildSummary(snap.titles);
      const target = genreVector(summary.genres, baseTitles(snap.titles).list.length);
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 5, 1), 20);

      const data = similarCandidates(summary.adult.is_adult_studio)
        .filter((c) => c.id !== id)
        .map((c) => ({ c, similarity: cosine(target, genreVector(c.genres, c.base_count)) }))
        .filter((x) => x.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity || b.c.members_total - a.c.members_total || a.c.id - b.c.id)
        .slice(0, limit)
        .map(({ c, similarity }) => ({
          mal_id: c.id,
          name: c.name,
          similarity: Number(similarity.toFixed(2)),
          genres: c.genres.slice(0, 3).map((g) => g.id),
          stats: { titles_studio: c.titles_studio, members_total: c.members_total },
        }));

      res.set('X-Cache', cache);
      res.json({ meta: { indexed: indexedCount() }, data });
    } catch (err) {
      next(err);
    }
  });

  // Страница студии: шапка, ссылки, цифры, жанры, годы, лучшие тайтлы, признак 18+ (sfw — без 18+ тайтлов)
  v4.get('/producers/:id/full', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const { data: snap, cache } = await getProducerSnapshot(id);
      recordHit(id);
      const summary = buildSummary(snap.titles, { sfw: isTruthy(req.query.sfw), navTotal: snap.nav_total });

      res.set('X-Cache', cache);
      res.json({
        data: {
          mal_id: snap.mal_id,
          url: snap.url,
          name: snap.name,
          name_japanese: snap.name_japanese,
          synonyms: snap.synonyms,
          logo: snap.logo,
          established: snap.established,
          established_precision: snap.established_precision,
          favorites: snap.favorites,
          links: snap.links,
          ...summary,
          fetched_at: snap.fetched_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Тайтлы студии (role, type, q, order_by, sort, status, sfw, page, limit)
  v4.get('/producers/:id/anime', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const { data: snap, cache } = await getProducerSnapshot(id);
      recordHit(id);
      const { role, items } = listTitles(snap.titles, { ...req.query, sfw: isTruthy(req.query.sfw) });

      const total = items.length;
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const start = (page - 1) * limit;
      const pageItems = items.slice(start, start + limit);
      const lastPage = Math.max(Math.ceil(total / limit), 1);

      res.set('X-Cache', cache);
      res.json({
        pagination: {
          last_visible_page: lastPage,
          has_next_page: page < lastPage,
          current_page: page,
          items: { count: pageItems.length, total, per_page: limit },
        },
        meta: { role },
        data: pageItems,
      });
    } catch (err) {
      next(err);
    }
  });

  // Студия/продюсер по id
  v4.get('/producers/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);

      const { data, cache } = await cached(`producers/${id}`, async () => {
        const html = await fetchPage(`/anime/producer/${id}`);
        return parseProducerFull(html);
      });

      res.set('X-Cache', cache);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });
};
