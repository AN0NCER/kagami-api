const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseSeasonPage, parseSeasonArchive } = require('../src/parsers/seasons');

const html = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'season_2026_summer.html'),
  'utf-8'
);

const { season, year, entries } = parseSeasonPage(html);

assert.strictEqual(season, 'summer');
assert.strictEqual(year, 2026);
assert.strictEqual(entries.length, 4);

const mushoku = entries[0];
assert.strictEqual(mushoku.mal_id, 59193);
assert.strictEqual(mushoku.title, 'Mushoku Tensei III: Isekai Ittara Honki Dasu');
assert.strictEqual(mushoku.type, 'TV');
assert.strictEqual(mushoku.continuing, false);
assert.strictEqual(mushoku.score, 8.9);
assert.strictEqual(mushoku.members, 262409);
assert.strictEqual(mushoku.episodes, 14);
assert.strictEqual(mushoku.duration, '23 min');
assert.strictEqual(mushoku.source, 'Light novel');
assert.strictEqual(mushoku.aired.from, '2026-07-06T00:00:00+00:00');
assert.deepStrictEqual(mushoku.aired.prop.from, { day: 6, month: 7, year: 2026 });
assert.strictEqual(mushoku.aired.string, 'Jul 6, 2026');
assert.deepStrictEqual(mushoku.genres.map((g) => g.name), ['Adventure', 'Drama', 'Fantasy']);
assert.deepStrictEqual(mushoku.explicit_genres.map((g) => g.name), ['Ecchi']);
assert.deepStrictEqual(mushoku.themes.map((g) => g.name), ['Isekai', 'Reincarnation']);
assert.deepStrictEqual(mushoku.studios.map((s) => s.name), ['Studio Bind']);
assert.strictEqual(mushoku.studios[0].mal_id, 1993);
assert.strictEqual(mushoku.synopsis, 'Third season of Mushoku Tensei: Isekai Ittara Honki Dasu.');
assert.strictEqual(mushoku.r18, false);
assert.strictEqual(
  mushoku.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/anime/1527/158340.jpg'
);

const r18 = entries[1];
assert.strictEqual(r18.r18, true);
assert.strictEqual(r18.score, null);
assert.strictEqual(r18.episodes, null);
assert.strictEqual(r18.aired.prop.from.day, null); // "20260700"
assert.strictEqual(r18.aired.prop.from.month, 7);
assert.strictEqual(
  r18.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/anime/1000/100001.jpg'
);

const onePiece = entries[2];
assert.strictEqual(onePiece.continuing, true);
assert.strictEqual(onePiece.status, 'Currently Airing');
assert.strictEqual(onePiece.airing, true);
assert.deepStrictEqual(onePiece.demographics.map((d) => d.name), ['Shounen']);

const ona = entries[3];
assert.strictEqual(ona.type, 'ONA');
assert.strictEqual(ona.mal_id, 60500);

// Архив
const archiveHtml = `
<html><body>
<table class="anime-seasonal-byseason">
  <tr>
    <td><a href="https://myanimelist.net/anime/season/2026/winter">Winter 2026</a></td>
    <td><a href="https://myanimelist.net/anime/season/2026/spring">Spring 2026</a></td>
    <td><a href="https://myanimelist.net/anime/season/2026/summer">Summer 2026</a></td>
    <td><a href="https://myanimelist.net/anime/season/2026/fall">Fall 2026</a></td>
  </tr>
  <tr>
    <td><a href="https://myanimelist.net/anime/season/2025/winter">Winter 2025</a></td>
    <td><a href="https://myanimelist.net/anime/season/2025/spring">Spring 2025</a></td>
  </tr>
</table>
</body></html>`;

const archive = parseSeasonArchive(archiveHtml);
assert.strictEqual(archive.length, 2);
assert.deepStrictEqual(archive[0], { year: 2026, seasons: ['winter', 'spring', 'summer', 'fall'] });
assert.deepStrictEqual(archive[1], { year: 2025, seasons: ['winter', 'spring'] });

console.log('seasons.parser.test.js: OK');
