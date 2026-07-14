# Kagami API

**English** | [Русский](README.ru.md)

> 鏡 *(kagami — "mirror")* — a self-hosted mirror of MyAnimeList data.

A self-hosted, Jikan-compatible REST API for [MyAnimeList](https://myanimelist.net) built with Node.js. Kagami scrapes MAL pages directly — no dependency on api.jikan.moe — and caches every response in a local SQLite database, so your app keeps working even when MAL is slow, rate-limiting, or down.

**Why not just use Jikan?** Jikan is great, but it's a shared public service: thousands of apps hit MAL through the same servers, MAL blocks their IPs, and you get `504 — Jikan failed to connect to MyAnimeList`. Kagami runs on *your* server with *your* IP and *your* cache. Cached responses are served instantly, and if MAL is unreachable, you get the last cached copy instead of an error.

## Features

- **Jikan v4 compatible responses** — drop-in replacement, same `{ "data": ... }` format. Point your existing Jikan client at your own server and it just works.
- **Direct MAL scraping** — parsers are ported from Jikan's open-source selectors, zero third-party APIs in between.
- **SQLite cache with per-endpoint TTL** — 7 days for static data, shorter for seasonal/search. No database server required.
- **Stale-on-error** — if MAL is down and the cache has expired, the stale copy is served instead of a 5xx.
- **Request coalescing** — concurrent identical requests produce a single MAL fetch.
- **Origin allowlist (CORS)** — the API only answers your own websites.
- **Extensible by design** — one file in `src/api/` = one set of endpoints, auto-loaded at startup.

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

Requires Node.js 18+ (with Node 22.5+ the built-in `node:sqlite` is used; older versions fall back to `better-sqlite3`).

## Endpoints

> **Note:** this is not a full port of the Jikan v4 REST API. Only the endpoints used by the [Tunime](https://an0ncer.github.io/) project are implemented. The architecture makes adding more endpoints easy — see [Adding endpoints](#adding-endpoints).

| Endpoint | Cache TTL |
| --- | --- |
| `GET /v4/anime?q=...` — search (q, page, limit, type, status, rating, score, genres, genres_exclude, producers, start_date, end_date, order_by, sort, sfw, letter) | 1 day |
| `GET /v4/anime/{id}/full` | 7 days |
| `GET /v4/anime/{id}/characters` | 7 days |
| `GET /v4/characters/{id}/full` | 7 days |
| `GET /v4/characters/{id}/pictures` | 7 days |
| `GET /v4/producers` (q, page, limit) | 7 days |
| `GET /v4/producers/{id}` | 7 days |
| `GET /v4/recommendations/anime` (page) | 6 hours |
| `GET /v4/seasons` | 7 days |
| `GET /v4/seasons/now` (filter, sfw, continuing, page, limit) | 6 hours |
| `GET /v4/seasons/{year}/{season}` (filter, sfw, continuing, page, limit) | 7 days |

Every response includes an `X-Cache` header: `HIT` / `MISS` / `UPDATED` / `STALE`.

## Configuration

All settings are environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `CACHE_TTL_MS` | `604800000` (7 days) | Default cache TTL |
| `DB_PATH` | `data/cache.db` | SQLite database path |
| `ALLOWED_ORIGINS` | `https://an0ncer.github.io` | Comma-separated list of allowed website origins |
| `STRICT_ORIGIN` | `false` | Set `true` to also reject requests without an `Origin` header (curl etc.) |
| `REQUEST_TIMEOUT_MS` | `15000` | Timeout for requests to MAL |

## Access control (CORS)

The API only answers websites from the allowlist. Requests from other sites get a Jikan-style `403`. Requests without an `Origin` header (curl, address bar) are allowed by default for easy testing — set `STRICT_ORIGIN=true` to block them too. `localhost` origins are always allowed for local frontend development.

## Caching

Responses are stored in SQLite (`data/cache.db`, created automatically). When a cached entry expires, it is refreshed on the next request. If the refresh fails (MAL down / blocking), the stale copy is served with `X-Cache: STALE` — your users never see Jikan's infamous 504.

## Adding endpoints

Each endpoint lives in its own file in **`src/api/`** — the server auto-loads every `.js` file at startup. A file exports a function that receives the `/v4` router:

```js
// src/api/manga.js
const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');

module.exports = function register(v4) {
  v4.get('/manga/:id/full', async (req, res, next) => {
    try {
      const { data, cache } = await cached(`manga/${req.params.id}/full`, async () => {
        const html = await fetchPage(`/manga/${req.params.id}`);
        return parseMangaFull(html); // your parser in src/parsers/
      });
      res.set('X-Cache', cache);
      res.json({ data });
    } catch (e) { next(e); }
  });
};
```

HTML parsers live in `src/parsers/` (selectors can be ported from [Jikan's sources](https://github.com/jikan-me/jikan/tree/master/src/Parser)).

## Project structure

```
src/
  server.js        — Express app, auto-loads endpoints from src/api, CORS
  config.js        — port, TTL, DB path, allowed origins (env-configurable)
  db.js            — SQLite (node:sqlite or better-sqlite3)
  cache.js         — TTL cache + stale-on-error + request coalescing
  errors.js        — Jikan-style error responses
  api/             — EXTENSION FOLDER: one file = one set of endpoints
  mal/
    client.js      — fetches HTML from myanimelist.net
    utils.js       — shared parsing helpers (images, ids, text cleanup)
  parsers/         — MAL page HTML -> Jikan v4 JSON
test/              — parser tests on fixtures + cache logic tests
```

## Tests

```bash
npm test
```

## Deployment tip

Kagami works great on a small home server behind a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — a residential IP is far less likely to be blocked by MAL than datacenter IPs, which is the root cause of Jikan's 504 errors.

## Disclaimer

Kagami API is an unofficial project and is **not affiliated with MyAnimeList**. All data belongs to their respective owners. Use responsibly: the built-in cache exists to keep traffic to MAL minimal.

## License

[MIT](LICENSE)
