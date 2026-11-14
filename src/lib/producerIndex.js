const db = require('../db');
const { INDEX_MIN_TITLES } = require('../config');
const { buildSummary, baseTitles } = require('./producerStats');

// Компактная запись на студию для каталога и «похожих». Колонки — то, по чему сортируют и фильтруют;
// *_sfw — те же цифры без тайтлов 18+. Остальное (жанры, хиты, названия) — в JSON data.
db.exec(`
  CREATE TABLE IF NOT EXISTS producers_index (
    id                    INTEGER PRIMARY KEY,
    name                  TEXT NOT NULL,
    search                TEXT NOT NULL,
    established           TEXT,
    established_year      INTEGER,
    established_precision TEXT,
    favorites             INTEGER,
    list_count            INTEGER NOT NULL,
    titles_studio         INTEGER NOT NULL,
    score_avg             REAL,
    members_total         INTEGER NOT NULL,
    titles_studio_sfw     INTEGER NOT NULL,
    score_avg_sfw         REAL,
    members_total_sfw     INTEGER NOT NULL,
    year_first            INTEGER,
    year_last             INTEGER,
    adult_level           TEXT NOT NULL,
    is_adult              INTEGER NOT NULL,
    hentai_share          REAL NOT NULL,
    data                  TEXT NOT NULL,
    fetched_at            INTEGER NOT NULL
  )
`);

const upsertStmt = db.prepare(`
  INSERT INTO producers_index (
    id, name, search, established, established_year, established_precision, favorites, list_count,
    titles_studio, score_avg, members_total, titles_studio_sfw, score_avg_sfw, members_total_sfw,
    year_first, year_last, adult_level, is_adult, hentai_share, data, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, search = excluded.search, established = excluded.established,
    established_year = excluded.established_year, established_precision = excluded.established_precision,
    favorites = excluded.favorites, list_count = excluded.list_count,
    titles_studio = excluded.titles_studio, score_avg = excluded.score_avg, members_total = excluded.members_total,
    titles_studio_sfw = excluded.titles_studio_sfw, score_avg_sfw = excluded.score_avg_sfw,
    members_total_sfw = excluded.members_total_sfw, year_first = excluded.year_first, year_last = excluded.year_last,
    adult_level = excluded.adult_level, is_adult = excluded.is_adult, hentai_share = excluded.hentai_share,
    data = excluded.data, fetched_at = excluded.fetched_at
`);

/**
 * Обновляет запись студии по снимку её страницы. Студии меньше порога в индекс не попадают.
 * @returns {boolean} записана ли студия
 */
function upsertFromSnapshot(snap, now = Date.now()) {
  const listCount = snap.nav_total || snap.titles.length;
  if (listCount < INDEX_MIN_TITLES) return false;

  const full = buildSummary(snap.titles, { navTotal: snap.nav_total });
  const sfw = buildSummary(snap.titles, { sfw: true, navTotal: snap.nav_total });
  const year = snap.established ? Number.parseInt(snap.established.slice(0, 4), 10) : null;

  const names = [{ type: 'Default', title: snap.name }];
  if (snap.name_japanese) names.push({ type: 'Japanese', title: snap.name_japanese });
  for (const s of snap.synonyms) names.push({ type: 'Synonym', title: s });

  const data = {
    url: snap.url,
    logo: snap.logo,
    titles: names,
    stats: full.stats,
    stats_sfw: { titles_studio: sfw.stats.titles_studio, score_avg: sfw.stats.score_avg, members_total: sfw.stats.members_total },
    genres: full.genres,
    base_count: baseTitles(snap.titles).list.length,
    top_titles: full.top_titles,
    top_titles_sfw: sfw.top_titles,
  };

  upsertStmt.run(
    snap.mal_id,
    snap.name,
    names.map((n) => n.title).join(' ').toLowerCase(),
    snap.established,
    Number.isFinite(year) ? year : null,
    snap.established_precision,
    snap.favorites,
    listCount,
    full.stats.titles_studio,
    full.stats.score_avg,
    full.stats.members_total,
    sfw.stats.titles_studio,
    sfw.stats.score_avg,
    sfw.stats.members_total,
    full.stats.year_first,
    full.stats.year_last,
    full.adult.level,
    full.adult.is_adult_studio ? 1 : 0,
    full.adult.hentai_share,
    JSON.stringify(data),
    now
  );
  return true;
}

/** Строки индекса для планировщика обновлений: id -> { list_count, fetched_at, members_total }. */
function indexState() {
  const map = new Map();
  for (const r of db.prepare('SELECT id, list_count, fetched_at, members_total FROM producers_index').all()) {
    map.set(r.id, r);
  }
  return map;
}

function indexedCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM producers_index').get().n;
}

// ---- каталог ----

// order_by -> [колонка, колонка без 18+, направление по умолчанию]
const ORDER_COLUMNS = {
  members: ['members_total', 'members_total_sfw', 'DESC'],
  titles: ['titles_studio', 'titles_studio_sfw', 'DESC'],
  favorites: ['favorites', 'favorites', 'DESC'],
  score: ['score_avg', 'score_avg_sfw', 'DESC'],
  established: ['established_year', 'established_year', 'ASC'],
  name: ['name COLLATE NOCASE', 'name COLLATE NOCASE', 'ASC'],
};
const ORDER_KEYS = Object.keys(ORDER_COLUMNS);

/**
 * Каталог по индексу.
 * opts: q, order_by, sort (asc|desc), founded_from, founded_to, adult ('only'|'exclude'), sfw, limit, offset.
 * sfw скрывает студии 18+ и считает цифры без тайтлов 18+; adult='only' имеет приоритет над sfw.
 */
function queryCatalog(opts) {
  const where = [];
  const args = [];

  if (opts.q) {
    where.push('instr(search, ?) > 0');
    args.push(String(opts.q).trim().toLowerCase());
  }
  if (Number.isInteger(opts.founded_from)) {
    where.push('established_year >= ?');
    args.push(opts.founded_from);
  }
  if (Number.isInteger(opts.founded_to)) {
    where.push('established_year <= ?');
    args.push(opts.founded_to);
  }
  const hideAdult = opts.adult === 'exclude' || (opts.sfw && opts.adult !== 'only');
  if (opts.adult === 'only') where.push('is_adult = 1');
  else if (hideAdult) where.push('is_adult = 0');
  const sfwNumbers = !!opts.sfw && opts.adult !== 'only';

  const [col, colSfw, defaultDir] = ORDER_COLUMNS[opts.order_by] || ORDER_COLUMNS.members;
  const dir = opts.sort === 'asc' ? 'ASC' : opts.sort === 'desc' ? 'DESC' : defaultDir;
  const orderCol = sfwNumbers ? colSfw : col;
  const nulls = orderCol.includes('COLLATE') ? '' : `${orderCol} IS NULL, `;
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM producers_index ${clause}`).get(...args).n;
  const rows = db
    .prepare(`SELECT * FROM producers_index ${clause} ORDER BY ${nulls}${orderCol} ${dir}, id ASC LIMIT ? OFFSET ?`)
    .all(...args, opts.limit, opts.offset);

  return { total, items: rows.map((r) => catalogItem(r, sfwNumbers)) };
}

/** Элементы каталога по списку id (для обычного списка студий); только найденные в индексе. */
function catalogItemsByIds(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const rows = db
    .prepare(`SELECT * FROM producers_index WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  for (const r of rows) out.set(r.id, catalogItem(r, false));
  return out;
}

/** Формат элемента как у Jikan /producers + цифры индекса. */
function catalogItem(row, sfw) {
  const d = JSON.parse(row.data);
  const stats = sfw
    ? { ...d.stats, ...d.stats_sfw }
    : d.stats;
  return {
    mal_id: row.id,
    url: d.url,
    titles: d.titles,
    images: { jpg: { image_url: d.logo } },
    favorites: row.favorites,
    established: row.established,
    established_precision: row.established_precision,
    about: null,
    count: row.list_count,
    stats: {
      titles_studio: stats.titles_studio,
      score_avg: stats.score_avg,
      members_total: stats.members_total,
      year_first: d.stats.year_first,
      year_last: d.stats.year_last,
      truncated: d.stats.truncated,
    },
    top_titles: sfw ? d.top_titles_sfw : d.top_titles,
    adult: { level: row.adult_level, is_adult_studio: !!row.is_adult, hentai_share: row.hentai_share },
    indexed: true,
  };
}

/** Студии для сравнения жанров: только 18+ или только обычные. */
function similarCandidates(isAdult) {
  return db
    .prepare('SELECT id, name, titles_studio, members_total, data FROM producers_index WHERE is_adult = ?')
    .all(isAdult ? 1 : 0)
    .map((r) => {
      const d = JSON.parse(r.data);
      return {
        id: r.id,
        name: r.name,
        titles_studio: r.titles_studio,
        members_total: r.members_total,
        genres: d.genres,
        base_count: d.base_count,
      };
    });
}

module.exports = {
  ORDER_KEYS,
  upsertFromSnapshot,
  indexState,
  indexedCount,
  queryCatalog,
  catalogItemsByIds,
  similarCandidates,
};
