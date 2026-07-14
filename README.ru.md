# Kagami API

[English](README.md) | **Русский**

> 鏡 *(kagami — «зеркало»)* — self-hosted зеркало данных MyAnimeList.

Собственный REST API для [MyAnimeList](https://myanimelist.net) на Node.js, совместимый с Jikan. Kagami парсит страницы MAL напрямую — без зависимости от api.jikan.moe — и кэширует каждый ответ в локальной SQLite-базе, поэтому твоё приложение продолжает работать, даже когда MAL тормозит, режет запросы или лежит.

**Почему не просто Jikan?** Jikan — отличный проект, но это общий публичный сервис: тысячи приложений ходят в MAL через одни и те же серверы, MAL блокирует их IP, и ты получаешь `504 — Jikan failed to connect to MyAnimeList`. Kagami работает на *твоём* сервере, с *твоим* IP и *твоим* кэшем. Закэшированные ответы отдаются мгновенно, а если MAL недоступен — вернётся последняя сохранённая копия вместо ошибки.

## Возможности

- **Ответы в формате Jikan v4** — drop-in замена, тот же формат `{ "data": ... }`. Достаточно поменять адрес API в существующем коде.
- **Прямой парсинг MAL** — селекторы портированы из открытого кода Jikan, никаких сторонних API между тобой и MAL.
- **SQLite-кэш с TTL на каждый эндпоинт** — 7 дней для статичных данных, меньше для сезонов и поиска. Сервер БД не нужен.
- **Stale-on-error** — если MAL лежит, а кэш протух, отдаётся устаревшая копия вместо 5xx.
- **Слияние запросов** — параллельные одинаковые запросы порождают один поход в MAL.
- **Список разрешённых сайтов (CORS)** — API отвечает только твоим сайтам.
- **Расширяемость по дизайну** — один файл в `src/api/` = один набор эндпоинтов, подхватывается автоматически.

## Быстрый старт

```bash
npm install
npm start          # http://localhost:3000
```

Требуется Node.js 18+ (на Node 22.5+ используется встроенный `node:sqlite`, на более старых — `better-sqlite3`).

## Эндпоинты

> **Важно:** это не полный порт REST API Jikan v4. Реализованы только эндпоинты, которые нужны проекту [Tunime](https://an0ncer.github.io/). Архитектура позволяет легко добавлять новые — см. раздел [Как добавить эндпоинт](#как-добавить-эндпоинт).

| Эндпоинт | TTL кэша |
| --- | --- |
| `GET /v4/anime?q=...` — поиск (q, page, limit, type, status, rating, score, genres, genres_exclude, producers, start_date, end_date, order_by, sort, sfw, letter) | 1 день |
| `GET /v4/anime/{id}/full` | 7 дней |
| `GET /v4/anime/{id}/pictures` | 7 дней |
| `GET /v4/anime/{id}/characters` | 7 дней |
| `GET /v4/characters/{id}/full` | 7 дней |
| `GET /v4/characters/{id}/pictures` | 7 дней |
| `GET /v4/producers` (q, page, limit) | 7 дней |
| `GET /v4/producers/{id}` | 7 дней |
| `GET /v4/recommendations/anime` (page) | 6 часов |
| `GET /v4/seasons` | 7 дней |
| `GET /v4/seasons/now` (filter, sfw, continuing, page, limit) | 6 часов |
| `GET /v4/seasons/{year}/{season}` (filter, sfw, continuing, page, limit) | 7 дней |

Каждый ответ содержит заголовок `X-Cache`: `HIT` / `MISS` / `UPDATED` / `STALE`.

## Настройка

Все настройки — через переменные окружения:

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `PORT` | `3000` | Порт сервера |
| `CACHE_TTL_MS` | `604800000` (7 дней) | TTL кэша по умолчанию |
| `DB_PATH` | `data/cache.db` | Путь к SQLite-базе |
| `ALLOWED_ORIGINS` | `https://an0ncer.github.io` | Разрешённые сайты, через запятую |
| `STRICT_ORIGIN` | `false` | `true` — блокировать и запросы без заголовка `Origin` (curl и т.п.) |
| `REQUEST_TIMEOUT_MS` | `15000` | Таймаут запросов к MAL |

## Доступ (CORS)

API отвечает только сайтам из списка разрешённых. Запросы с чужих сайтов получают `403` в формате Jikan. Запросы без заголовка `Origin` (curl, адресная строка) по умолчанию разрешены — чтобы удобно тестировать; заблокировать их можно через `STRICT_ORIGIN=true`. Origin с `localhost` разрешён всегда — для локальной разработки фронтенда.

## Кэширование

Ответы хранятся в SQLite (`data/cache.db`, создаётся автоматически). Когда запись протухает, она обновляется при следующем запросе. Если обновление не удалось (MAL лежит или блокирует), отдаётся устаревшая копия с `X-Cache: STALE` — пользователи никогда не увидят знаменитый 504 Jikan.

## Как добавить эндпоинт

Каждый эндпоинт — отдельный файл в **`src/api/`**, сервер подхватывает все `.js`-файлы при старте. Файл экспортирует функцию, принимающую роутер `/v4`:

```js
// src/api/manga.js
const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');

module.exports = function register(v4) {
  v4.get('/manga/:id/full', async (req, res, next) => {
    try {
      const { data, cache } = await cached(`manga/${req.params.id}/full`, async () => {
        const html = await fetchPage(`/manga/${req.params.id}`);
        return parseMangaFull(html); // свой парсер в src/parsers/
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (e) { next(e); }
  });
};
```

HTML-парсеры лежат в `src/parsers/` (селекторы можно портировать из [исходников Jikan](https://github.com/jikan-me/jikan/tree/master/src/Parser)).

## Структура проекта

```
src/
  server.js        — Express, автозагрузка эндпоинтов из src/api, CORS
  config.js        — порт, TTL, путь к БД, разрешённые сайты (через env)
  db.js            — SQLite (node:sqlite или better-sqlite3)
  cache.js         — TTL-кэш + stale-on-error + слияние запросов
  errors.js        — ошибки в формате Jikan
  api/             — ПАПКА РАСШИРЕНИЯ: один файл = один набор эндпоинтов
  mal/
    client.js      — загрузка HTML с myanimelist.net
    utils.js       — общие хелперы парсинга (картинки, id, чистка текста)
  parsers/         — HTML страниц MAL -> JSON в формате Jikan v4
test/              — тесты парсеров на фикстурах + тесты логики кэша
```

## Тесты

```bash
npm test
```

## Совет по развёртыванию

Kagami отлично живёт на маленьком домашнем сервере за [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — домашний IP MAL блокирует куда реже, чем IP датацентров (а это и есть первопричина 504 у Jikan).

## Дисклеймер

Kagami API — неофициальный проект, **не аффилирован с MyAnimeList**. Все данные принадлежат их владельцам. Используй ответственно: встроенный кэш существует для того, чтобы трафик на MAL был минимальным.

## Лицензия

[MIT](LICENSE)
