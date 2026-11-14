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
| `GET /v4/anime/{id}/pictures` | 7 days |
| `GET /v4/anime/{id}/characters` | 7 days |
| `GET /v4/characters/{id}/full` | 7 days |
| `GET /v4/characters/{id}/pictures` | 7 days |
| `GET /v4/producers` (q, page, limit; catalog: order_by, sort, founded_from, founded_to, adult, sfw) | 7 days (list) / studio index |
| `GET /v4/producers/{id}` | 7 days |
| `GET /v4/producers/{id}/full` (sfw) — studio page: stats, genres, years, top titles, 18+ flag | 1 day |
| `GET /v4/producers/{id}/anime` (role, type, q, order_by, sort, status, sfw, page, limit) — studio titles | 1 day |
| `GET /v4/producers/{id}/similar` (limit) — similar studios by genres | studio index |
| `GET /v4/recommendations/anime` (page) | 6 hours |
| `GET /v4/seasons` | 7 days |
| `GET /v4/seasons/now` (filter, sfw, continuing, page, limit) | 6 hours |
| `GET /v4/seasons/{year}/{season}` (filter, sfw, continuing, page, limit) | 7 days |

Every response includes an `X-Cache` header: `HIT` / `MISS` / `UPDATED` / `STALE`.

## Studios

Everything about a studio comes from one MAL page (`/anime/producer/{id}`), which lists all of the studio's titles. Kagami parses it once, caches the result, and computes the numbers per request.

- **`/producers/{id}/full`** — names, founding date (with `established_precision`: `day` / `month` / `year`), favorites, links, `stats` (title counts per role and format, average score over rated titles, total members, years active, upcoming count), `genres`, five-year `decades`, `top_titles`, `best_rated` and the `adult` block.
- **`/producers/{id}/anime`** — titles of the studio. `role` is `studio` (default), `producer`, `licensor` or `all`; for a company with no `studio` titles the default is `all`, and `meta.role` tells which one was applied. `order_by`: `members` (default), `score`, `start_date`, `title`. `status=upcoming` returns titles that have no score yet and a release date ahead.
- **Limit:** MAL shows at most 1000 titles per studio; `stats.truncated` is `true` for such studios.

### 18+ studios

A studio is classified by the share of its titles that have the **Hentai** genre (id 12), across all roles:

| `adult.level` | Share | `is_adult_studio` |
| --- | --- | --- |
| `none` | 0 | `false` |
| `partial` | below 50% | `false` |
| `mostly` | 50% and up | `true` |
| `exclusive` | 90% and up | `true` |

Thresholds are configurable (`ADULT_SHARE_MOSTLY`, `ADULT_SHARE_EXCLUSIVE`). The `adult` block (also `hentai_share_members`, `hentai_share_recent`, `low_sample`) is always returned and always computed from the full title list; nothing is hidden unless you ask:

- `sfw=true` removes 18+ titles (`adult: true` on a title card) from titles, stats and top lists, and hides 18+ studios from the catalog and from similar-studio results.
- `GET /producers?adult=only` lists only 18+ studios, `adult=exclude` lists none of them; `adult=only` takes precedence over `sfw`.
- Similar studios of an 18+ studio are only 18+ studios, and vice versa.

### Studio catalog and index

`GET /v4/producers` with any of `order_by` (`members`, `titles`, `favorites`, `score`, `established`, `name`), `sort`, `founded_from`, `founded_to`, `adult` or `sfw` is served from a local **studio index**: one compact row per studio with at least `INDEX_MIN_TITLES` (10) titles. Without those parameters you get the plain MAL list, with the index numbers added for indexed studios.

The index is filled and kept fresh by a background job that visits studio pages one at a time with a pause (`INDEX_DELAY_MS`), so it stays light on a small server. A studio is refreshed when:

- it is not in the index yet;
- its title count in the daily-checked MAL studio list changed;
- it is in the current season (every 2 days);
- it is due: the most requested studios (top `INDEX_HOT_COUNT`) every day, the rest every week.

**Most requested studios go first.** Every request to a studio endpoint counts as a hit; hits fade with a half-life of `HITS_HALF_LIFE_DAYS` (7), so recent interest matters most. The refresh queue is ordered by this value. Hits are written to SQLite in batches, once a minute. Set `INDEXER_ENABLED=false` to turn the background job off.

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
| `ADULT_SHARE_MOSTLY` | `0.5` | Hentai share from which a studio is `mostly` 18+ |
| `ADULT_SHARE_EXCLUSIVE` | `0.9` | Hentai share from which a studio is `exclusive` 18+ |
| `INDEXER_ENABLED` | `true` | Run the background studio index job |
| `INDEX_MIN_TITLES` | `10` | Minimum titles for a studio to be in the index |
| `INDEX_DELAY_MS` | `2000` | Pause between studio page requests to MAL |
| `INDEX_CYCLE_MS` | `21600000` (6 h) | How often the refresh queue is built |
| `INDEX_LIST_CHECK_MS` | `86400000` (1 day) | How often the MAL studio list is re-downloaded to compare title counts |
| `INDEX_HOT_COUNT` | `50` | How many most requested studios are refreshed more often |
| `INDEX_HOT_TTL_MS` | `86400000` (1 day) | Refresh period of those studios |
| `INDEX_SEASON_TTL_MS` | `172800000` (2 days) | Refresh period of studios in the current season |
| `INDEX_COLD_TTL_MS` | `604800000` (7 days) | Refresh period of all other studios |
| `INDEX_MAX_FAILS` | `3` | Consecutive MAL errors after which a refresh pass stops |
| `HITS_HALF_LIFE_DAYS` | `7` | Half-life of the request counter used for refresh priority |

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
  lib/             — studio statistics and 18+ detection, title lists, studio index, background refresh, request counter
  mal/
    client.js      — fetches HTML from myanimelist.net
    utils.js       — shared parsing helpers (images, ids, text cleanup)
  parsers/         — MAL page HTML -> Jikan v4 JSON
test/              — parser tests on fixtures, cache logic, studio stats/index/routes tests (against a local fake MAL)
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
