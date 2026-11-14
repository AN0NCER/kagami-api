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

  // Доля тайтлов с жанром Hentai, с которой студия считается «в основном» / «целиком» 18+
  ADULT_SHARE_MOSTLY: Number.parseFloat(process.env.ADULT_SHARE_MOSTLY) || 0.5,
  ADULT_SHARE_EXCLUSIVE: Number.parseFloat(process.env.ADULT_SHARE_EXCLUSIVE) || 0.9,

  // Индекс студий: фоновый обход страниц студий по одной
  INDEXER_ENABLED: process.env.INDEXER_ENABLED !== 'false',
  INDEX_MIN_TITLES: Number.parseInt(process.env.INDEX_MIN_TITLES, 10) || 10, // студии меньше порога в каталог не входят
  INDEX_DELAY_MS: process.env.INDEX_DELAY_MS === '0' ? 0 : Number.parseInt(process.env.INDEX_DELAY_MS, 10) || 2000, // пауза между запросами к MAL
  INDEX_CYCLE_MS: Number.parseInt(process.env.INDEX_CYCLE_MS, 10) || 6 * 60 * 60 * 1000, // как часто собирается очередь
  INDEX_LIST_CHECK_MS: Number.parseInt(process.env.INDEX_LIST_CHECK_MS, 10) || 24 * 60 * 60 * 1000, // сверка счётчиков по общему списку
  INDEX_HOT_COUNT: Number.parseInt(process.env.INDEX_HOT_COUNT, 10) || 50, // сколько самых востребованных студий обновлять чаще
  INDEX_HOT_TTL_MS: Number.parseInt(process.env.INDEX_HOT_TTL_MS, 10) || 24 * 60 * 60 * 1000,
  INDEX_SEASON_TTL_MS: Number.parseInt(process.env.INDEX_SEASON_TTL_MS, 10) || 2 * 24 * 60 * 60 * 1000,
  INDEX_COLD_TTL_MS: Number.parseInt(process.env.INDEX_COLD_TTL_MS, 10) || 7 * 24 * 60 * 60 * 1000,
  INDEX_MAX_FAILS: Number.parseInt(process.env.INDEX_MAX_FAILS, 10) || 3, // подряд ошибок до остановки обхода

  // Востребованность студии: запросы затухают с таким периодом полураспада
  HITS_HALF_LIFE_DAYS: Number.parseFloat(process.env.HITS_HALF_LIFE_DAYS) || 7,
};
