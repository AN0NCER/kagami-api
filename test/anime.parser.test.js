const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseAnimeFull } = require('../src/parsers/anime');

const html = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'anime_31240.html'),
  'utf-8'
);

const d = parseAnimeFull(html);

assert.strictEqual(d.mal_id, 31240);
assert.strictEqual(d.url, 'https://myanimelist.net/anime/31240/Re_Zero_kara_Hajimeru_Isekai_Seikatsu');
assert.strictEqual(d.title, 'Re:Zero kara Hajimeru Isekai Seikatsu');
assert.strictEqual(d.title_english, 'Re:ZERO -Starting Life in Another World-');
assert.strictEqual(d.title_japanese, 'Re:ゼロから始める異世界生活');
assert.deepStrictEqual(d.title_synonyms, [
  'Re: Life in a different world from zero',
  'ReZero',
]);
assert.strictEqual(d.titles.length, 5);
assert.deepStrictEqual(d.titles[0], { type: 'Default', title: 'Re:Zero kara Hajimeru Isekai Seikatsu' });

assert.strictEqual(d.type, 'TV');
assert.strictEqual(d.source, 'Light novel');
assert.strictEqual(d.episodes, 25);
assert.strictEqual(d.status, 'Finished Airing');
assert.strictEqual(d.airing, false);

// aired
assert.strictEqual(d.aired.from, '2016-04-04T00:00:00+00:00');
assert.strictEqual(d.aired.to, '2016-09-19T00:00:00+00:00');
assert.deepStrictEqual(d.aired.prop.from, { day: 4, month: 4, year: 2016 });
assert.strictEqual(d.aired.string, 'Apr 4, 2016 to Sep 19, 2016');

assert.strictEqual(d.duration, '25 min per ep');
assert.strictEqual(d.rating, 'R - 17+ (violence & profanity)');
assert.strictEqual(d.score, 8.24);
assert.strictEqual(d.scored_by, 1943904);
assert.strictEqual(d.rank, 59);
assert.strictEqual(d.popularity, 12);
assert.strictEqual(d.members, 2529844);
assert.strictEqual(d.favorites, 62993);

assert.ok(d.synopsis.startsWith('When Subaru Natsuki leaves the convenience store'));
assert.ok(d.synopsis.includes('\n\nUnaware of the involuted mysteries'));
assert.ok(d.background.startsWith('Re:Zero kara Hajimeru Isekai Seikatsu was adapted'));
assert.ok(!d.background.includes('Synopsis'));

assert.strictEqual(d.season, 'spring');
assert.strictEqual(d.year, 2016);
assert.deepStrictEqual(d.broadcast, {
  day: 'Mondays',
  time: '01:05',
  timezone: 'Asia/Tokyo',
  string: 'Mondays at 01:05 (JST)',
});

assert.deepStrictEqual(d.producers.map((p) => p.mal_id), [61, 245]);
assert.strictEqual(d.producers[0].type, 'anime');
assert.strictEqual(d.producers[0].name, 'Frontier Works');
assert.deepStrictEqual(d.licensors.map((p) => p.name), ['Crunchyroll']);
assert.deepStrictEqual(d.studios.map((p) => p.name), ['White Fox']);
assert.deepStrictEqual(d.genres.map((g) => g.name), ['Drama', 'Fantasy', 'Suspense']);
assert.strictEqual(d.genres[0].mal_id, 8);
assert.deepStrictEqual(d.themes.map((g) => g.name), ['Isekai', 'Psychological', 'Time Travel']);
assert.deepStrictEqual(d.demographics, []);
assert.deepStrictEqual(d.explicit_genres, []);

// trailer
assert.strictEqual(d.trailer.youtube_id, 'Slp2CZ_gN4A');
assert.strictEqual(d.trailer.url, 'https://www.youtube.com/watch?v=Slp2CZ_gN4A');
assert.strictEqual(d.approved, true);

// relations: 2 из плиток + 1 из таблицы
const relNames = d.relations.map((r) => r.relation);
assert.deepStrictEqual(relNames, ['Adaptation', 'Sequel', 'Side story']);
assert.strictEqual(d.relations[0].entry[0].mal_id, 74697);
assert.strictEqual(d.relations[0].entry[0].type, 'manga');
assert.strictEqual(d.relations[2].entry.length, 2);

// themes (songs)
assert.strictEqual(d.theme.openings.length, 2);
assert.ok(d.theme.openings[0].includes('"Redo" by Konomi Suzuki'));
assert.strictEqual(d.theme.endings.length, 2);

// external / streaming
assert.deepStrictEqual(d.external.map((e) => e.name), ['Official Site', 'Wikipedia']);
assert.deepStrictEqual(d.streaming.map((s) => s.name), ['Crunchyroll', 'HIDIVE']);

// images
assert.strictEqual(d.images.jpg.image_url, 'https://cdn.myanimelist.net/images/anime/1522/128039.jpg');
assert.strictEqual(d.images.webp.large_image_url, 'https://cdn.myanimelist.net/images/anime/1522/128039l.webp');

console.log('anime.parser.test.js: OK');
