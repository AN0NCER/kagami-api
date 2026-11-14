const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

// MAL подменяется локальным сервером с фикстурами; счётчик запросов проверяет кэш
const fixtures = {
  '/anime/producer/1': 'producer_1.html',
  '/anime/producer/45': 'producer_45.html',
};
const malHits = {};
const mal = http.createServer((req, res) => {
  const file = fixtures[req.url.split('?')[0]];
  malHits[req.url] = (malHits[req.url] || 0) + 1;
  if (!file) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(path.join(__dirname, 'fixtures', file)));
});

const NOW = new Date(Date.UTC(2026, 10, 14));

(async () => {
  await new Promise((r) => mal.listen(0, '127.0.0.1', r));
  process.env.MAL_BASE_URL = `http://127.0.0.1:${mal.address().port}`;
  process.env.DB_PATH = path.join(os.tmpdir(), `kagami-routes-test-${Date.now()}.db`);

  const app = require('../src/server');
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/v4`;
  const get = async (p) => {
    const res = await fetch(base + p);
    return { status: res.status, cache: res.headers.get('x-cache'), body: await res.json() };
  };

  // ---- /producers/:id/full ----
  let r = await get('/producers/1/full');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.cache, 'MISS');
  let d = r.body.data;
  assert.strictEqual(d.mal_id, 1);
  assert.strictEqual(d.name, 'Studio Pierrot');
  assert.strictEqual(d.name_japanese, 'スタジオぴえろ');
  assert.strictEqual(d.established_precision, 'month');
  assert.strictEqual(d.stats.basis, 'studio');
  assert.strictEqual(d.adult.is_adult_studio, false);
  assert.ok(d.top_titles.length === 3 && d.best_rated.length > 0);
  assert.ok(d.fetched_at);

  r = await get('/producers/1/full');
  assert.strictEqual(r.cache, 'HIT');
  assert.strictEqual(malHits['/anime/producer/1'], 1, 'вторая выдача — из кэша');

  // sfw не требует нового похода на MAL
  r = await get('/producers/45/full');
  assert.strictEqual(r.body.data.adult.is_adult_studio, true);
  const allTitles = r.body.data.stats.titles_all;
  r = await get('/producers/45/full?sfw=true');
  assert.ok(r.body.data.stats.titles_all < allTitles);
  assert.strictEqual(r.body.data.adult.is_adult_studio, true);
  assert.strictEqual(malHits['/anime/producer/45'], 1);
  r = await get('/producers/45/full?sfw=false');
  assert.strictEqual(r.body.data.stats.titles_all, allTitles);

  r = await get('/producers/999/full');
  assert.strictEqual(r.status, 404);
  r = await get('/producers/abc/full');
  assert.strictEqual(r.status, 400);

  // ---- /producers/:id/anime ----
  r = await get('/producers/1/anime');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.meta.role, 'studio');
  assert.ok(r.body.data.every((t) => t.role === 'studio'));
  const members = r.body.data.map((t) => t.members);
  assert.deepStrictEqual(members, members.slice().sort((a, b) => b - a), 'по участникам, убывание');
  assert.strictEqual(r.body.pagination.items.total, r.body.data.length);

  r = await get('/producers/1/anime?role=all');
  assert.ok(r.body.data.some((t) => t.role === 'producer'));

  r = await get('/producers/1/anime?type=movie');
  assert.ok(r.body.data.length > 0 && r.body.data.every((t) => t.type === 'Movie'));

  r = await get('/producers/1/anime?q=NARUTO');
  assert.ok(r.body.data.length > 0 && r.body.data.every((t) => /naruto/i.test(t.title)));

  r = await get('/producers/1/anime?order_by=score');
  const scores = r.body.data.map((t) => t.score);
  const firstNull = scores.indexOf(null);
  assert.ok(firstNull === -1 || scores.slice(firstNull).every((s) => s === null), 'без оценки — в конце');
  const rated = scores.filter((s) => s !== null);
  assert.deepStrictEqual(rated, rated.slice().sort((a, b) => b - a));

  r = await get('/producers/1/anime?order_by=title');
  const titles = r.body.data.map((t) => t.title.toLowerCase());
  assert.deepStrictEqual(titles, titles.slice().sort(), 'по названию — по возрастанию');

  r = await get('/producers/1/anime?limit=2&page=2');
  assert.strictEqual(r.body.pagination.current_page, 2);
  assert.strictEqual(r.body.pagination.items.per_page, 2);
  assert.strictEqual(r.body.data.length, 2);

  r = await get('/producers/1/anime?order_by=nope');
  assert.strictEqual(r.status, 400);
  r = await get('/producers/1/anime?role=nope');
  assert.strictEqual(r.status, 400);

  // у студии без роли studio список по умолчанию — все тайтлы
  r = await get('/producers/45/anime');
  assert.strictEqual(r.body.meta.role, 'all');
  assert.ok(r.body.data.length > 0);
  assert.ok(r.body.data.some((t) => t.adult));
  r = await get('/producers/45/anime?role=studio');
  assert.strictEqual(r.body.data.length, 0, 'явно запрошенная роль не подменяется');
  r = await get('/producers/45/anime?sfw=true');
  assert.ok(r.body.data.length > 0 && r.body.data.every((t) => !t.adult));

  // ---- listTitles: анонсы ----
  const { listTitles } = require('../src/lib/producerTitles');
  const t = (o) => ({
    mal_id: 1, title: 'A', role: 'studio', score: null, members: 1, start_date: null,
    type_id: 1, type: 'TV', r18: false, genres: [], ...o,
  });
  const upcoming = listTitles([
    t({ mal_id: 1, start_date: { year: 2026, month: 12, day: 1 } }),
    t({ mal_id: 2, start_date: { year: 2020, month: 1, day: 1 } }),
    t({ mal_id: 3, score: 7, start_date: { year: 2027, month: null, day: null } }),
  ], { status: 'upcoming' }, NOW);
  assert.deepStrictEqual(upcoming.items.map((x) => x.mal_id), [1]);

  server.close();
  mal.close();
  console.log('producers.routes.test.js: OK');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
