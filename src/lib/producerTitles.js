const { ApiError } = require('../errors');
const { TYPE_KEYS, typeKey, isAdultTitle, isUpcoming, toCard } = require('./producerStats');

const ROLES = ['studio', 'producer', 'licensor', 'all'];
const ORDERS = ['members', 'score', 'start_date', 'title'];

function bad(message) {
  return new ApiError(400, 'BadRequestException', message);
}

function pick(value, allowed, name) {
  if (value === undefined || value === '') return undefined;
  const v = String(value).toLowerCase();
  if (!allowed.includes(v)) throw bad(`Invalid ${name}: expected one of ${allowed.join(', ')}`);
  return v;
}

/** Ключ сортировки; null — «нет значения», такие тайтлы всегда в конце. */
function sortValue(t, order) {
  if (order === 'members') return t.members;
  if (order === 'score') return t.score;
  if (order === 'title') return t.title.toLowerCase();
  if (!t.start_date) return null;
  const { year, month, day } = t.start_date;
  return year * 10000 + (month || 0) * 100 + (day || 0);
}

/**
 * Фильтрация и сортировка тайтлов студии для /producers/:id/anime.
 *
 * query: role (studio|producer|licensor|all), type (tv|movie|ova|ona|special|other), q,
 *        order_by (members|score|start_date|title), sort (asc|desc), status=upcoming, sfw.
 * Если роль не указана: studio, а при отсутствии у студии тайтлов этой роли — all.
 * Возвращает { role, items } — items уже карточки, без пагинации.
 */
function listTitles(titles, query = {}, now = new Date()) {
  const role = pick(query.role, ROLES, 'role')
    || (titles.some((t) => t.role === 'studio') ? 'studio' : 'all');
  const type = pick(query.type, TYPE_KEYS, 'type');
  const order = pick(query.order_by, ORDERS, 'order_by') || 'members';
  const sort = pick(query.sort, ['asc', 'desc'], 'sort') || (order === 'title' ? 'asc' : 'desc');
  const status = pick(query.status, ['upcoming'], 'status');
  const q = query.q ? String(query.q).trim().toLowerCase() : '';
  const dir = sort === 'asc' ? 1 : -1;

  const items = titles
    .filter((t) => role === 'all' || t.role === role)
    .filter((t) => !type || typeKey(t) === type)
    .filter((t) => !q || t.title.toLowerCase().includes(q))
    .filter((t) => !status || isUpcoming(t, now))
    .filter((t) => !query.sfw || !isAdultTitle(t));

  items.sort((a, b) => {
    const x = sortValue(a, order);
    const y = sortValue(b, order);
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    if (x !== y) return x < y ? -dir : dir;
    return (b.members || 0) - (a.members || 0) || a.mal_id - b.mal_id;
  });

  return { role, items: items.map(toCard) };
}

module.exports = { listTitles, ROLES, ORDERS };
