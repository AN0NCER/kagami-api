const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseProducersList, parseProducerFull } = require('../parsers/producers');
const { ApiError } = require('../errors');

/**
 * Эндпоинты /v4/producers*
 * @param {import('express').Router} v4
 */
module.exports = function register(v4) {
  // Список студий/продюсеров (q, page, limit)
  v4.get('/producers', async (req, res, next) => {
    try {
      const { data: all, cache } = await cached('producers/list', async () => {
        const html = await fetchPage('/anime/producer');
        return parseProducersList(html);
      });

      let list = all;
      if (req.query.q) {
        const q = String(req.query.q).toLowerCase();
        list = list.filter((p) => p.titles.some((t) => t.title.toLowerCase().includes(q)));
      }

      const total = list.length;
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const start = (page - 1) * limit;
      const pageItems = list.slice(start, start + limit);
      const lastPage = Math.max(Math.ceil(total / limit), 1);

      res.set('X-Cache', cache);
      res.json({
        pagination: {
          last_visible_page: lastPage,
          has_next_page: page < lastPage,
          current_page: page,
          items: { count: pageItems.length, total, per_page: limit },
        },
        data: pageItems,
      });
    } catch (err) {
      next(err);
    }
  });

  // Студия/продюсер по id
  v4.get('/producers/:id', async (req, res, next) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'BadRequestException', 'Invalid producer id');
      }

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
