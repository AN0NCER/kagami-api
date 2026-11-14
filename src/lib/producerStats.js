const { ADULT_SHARE_MOSTLY, ADULT_SHARE_EXCLUSIVE } = require('../config');

const GENRE_HENTAI = 12;
const GENRE_EROTICA = 49;
const GENRE_ECCHI = 9;

// MAL отдаёт на странице студии не больше 1000 тайтлов
const MAL_TITLES_LIMIT = 1000;

const TOP_TITLES = 3;
const BEST_RATED = 6;
const BEST_RATED_MIN_MEMBERS = 1000;
const RECENT_YEARS = 5;
const LOW_SAMPLE = 3;

/** Тайтл 18+ — жанр Hentai. */
const isAdultTitle = (t) => t.genres.includes(GENRE_HENTAI);

/** Карточка тайтла для ответа API. */
function toCard(t) {
  return {
    mal_id: t.mal_id,
    title: t.title,
    role: t.role,
    score: t.score,
    members: t.members,
    start_date: t.start_date,
    type: t.type,
    genres: t.genres,
    adult: isAdultTitle(t),
  };
}

/**
 * Тайтлы «своей анимации»: роль studio; если таких нет (у хентай-студий все тайтлы с ролью
 * producer) — все, кроме licensor; если и их нет — все.
 */
function baseTitles(titles) {
  const own = titles.filter((t) => t.role === 'studio');
  if (own.length) return { basis: 'studio', list: own };
  const noLicensor = titles.filter((t) => t.role !== 'licensor');
  if (noLicensor.length) return { basis: 'all', list: noLicensor };
  return { basis: 'all', list: titles };
}

const TYPE_KEYS = ['tv', 'movie', 'ova', 'ona', 'special', 'other'];

/** Формат тайтла для фильтров и счётчиков; Music, CM, PV, TV Special и неизвестный тип — other. */
function typeKey(t) {
  return { 1: 'tv', 3: 'movie', 2: 'ova', 5: 'ona', 4: 'special' }[t.type_id] || 'other';
}

function countTypes(titles) {
  const types = Object.fromEntries(TYPE_KEYS.map((k) => [k, 0]));
  for (const t of titles) types[typeKey(t)] += 1;
  return types;
}

function genreCounts(titles) {
  const map = new Map();
  for (const t of titles) {
    for (const g of t.genres) map.set(g, (map.get(g) || 0) + 1);
  }
  return [...map.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
}

/** Пятилетки: [{from: 1980, count}], по возрастанию. */
function decadeCounts(titles) {
  const map = new Map();
  for (const t of titles) {
    if (!t.start_date) continue;
    const from = Math.floor(t.start_date.year / 5) * 5;
    map.set(from, (map.get(from) || 0) + 1);
  }
  return [...map.entries()].map(([from, count]) => ({ from, count })).sort((a, b) => a.from - b.from);
}

/** Последний возможный день периода даты (для неполных дат — конец месяца / года). */
function latestDay(d) {
  const month = d.month || 12;
  const day = d.day || new Date(Date.UTC(d.year, month, 0)).getUTCDate();
  return Date.UTC(d.year, month - 1, day);
}

/**
 * Анонс: оценки ещё нет и дата выхода впереди (для неполной даты — период ещё не закончился).
 * Прямого статуса на странице студии нет, это оценка по дате.
 */
function isUpcoming(t, now) {
  if (t.score !== null || !t.start_date) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return latestDay(t.start_date) > today;
}

const round = (x, digits) => Number(x.toFixed(digits));

/**
 * Определение 18+ по доле тайтлов с жанром Hentai среди всех тайтлов страницы (любая роль).
 * level: none | partial | mostly | exclusive.
 */
function computeAdult(titles, opts = {}) {
  const mostly = opts.mostly ?? ADULT_SHARE_MOSTLY;
  const exclusive = opts.exclusive ?? ADULT_SHARE_EXCLUSIVE;
  const now = opts.now || new Date();

  const total = titles.length;
  const hentai = titles.filter(isAdultTitle);
  const share = total ? hentai.length / total : 0;

  const membersAll = titles.reduce((s, t) => s + (t.members || 0), 0);
  const membersHentai = hentai.reduce((s, t) => s + (t.members || 0), 0);

  const recentFrom = now.getUTCFullYear() - RECENT_YEARS;
  const recent = titles.filter((t) => t.start_date && t.start_date.year >= recentFrom);
  const recentHentai = recent.filter(isAdultTitle).length;

  let level = 'none';
  if (share > 0) level = 'partial';
  if (share >= mostly) level = 'mostly';
  if (share >= exclusive) level = 'exclusive';

  return {
    level,
    is_adult_studio: level === 'mostly' || level === 'exclusive',
    low_sample: total < LOW_SAMPLE,
    hentai_titles: hentai.length,
    erotica_titles: titles.filter((t) => t.genres.includes(GENRE_EROTICA)).length,
    ecchi_titles: titles.filter((t) => t.genres.includes(GENRE_ECCHI)).length,
    total_titles: total,
    hentai_share: round(share, 4),
    hentai_share_members: membersAll ? round(membersHentai / membersAll, 4) : 0,
    hentai_share_recent: recent.length ? round(recentHentai / recent.length, 4) : null,
  };
}

/**
 * Сводка студии по списку тайтлов (результат parseProducerPage().titles).
 *
 * opts.sfw — убрать тайтлы 18+ из всех цифр, кроме блока adult (он считается по полному списку).
 * opts.navTotal — число тайтлов из вкладки «All (N)» (для признака truncated).
 * opts.now — «сейчас» (для тестов).
 */
function buildSummary(allTitles, opts = {}) {
  const now = opts.now || new Date();
  const titles = opts.sfw ? allTitles.filter((t) => !isAdultTitle(t)) : allTitles;
  const { basis, list: base } = baseTitles(titles);

  const rated = base.filter((t) => t.score !== null);
  const years = base.filter((t) => t.start_date).map((t) => t.start_date.year);
  const count = (role) => titles.filter((t) => t.role === role).length;

  const byMembers = (a, b) => (b.members || 0) - (a.members || 0);
  const ownStudio = base.filter((t) => t.role === 'studio');
  const topPool = ownStudio.length ? ownStudio : base;

  const popular = rated.filter((t) => t.members >= BEST_RATED_MIN_MEMBERS);
  const byScore = (a, b) => b.score - a.score || byMembers(a, b);
  const bestRated = popular.slice().sort(byScore).slice(0, BEST_RATED);
  if (bestRated.length < BEST_RATED) {
    const rest = rated.filter((t) => !bestRated.includes(t)).sort(byScore);
    bestRated.push(...rest.slice(0, BEST_RATED - bestRated.length));
  }

  return {
    stats: {
      basis,
      titles_all: titles.length,
      titles_studio: count('studio'),
      titles_producer: count('producer'),
      titles_licensor: count('licensor'),
      types: countTypes(titles),
      score_avg: rated.length ? round(rated.reduce((s, t) => s + t.score, 0) / rated.length, 2) : null,
      score_count: rated.length,
      members_total: base.reduce((s, t) => s + (t.members || 0), 0),
      year_first: years.length ? Math.min(...years) : null,
      year_last: years.length ? Math.max(...years) : null,
      upcoming: base.filter((t) => isUpcoming(t, now)).length,
      truncated: Math.max(opts.navTotal || 0, allTitles.length) >= MAL_TITLES_LIMIT,
    },
    genres: genreCounts(base),
    decades: decadeCounts(base),
    top_titles: topPool.slice().sort(byMembers).slice(0, TOP_TITLES).map(toCard),
    best_rated: bestRated.map(toCard),
    adult: computeAdult(allTitles, { now }),
  };
}

/** Вектор «доля жанра среди тайтлов студии» из genres сводки. */
function genreVector(genres, baseCount) {
  const v = new Map();
  if (!baseCount) return v;
  for (const g of genres) v.set(g.id, g.count / baseCount);
  return v;
}

/** Косинусное сходство двух векторов жанров, 0..1. */
function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [id, x] of a) {
    na += x * x;
    dot += x * (b.get(id) || 0);
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

module.exports = {
  GENRE_HENTAI,
  TYPE_KEYS,
  typeKey,
  isAdultTitle,
  toCard,
  baseTitles,
  isUpcoming,
  computeAdult,
  buildSummary,
  genreVector,
  cosine,
};
