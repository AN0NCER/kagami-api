const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseCharacterFull } = require('../src/parsers/character');

const html = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'character_118737.html'),
  'utf-8'
);

const data = parseCharacterFull(html);

assert.strictEqual(data.mal_id, 118737);
assert.strictEqual(data.url, 'https://myanimelist.net/character/118737/Emilia');
assert.strictEqual(data.name, 'Emilia');
assert.strictEqual(data.name_kanji, 'エミリア');
assert.deepStrictEqual(data.nicknames, [
  'Satella',
  'Lia',
  'Emily',
  'Witch of Frost',
  'Half-Devil',
  "Witch's Daughter",
]);
assert.strictEqual(data.favorites, 24445);

assert.strictEqual(
  data.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/characters/16/551926.jpg'
);
assert.strictEqual(
  data.images.webp.image_url,
  'https://cdn.myanimelist.net/images/characters/16/551926.webp'
);

assert.ok(data.about.startsWith('Birthday: September 23\nHeight: 164 cm'));
assert.ok(data.about.includes('The main female protagonist.'));
assert.ok(!data.about.includes('Voice Actors'));
assert.ok(!data.about.includes('Takahashi'));

// Animeography
assert.strictEqual(data.anime.length, 2);
assert.strictEqual(data.anime[0].role, 'Main');
assert.strictEqual(data.anime[0].anime.mal_id, 31240);
assert.strictEqual(data.anime[0].anime.title, 'Re:Zero kara Hajimeru Isekai Seikatsu');
assert.strictEqual(
  data.anime[0].anime.images.webp.image_url,
  'https://cdn.myanimelist.net/images/anime/11/79410.webp'
);
assert.strictEqual(
  data.anime[0].anime.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/anime/11/79410.jpg'
);
assert.strictEqual(data.anime[1].role, 'Supporting');

// Mangaography
assert.strictEqual(data.manga.length, 1);
assert.strictEqual(data.manga[0].manga.mal_id, 74697);
assert.strictEqual(data.manga[0].role, 'Main');

// Voices
assert.strictEqual(data.voices.length, 2);
assert.strictEqual(data.voices[0].language, 'Japanese');
assert.strictEqual(data.voices[0].person.mal_id, 34785);
assert.strictEqual(data.voices[0].person.name, 'Takahashi, Rie');
assert.strictEqual(
  data.voices[0].person.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/voiceactors/2/65500.jpg'
);
assert.strictEqual(data.voices[1].language, 'English');

console.log('parser.test.js: OK');
