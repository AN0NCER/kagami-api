const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
// Копия страницы студии под другим id и названием (id берётся из og:url)
const variant = (name, fromId, fromSlug, toId, toSlug, fromName, toName) => fixture(name)
  .replace(`producer/${fromId}/${fromSlug}`, `producer/${toId}/${toSlug}`)
  .split(fromName).join(toName);

// Компания только с ролью licensor: копия Pierrot, где у всех тайтлов другая роль
const licensorOnly = variant('producer_1.html', 1, 'Studio_Pierrot', 4, 'Licensor_Co', 'Studio Pierrot', 'Licensor Co')
  .replace(/(<div class="category">\s*)Studio(\s*<\/div>)/g, '$1Licensor$2')
  .replace(/js-anime-category-studio/g, 'js-anime-category-licensor');

const pages = {
  '/anime/producer/1': fixture('producer_1.html'),
  '/anime/producer/2': variant('producer_1.html', 1, 'Studio_Pierrot', 2, 'Studio_Two', 'Studio Pierrot', 'Studio Two'),
  '/anime/producer/4': licensorOnly,
  '/anime/producer/45': fixture('producer_45.html'),
  '/anime/producer/3': variant('producer_45.html', 45, 'Pink_Pineapple', 3, 'Adult_Two', 'Pink Pineapple', 'Adult Two'),
  '/anime/season': '<html><head><title>Fall 2026 - Anime</title></head><body></body></html>',
};

// Общий список студий MAL; счётчики можно менять в ходе теста
const counts = { 1: 335, 2: 335, 3: 297, 4: 335, 45: 297, 7: 5, 999: 50 };
const listHtml = () => `<html><body>${Object.entries(counts)
  .map(([id, n]) => `<a class="genre-name-link" href="/anime/producer/${id}/S${id}">Studio ${id} (${n})</a>`)
  .join('')}</body></html>`;

const mal = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const body = url === '/anime/producer' ? listHtml() : pages[url];
  if (!body) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(body);
});

const DAY = 24 * 60 * 60 * 1000;

(async () => {
  await new Promise((r) => mal.listen(0, '127.0.0.1', r));
  process.env.MAL_BASE_URL = `http://127.0.0.1:${mal.address().port}`;
  process.env.DB_PATH = path.join(os.tmpdir(), `kagami-index-test-${Date.now()}.db`);
  process.env.INDEX_DELAY_MS = '0';

  const hits = require('../src/lib/producerHits');
  const { runCycle } = require('../src/lib/producerIndexer');
  const { indexedCount } = require('../src/lib/producerIndex');
  const app = require('../src/server');
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/v4`;
  const get = async (p) => {
    const res = await fetch(base + p);
    return { status: res.status, body: await res.json() };
  };
  const ids = (r) => r.body.data.map((x) => x.mal_id);

  // ---- первый обход: сначала самые востребованные студии ----
  for (let i = 0; i < 3; i++) hits.recordHit(45);
  hits.recordHit(1);

  const logs = [];
  let res = await runCycle({ log: (m) => logs.push(m) });
  assert.strictEqual(res.queued, 6, '1, 2, 3, 4, 45 и 999; студия 7 меньше порога');
  assert.deepStrictEqual(res.queue.map((q) => q.id).slice(0, 2), [45, 1], 'по востребованности');
  assert.ok(res.queue.every((q) => q.reason === 'new'));
  assert.strictEqual(res.updated, 5);
  assert.strictEqual(res.failed, 1, '999 нет на MAL');
  assert.strictEqual(indexedCount(), 5);
  assert.ok(logs.some((l) => l.includes('first: 45/new, 1/new')));

  // повторный проход: все свежие, остаётся только неудавшаяся студия
  res = await runCycle();
  assert.deepStrictEqual(res.queue, [{ id: 999, reason: 'new' }]);

  // ---- каталог по индексу ----
  let r = await get('/producers?order_by=members');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.pagination.items.total, 4);
  assert.strictEqual(r.body.meta.indexed, 5);
  assert.deepStrictEqual(ids(r).slice(0, 2).sort(), [1, 2], 'мейнстрим по участникам выше хентай-студий');
  const first = r.body.data[0];
  assert.ok(first.stats.members_total > 0 && first.titles.length >= 2 && first.indexed === true);
  assert.strictEqual(first.established_precision, 'month');

  assert.deepStrictEqual(ids(await get('/producers?order_by=members&sort=asc')).slice(-2).sort(), [1, 2]);
  assert.deepStrictEqual(ids(await get('/producers?order_by=name')), [3, 45, 2, 1].sort(
    (a, b) => ({ 1: 'Studio Pierrot', 2: 'Studio Two', 3: 'Adult Two', 45: 'Pink Pineapple' }[a])
      .localeCompare({ 1: 'Studio Pierrot', 2: 'Studio Two', 3: 'Adult Two', 45: 'Pink Pineapple' }[b])
  ));

  // компания без собственных тайтлов (только licensor) в каталоге по умолчанию скрыта
  assert.ok(!ids(r).includes(4));
  assert.ok(r.body.data.every((s) => s.is_studio === true));
  r = await get('/producers?order_by=members&role=studio');
  assert.strictEqual(r.body.pagination.items.total, 4);
  // role=all возвращает её после студий, даже если по участникам она впереди
  r = await get('/producers?order_by=members&role=all');
  assert.strictEqual(r.body.pagination.items.total, 5);
  assert.strictEqual(ids(r)[4], 4);
  assert.strictEqual(r.body.data[4].is_studio, false);
  assert.ok(r.body.data[4].stats.members_total > 0);
  assert.strictEqual((await get('/producers?role=nope')).status, 400);
  r = await get('/producers?order_by=members');

  // 18+: sfw скрывает студии 18+, adult=only показывает только их и главнее sfw
  r = await get('/producers?order_by=members&sfw=true');
  assert.deepStrictEqual(ids(r).sort(), [1, 2]);
  assert.ok(r.body.data.every((s) => s.adult.is_adult_studio === false));
  assert.ok(r.body.data.every((s) => s.top_titles.every((t) => !t.adult)));
  r = await get('/producers?adult=only');
  assert.deepStrictEqual(ids(r).sort((a, b) => a - b), [3, 45]);
  assert.ok(r.body.data.every((s) => s.adult.level === 'mostly' || s.adult.level === 'exclusive'));
  r = await get('/producers?adult=only&sfw=true');
  assert.deepStrictEqual(ids(r).sort((a, b) => a - b), [3, 45]);
  r = await get('/producers?adult=exclude');
  assert.deepStrictEqual(ids(r).sort(), [1, 2]);

  // поиск по названию, в том числе по японскому
  assert.deepStrictEqual(ids(await get('/producers?q=studio%20pierrot&order_by=name')), [1]);
  assert.deepStrictEqual(ids(await get('/producers?q=STUDIO%20TWO&order_by=name')), [2]);
  // японское название и синонимы тоже в поиске (у копии они те же, что у Pierrot)
  assert.deepStrictEqual(ids(await get('/producers?q=ぴえろ&order_by=name')).sort(), [1, 2]);
  // эпоха основания: Pierrot — 1979, Pink Pineapple — 1994
  assert.deepStrictEqual(ids(await get('/producers?founded_to=1985')).sort(), [1, 2]);
  assert.deepStrictEqual(ids(await get('/producers?founded_from=1990')).sort((a, b) => a - b), [3, 45]);
  assert.strictEqual((await get('/producers?order_by=established&sort=asc')).body.data[0].established.slice(0, 4), '1979');
  // пагинация
  r = await get('/producers?order_by=members&limit=3&page=2');
  assert.strictEqual(r.body.data.length, 1);
  assert.strictEqual(r.body.pagination.has_next_page, false);
  // неверные параметры
  assert.strictEqual((await get('/producers?order_by=nope')).status, 400);
  assert.strictEqual((await get('/producers?founded_from=abc')).status, 400);
  assert.strictEqual((await get('/producers?adult=maybe')).status, 400);

  // обычный список MAL: у студий из индекса есть цифры
  r = await get('/producers');
  assert.strictEqual(r.body.pagination.items.total, 7);
  const byId = Object.fromEntries(r.body.data.map((s) => [s.mal_id, s]));
  assert.strictEqual(byId[1].indexed, true);
  assert.strictEqual(byId[1].is_studio, true);
  assert.strictEqual(byId[4].is_studio, false);
  assert.strictEqual(byId[1].count, 335);
  assert.ok(byId[1].stats && byId[1].adult);
  assert.strictEqual(byId[7].indexed, false);
  assert.strictEqual(byId[999].stats, undefined);

  // ---- похожие студии ----
  r = await get('/producers/1/similar');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(ids(r), [2], 'у обычной студии — только обычные, без себя');
  assert.strictEqual(r.body.data[0].similarity, 1);
  assert.ok(r.body.data[0].genres.length > 0);
  assert.ok(!ids(await get('/producers/4/similar')).includes(4));
  r = await get('/producers/45/similar');
  assert.deepStrictEqual(ids(r), [3], 'у студии 18+ — только 18+');
  assert.strictEqual((await get('/producers/1/similar?limit=0')).body.data.length, 1);

  // ---- востребованность: сохраняется в БД и влияет на порядок обновления ----
  hits.flush();
  const scores = hits.getScores();
  assert.ok(scores.get(45) >= 3, 'запросы записаны');
  for (let i = 0; i < 20; i++) hits.recordHit(3);

  // через 8 дней всё пора обновлять; первой идёт самая востребованная студия
  res = await runCycle({ now: Date.now() + 8 * DAY });
  assert.strictEqual(res.queue[0].id, 3);
  assert.strictEqual(res.queue[0].reason, 'scheduled');
  assert.strictEqual(res.updated, 5);

  // изменилось число тайтлов в общем списке -> changed
  counts[2] = 336;
  res = await runCycle({ now: Date.now() + 9 * DAY });
  assert.strictEqual(res.queue.find((q) => q.id === 2).reason, 'changed');

  server.close();
  mal.close();
  console.log('producerIndex.routes.test.js: OK');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
