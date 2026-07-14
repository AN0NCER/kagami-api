const path = require('path');

module.exports = {
  PORT: Number.parseInt(process.env.PORT, 10) || 3000,

  // Кэш живёт 7 дней; после истечения — обновление при следующем запросе
  CACHE_TTL_MS: Number.parseInt(process.env.CACHE_TTL_MS, 10) || 7 * 24 * 60 * 60 * 1000,

  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cache.db'),

  MAL_BASE_URL: process.env.MAL_BASE_URL || 'https://myanimelist.net',

  USER_AGENT:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',

  REQUEST_TIMEOUT_MS: Number.parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 15000,

  // Сайты, которым разрешено обращаться к API (через запятую в env ALLOWED_ORIGINS).
  // Запросы без заголовка Origin (curl, адресная строка) разрешены,
  // если не включён STRICT_ORIGIN=true.
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'https://an0ncer.github.io')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  STRICT_ORIGIN: process.env.STRICT_ORIGIN === 'true',
};
