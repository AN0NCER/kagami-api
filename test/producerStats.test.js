const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseProducerPage } = require('../src/parsers/producerPage');
const {
  buildSummary, computeAdult, isUpcoming, baseTitles, isStudioCompany, genreVector, cosine,
} = require('../src/lib/producerStats');

const NOW = new Date(Date.UTC(2026, 10, 14)); // 14.11.2026
const load = (name) => parseProducerPage(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

let seq = 0;
const mk = (o = {}) => ({
  mal_id: ++seq,
  title: `T${seq}`,
  role: 'studio',
  score: 7,
  members: 10000,
  start_date: { year: 2010, month: 1, day: 1 },
  type_id: 1,
  type: 'TV',
  r18: false,
  genres: [1],
  ...o,
});
const hentai = (o = {}) => mk({ genres: [12], ...o });

// ---- обычная студия (фикстура Pierrot) ----
const pierrot = load('producer_1.html');
const ps = buildSummary(pierrot.titles, { navTotal: pierrot.nav_total, now: NOW });
assert.strictEqual(ps.stats.basis, 'studio');
assert.strictEqual(ps.stats.titles_all, pierrot.titles.length);
assert.strictEqual(ps.stats.titles_producer, pierrot.titles.filter((t) => t.role === 'producer').length);
assert.strictEqual(ps.stats.truncated, false);
assert.strictEqual(ps.adult.level, 'none');
assert.strictEqual(ps.adult.is_adult_studio, false);
assert.strictEqual(ps.top_titles.length, 3);
assert.strictEqual(ps.top_titles[0].title, 'Naruto');
assert.ok(ps.top_titles.every((t) => t.role === 'studio'));
assert.ok(ps.top_titles[0].members >= ps.top_titles[1].members);
assert.ok(ps.best_rated[0].score >= ps.best_rated[1].score);
// N/A не участвует в средней оценке
assert.ok(ps.stats.score_count < ps.stats.titles_studio);

// ---- хентай-студия: все тайтлы с ролью producer ----
const pink = load('producer_45.html');
const pk = buildSummary(pink.titles, { navTotal: pink.nav_total, now: NOW });
assert.strictEqual(pk.stats.titles_studio, 0);
assert.strictEqual(pk.stats.basis, 'all', 'без тайтлов роли studio считаем по всем');
assert.ok(pk.stats.members_total > 0);
assert.strictEqual(pk.adult.is_adult_studio, true);
assert.ok(pk.top_titles.length > 0);
assert.ok(pk.top_titles.some((t) => t.adult));

// sfw убирает 18+ из цифр, но блок adult считается по полному списку
const pkSfw = buildSummary(pink.titles, { sfw: true, now: NOW });
assert.ok(pkSfw.stats.titles_all < pk.stats.titles_all);
assert.ok(pkSfw.top_titles.every((t) => !t.adult));
assert.ok(pkSfw.genres.every((g) => g.id !== 12));
assert.deepStrictEqual(pkSfw.adult, pk.adult);

// ---- пороги 18+ ----
const share = (hent, total, opts) => computeAdult(
  [...Array(hent).fill(0).map(() => hentai()), ...Array(total - hent).fill(0).map(() => mk())],
  { now: NOW, ...opts }
);
assert.strictEqual(share(0, 10).level, 'none');
assert.strictEqual(share(4, 10).level, 'partial');
assert.strictEqual(share(4, 10).is_adult_studio, false);
assert.strictEqual(share(5, 10).level, 'mostly');
assert.strictEqual(share(5, 10).is_adult_studio, true);
assert.strictEqual(share(8, 10).level, 'mostly');
assert.strictEqual(share(9, 10).level, 'exclusive');
assert.strictEqual(share(10, 10).level, 'exclusive');
assert.strictEqual(share(5, 10).hentai_share, 0.5);
assert.strictEqual(share(4, 10, { mostly: 0.3 }).level, 'mostly', 'порог настраивается');

// мало тайтлов — уровень считается, но выборка помечена
assert.strictEqual(share(2, 2).level, 'exclusive');
assert.strictEqual(share(2, 2).low_sample, true);
assert.strictEqual(share(3, 3).low_sample, false);

// пустой список не падает
const empty = buildSummary([], { now: NOW });
assert.strictEqual(empty.stats.titles_all, 0);
assert.strictEqual(empty.stats.score_avg, null);
assert.strictEqual(empty.stats.year_first, null);
assert.strictEqual(empty.adult.level, 'none');
assert.strictEqual(empty.adult.hentai_share_members, 0);
assert.strictEqual(empty.adult.hentai_share_recent, null);

// доля по участникам и за последние годы
const mixed = computeAdult([
  hentai({ members: 100, start_date: { year: 2012, month: 1, day: 1 } }),
  mk({ members: 900, start_date: { year: 2024, month: 1, day: 1 } }),
], { now: NOW });
assert.strictEqual(mixed.hentai_share, 0.5);
assert.strictEqual(mixed.hentai_share_members, 0.1);
assert.strictEqual(mixed.hentai_share_recent, 0);

// Erotica и Ecchi считаются отдельно и в долю хентая не входят
const other = computeAdult([mk({ genres: [49] }), mk({ genres: [9] }), mk({ genres: [9, 1] })], { now: NOW });
assert.strictEqual(other.hentai_titles, 0);
assert.strictEqual(other.erotica_titles, 1);
assert.strictEqual(other.ecchi_titles, 2);
assert.strictEqual(other.level, 'none');

// ---- агрегаты ----
const list = [
  mk({ score: 8, members: 5000, start_date: { year: 2001, month: 1, day: 1 }, genres: [1, 2] }),
  mk({ score: 6, members: 3000, start_date: { year: 2004, month: 1, day: 1 }, genres: [1] }),
  mk({ score: null, members: 100, start_date: null, type_id: 3, type: 'Movie', genres: [] }),
  mk({ role: 'producer', score: 9, members: 99999, start_date: { year: 1995, month: 1, day: 1 }, type_id: 2, type: 'OVA' }),
  mk({ role: 'licensor', score: 5, members: 50, type_id: 6, type: 'Music' }),
];
const agg = buildSummary(list, { now: NOW });
assert.strictEqual(agg.stats.titles_studio, 3);
assert.strictEqual(agg.stats.titles_producer, 1);
assert.strictEqual(agg.stats.titles_licensor, 1);
assert.strictEqual(agg.stats.score_avg, 7, 'среднее по тайтлам роли studio с оценкой');
assert.strictEqual(agg.stats.score_count, 2);
assert.strictEqual(agg.stats.members_total, 8100, 'producer и licensor не входят');
assert.strictEqual(agg.stats.year_first, 2001);
assert.strictEqual(agg.stats.year_last, 2004);
assert.deepStrictEqual(agg.stats.types, { tv: 2, movie: 1, ova: 1, ona: 0, special: 0, other: 1 });
assert.deepStrictEqual(agg.genres, [{ id: 1, count: 2 }, { id: 2, count: 1 }]);
assert.deepStrictEqual(agg.decades, [{ from: 2000, count: 2 }]);
assert.deepStrictEqual(agg.top_titles.map((t) => t.members), [5000, 3000, 100]);

// только licensor — не падает, считаем по всем
const lic = buildSummary([mk({ role: 'licensor' }), mk({ role: 'licensor' })], { now: NOW });
assert.strictEqual(lic.stats.basis, 'all');
assert.strictEqual(lic.stats.titles_licensor, 2);
assert.strictEqual(baseTitles([mk({ role: 'licensor' })]).list.length, 1);

// студия или только лицензиар/продюсер: у 18+ студий роль producer допустима
assert.strictEqual(lic.is_studio, false);
assert.strictEqual(agg.is_studio, true);
assert.strictEqual(buildSummary([mk({ role: 'producer' })], { now: NOW }).is_studio, false);
assert.strictEqual(isStudioCompany([mk({ role: 'producer' })], true), true);
assert.strictEqual(isStudioCompany([mk({ role: 'licensor' })], true), false);

// лучшие по оценке: тайтлы с малым числом участников идут после популярных
const best = buildSummary([
  mk({ score: 9.9, members: 10 }),
  mk({ score: 8, members: 5000 }),
  mk({ score: 7, members: 5000 }),
], { now: NOW }).best_rated;
assert.deepStrictEqual(best.map((t) => t.score), [8, 7, 9.9]);

// ---- truncated ----
const many = Array.from({ length: 1000 }, () => mk());
assert.strictEqual(buildSummary(many, { now: NOW }).stats.truncated, true);
assert.strictEqual(buildSummary(many.slice(0, 999), { now: NOW }).stats.truncated, false);
assert.strictEqual(buildSummary(many.slice(0, 5), { navTotal: 1000, now: NOW }).stats.truncated, true);

// ---- анонсы ----
const up = (start_date, score = null) => isUpcoming(mk({ start_date, score }), NOW);
assert.strictEqual(up({ year: 2026, month: 11, day: 27 }), true, 'дата впереди, оценки нет');
assert.strictEqual(up({ year: 2026, month: 11, day: 14 }), false, 'вышел сегодня');
assert.strictEqual(up({ year: 2026, month: 11, day: 27 }, 7.5), false, 'есть оценка — уже вышел');
assert.strictEqual(up({ year: 2027, month: null, day: null }), true, 'неполная дата в будущем году');
assert.strictEqual(up({ year: 2026, month: null, day: null }), true, 'год ещё не закончился');
assert.strictEqual(up({ year: 2025, month: null, day: null }), false);
assert.strictEqual(up({ year: 2026, month: 10, day: null }), false, 'месяц уже прошёл');
assert.strictEqual(up(null), false, 'даты нет — не считаем');

// ---- сходство жанров ----
const a = genreVector([{ id: 1, count: 5 }, { id: 2, count: 5 }], 10);
const same = genreVector([{ id: 1, count: 1 }, { id: 2, count: 1 }], 2);
const none = genreVector([{ id: 9, count: 3 }], 3);
assert.ok(Math.abs(cosine(a, same) - 1) < 1e-9);
assert.strictEqual(cosine(a, none), 0);
assert.strictEqual(cosine(a, new Map()), 0);
assert.strictEqual(genreVector([{ id: 1, count: 1 }], 0).size, 0);

console.log('producerStats.test.js: OK');
