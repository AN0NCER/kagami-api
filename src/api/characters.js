const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseCharacterFull } = require('../parsers/character');
const { parseCharacterPictures } = require('../parsers/characterPictures');
const { ApiError } = require('../errors');

function validId(raw) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'BadRequestException', 'Invalid character id');
  }
  return id;
}

/**
 * Эндпоинты /v4/characters/*
 * @param {import('express').Router} v4 роутер, смонтированный на /v4
 */
module.exports = function register(v4) {
  v4.get('/characters/:id/full', async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      const { data, cache } = await cached(`characters/${id}/full`, async () => {
        const html = await fetchPage(`/character/${id}`);
        return parseCharacterFull(html);
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  v4.get('/characters/:id/pictures', async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      const { data, cache } = await cached(`characters/${id}/pictures`, async () => {
        const html = await fetchPage(`/character/${id}/_/pictures`);
        return parseCharacterPictures(html);
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });
};
