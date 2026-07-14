const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseAnimeFull } = require('../parsers/anime');
const { parseAnimeCharacters } = require('../parsers/animeCharacters');
const { ApiError } = require('../errors');

function validId(raw) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'BadRequestException', 'Invalid id');
  }
  return id;
}

/**
 * Эндпоинты /v4/anime/*
 * @param {import('express').Router} v4
 */
module.exports = function register(v4) {
  v4.get('/anime/:id/full', async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      const { data, cache } = await cached(`anime/${id}/full`, async () => {
        const html = await fetchPage(`/anime/${id}`);
        return parseAnimeFull(html);
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  v4.get('/anime/:id/characters', async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      const { data, cache } = await cached(`anime/${id}/characters`, async () => {
        const html = await fetchPage(`/anime/${id}/_/characters`);
        return parseAnimeCharacters(html);
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });
};
