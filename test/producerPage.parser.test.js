const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseProducerPage } = require('../src/parsers/producerPage');

const load = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

// Обычная студия: есть роли Studio и Producer, японское название, синонимы, ссылки
const pierrot = parseProducerPage(load('producer_1.html'));
assert.strictEqual(pierrot.mal_id, 1);
assert.strictEqual(pierrot.name, 'Studio Pierrot');
assert.strictEqual(pierrot.name_japanese, 'スタジオぴえろ');
assert.deepStrictEqual(pierrot.synonyms, ['Pierrot']);
assert.strictEqual(pierrot.favorites, 6607);
assert.strictEqual(pierrot.nav_total, 335);
// "May, 1979": месяц без дня
assert.strictEqual(pierrot.established, '1979-05-01T00:00:00+00:00');
assert.strictEqual(pierrot.established_precision, 'month');
assert.ok(pierrot.logo.startsWith('https://cdn.myanimelist.net/'));
assert.ok(!pierrot.logo.includes('?'));

const official = pierrot.links.filter((l) => l.type === 'official');
const resource = pierrot.links.filter((l) => l.type === 'resource');
assert.strictEqual(official[0].url, 'http://pierrot.jp/'); // без \r и пробелов
assert.strictEqual(official[0].label, 'pierrot.jp');
assert.ok(resource.some((l) => l.label === 'ja.wikipedia.org'));

const naruto = pierrot.titles.find((t) => t.mal_id === 20);
assert.deepStrictEqual(naruto, {
  mal_id: 20,
  title: 'Naruto',
  role: 'studio',
  score: 8.03,
  members: 3179221,
  start_date: { year: 2002, month: 10, day: 3 },
  type_id: 1,
  type: 'TV',
  r18: false,
  genres: [1, 2, 10, 17, 27],
});

assert.ok(pierrot.titles.some((t) => t.role === 'producer'), 'есть роль producer');
assert.ok(pierrot.titles.some((t) => t.score === null), 'N/A -> null');
assert.ok(pierrot.titles.some((t) => t.type === 'Movie'));
assert.ok(
  pierrot.titles.some((t) => t.start_date && t.start_date.month === null),
  'неполная дата: месяц и день null'
);
assert.ok(pierrot.titles.every((t) => t.genres.every(Number.isInteger)));
assert.ok(pierrot.titles.every((t) => !t.genres.includes(12)));

// Студия с одними Producer и жанром Hentai, без синонимов, основана в году
const pink = parseProducerPage(load('producer_45.html'));
assert.strictEqual(pink.mal_id, 45);
assert.strictEqual(pink.name, 'Pink Pineapple');
assert.deepStrictEqual(pink.synonyms, []);
assert.strictEqual(pink.established, '1994-01-01T00:00:00+00:00');
assert.strictEqual(pink.established_precision, 'year');
assert.ok(pink.titles.every((t) => t.role === 'producer'));
assert.ok(pink.titles.some((t) => t.genres.includes(12) && t.r18));
assert.ok(pink.titles.some((t) => !t.genres.includes(12) && !t.r18));
assert.ok(pink.titles.some((t) => t.score === null));

console.log('producerPage.parser.test.js: OK');
