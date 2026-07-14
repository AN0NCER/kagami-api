const fs = require('fs');
const path = require('path');
const express = require('express');
const { PORT, ALLOWED_ORIGINS, STRICT_ORIGIN } = require('./config');
const { ApiError } = require('./errors');

const app = express();
app.disable('x-powered-by');

// ---- Доступ только с разрешённых сайтов (CORS + проверка Origin) ----------
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isLocal = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowed = origin && (ALLOWED_ORIGINS.includes(origin) || isLocal);

  if (origin) {
    if (!allowed) {
      return res.status(403).json({
        status: 403,
        type: 'ForbiddenException',
        message: 'Origin not allowed',
        error: null,
      });
    }
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Expose-Headers', 'X-Cache');
    res.set('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  } else if (STRICT_ORIGIN) {
    // Запросы без Origin (curl и т.п.) блокируются только в строгом режиме
    return res.status(403).json({
      status: 403,
      type: 'ForbiddenException',
      message: 'Origin required',
      error: null,
    });
  }

  next();
});

// ---- Автозагрузка эндпоинтов из папки src/api ----------------------------
// Чтобы расширить API, просто добавь новый файл в src/api,
// экспортирующий function(v4Router) { v4Router.get(...) }
const v4 = express.Router();
const apiDir = path.join(__dirname, 'api');

for (const file of fs.readdirSync(apiDir)) {
  if (!file.endsWith('.js')) continue;
  const register = require(path.join(apiDir, file));
  if (typeof register === 'function') {
    register(v4);
    console.log(`[api] loaded: ${file}`);
  }
}

app.use('/v4', v4);

app.get('/', (req, res) => {
  res.json({
    name: 'kagami-api',
    description: 'Self-hosted MyAnimeList API (Jikan v4 compatible) with SQLite cache',
    endpoints: [
      '/v4/anime?q=...',
      '/v4/anime/{id}/full',
      '/v4/anime/{id}/characters',
      '/v4/characters/{id}/full',
      '/v4/characters/{id}/pictures',
      '/v4/producers',
      '/v4/producers/{id}',
      '/v4/recommendations/anime',
      '/v4/seasons',
      '/v4/seasons/now',
      '/v4/seasons/{year}/{season}',
    ],
  });
});

// ---- 404 + обработчик ошибок в стиле Jikan --------------------------------
app.use((req, res) => {
  res.status(404).json({
    status: 404,
    type: 'HttpException',
    message: 'Not Found',
    error: null,
  });
});

app.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.toJSON());
  }
  console.error(err);
  return res.status(500).json({
    status: 500,
    type: 'InternalException',
    message: err.message || 'Internal Server Error',
    error: null,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Kagami API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
