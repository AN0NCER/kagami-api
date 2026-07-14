process.env.DB_PATH = require('node:path').join(
  require('node:os').tmpdir(),
  `mal-api-test-${Date.now()}.db`
);
process.env.CACHE_TTL_MS = '200'; // короткий TTL для теста

const assert = require('node:assert');
const { cached } = require('../src/cache');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return { value: calls };
  };

  // MISS: первого запроса нет в кэше
  let r = await cached('test/key', fetcher);
  assert.strictEqual(r.cache, 'MISS');
  assert.strictEqual(r.data.value, 1);

  // HIT: повтор до истечения TTL — fetcher не вызывается
  r = await cached('test/key', fetcher);
  assert.strictEqual(r.cache, 'HIT');
  assert.strictEqual(r.data.value, 1);
  assert.strictEqual(calls, 1);

  // UPDATED: после истечения TTL — обновление
  await sleep(250);
  r = await cached('test/key', fetcher);
  assert.strictEqual(r.cache, 'UPDATED');
  assert.strictEqual(r.data.value, 2);

  // STALE: TTL истёк, fetcher падает — отдаём старую копию
  await sleep(250);
  r = await cached('test/key', async () => {
    throw new Error('MAL down');
  });
  assert.strictEqual(r.cache, 'STALE');
  assert.strictEqual(r.data.value, 2);

  // Ошибка без кэша — пробрасывается
  await assert.rejects(
    cached('test/other', async () => {
      throw new Error('MAL down');
    }),
    /MAL down/
  );

  console.log('cache.test.js: OK');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
