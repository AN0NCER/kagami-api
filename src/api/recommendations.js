const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseRecentRecommendations } = require('../parsers/recommendations');

const HOUR_MS = 60 * 60 * 1000;

/**
 * GET /v4/recommendations/anime — недавние рекомендации пользователей.
 * @param {import('express').Router} v4
 */
module.exports = function register(v4) {
  v4.get('/recommendations/anime', async (req, res, next) => {
    try {
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const show = page > 1 ? `&show=${100 * (page - 1)}` : '';

      const { data: parsed, cache } = await cached(
        `recommendations/anime?page=${page}`,
        async () => {
          const html = await fetchPage(`/recommendations.php?s=recentrecs&t=anime${show}`);
          return parseRecentRecommendations(html);
        },
        6 * HOUR_MS // рекомендации обновляются часто
      );

      res.set('X-Cache', cache);
      res.json({
        pagination: {
          last_visible_page: parsed.lastPage,
          has_next_page: parsed.hasNextPage,
          current_page: page,
        },
        data: parsed.results,
      });
    } catch (err) {
      next(err);
    }
  });
};
