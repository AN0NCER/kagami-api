process.env.DB_PATH = require('node:path').join(require('node:os').tmpdir(), `kagami-planner-test-${Date.now()}.db`);

const assert = require('node:assert');
const { planQueue } = require('../src/lib/producerIndexer');

const NOW = Date.UTC(2026, 10, 14);
const H = 60 * 60 * 1000;
const DAY = 24 * H;
const cfg = { minTitles: 10, hotCount: 2, hotTtl: DAY, seasonTtl: 2 * DAY, coldTtl: 7 * DAY };

const plan = (o) => planQueue({
  list: [], state: new Map(), hits: new Map(), seasonIds: new Set(), now: NOW, cfg, ...o,
});
const row = (list_count, ageMs, members_total = 0) => ({ list_count, fetched_at: NOW - ageMs, members_total });
const ids = (q) => q.map((x) => x.id);

// Студии меньше порога в очередь не попадают
assert.deepStrictEqual(plan({ list: [{ mal_id: 1, count: 9 }, { mal_id: 2, count: 10 }] }).map((x) => x.id), [2]);

// Ещё не в индексе -> new; без востребованности — по числу тайтлов
let q = plan({ list: [{ mal_id: 1, count: 20 }, { mal_id: 2, count: 300 }, { mal_id: 3, count: 50 }] });
assert.deepStrictEqual(ids(q), [2, 3, 1]);
assert.ok(q.every((x) => x.reason === 'new'));

// Самые востребованные идут первыми, даже если студия меньше
q = plan({
  list: [{ mal_id: 1, count: 20 }, { mal_id: 2, count: 300 }, { mal_id: 3, count: 50 }],
  hits: new Map([[1, 40], [3, 5]]),
});
assert.deepStrictEqual(ids(q), [1, 3, 2]);

// Изменилось число тайтлов -> changed
q = plan({ list: [{ mal_id: 1, count: 31 }], state: new Map([[1, row(30, 1 * H)]]) });
assert.deepStrictEqual(q.map((x) => x.reason), ['changed']);

// Свежая запись без изменений — не обновляется
q = plan({ list: [{ mal_id: 1, count: 30 }], state: new Map([[1, row(30, 1 * H)]]) });
assert.deepStrictEqual(q, []);

// Горячая студия (топ по востребованности) обновляется раз в сутки, остальные — раз в неделю
const list = [{ mal_id: 1, count: 30 }, { mal_id: 2, count: 30 }, { mal_id: 3, count: 30 }];
const state = new Map([[1, row(30, 30 * H)], [2, row(30, 30 * H)], [3, row(30, 30 * H)]]);
q = plan({ list, state, hits: new Map([[1, 9], [2, 4]]) });
assert.deepStrictEqual(ids(q), [1, 2], 'студия 3 вне топ-2 — ещё не пора');
assert.ok(q.every((x) => x.reason === 'scheduled'));
q = plan({ list, state: new Map([[1, row(30, 8 * DAY)], [2, row(30, 8 * DAY)], [3, row(30, 8 * DAY)]]), hits: new Map([[1, 9], [2, 4]]) });
assert.deepStrictEqual(ids(q), [1, 2, 3]);

// Сезонная студия — раз в 2 дня, даже если она не горячая
q = plan({
  list,
  state: new Map([[1, row(30, 3 * DAY)], [2, row(30, 3 * DAY)], [3, row(30, 3 * DAY)]]),
  hits: new Map([[1, 9], [2, 4]]),
  seasonIds: new Set([3]),
});
assert.deepStrictEqual(q.map((x) => [x.id, x.reason]), [[1, 'scheduled'], [2, 'scheduled'], [3, 'season']]);

// Без востребованности «горячими» считаются студии с наибольшим числом участников
q = plan({
  list,
  state: new Map([[1, row(30, 30 * H, 100)], [2, row(30, 30 * H, 900)], [3, row(30, 30 * H, 500)]]),
});
assert.deepStrictEqual(ids(q).sort(), [2, 3], 'горячие: 2 и 3');

// При равной востребованности: изменилось -> новая -> сезонная -> по расписанию
q = plan({
  list: [{ mal_id: 1, count: 30 }, { mal_id: 2, count: 30 }, { mal_id: 3, count: 30 }],
  state: new Map([[1, row(29, 1 * H)], [3, row(30, 40 * H)]]),
  hits: new Map([[1, 1], [2, 1], [3, 1]]),
  cfg: { ...cfg, hotCount: 3 },
});
assert.deepStrictEqual(q.map((x) => x.reason), ['changed', 'new', 'scheduled']);

console.log('producerIndexer.test.js: OK');
