const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseAnimeCharacters } = require('../src/parsers/animeCharacters');

const html = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'anime_31240_characters.html'),
  'utf-8'
);

const data = parseAnimeCharacters(html);

assert.strictEqual(data.length, 2);

const emilia = data[0];
assert.strictEqual(emilia.character.mal_id, 118737);
assert.strictEqual(emilia.character.name, 'Emilia');
assert.strictEqual(emilia.character.url, 'https://myanimelist.net/character/118737/Emilia');
assert.strictEqual(
  emilia.character.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/characters/16/551926.jpg'
);
assert.strictEqual(
  emilia.character.images.webp.image_url,
  'https://cdn.myanimelist.net/images/characters/16/551926.webp'
);
assert.strictEqual(emilia.role, 'Main');
assert.strictEqual(emilia.favorites, 24445);
assert.strictEqual(emilia.voice_actors.length, 2);
assert.strictEqual(emilia.voice_actors[0].language, 'Japanese');
assert.strictEqual(emilia.voice_actors[0].person.mal_id, 34785);
assert.strictEqual(emilia.voice_actors[0].person.name, 'Takahashi, Rie');
assert.strictEqual(
  emilia.voice_actors[0].person.images.jpg.image_url,
  'https://cdn.myanimelist.net/images/voiceactors/3/86541.jpg'
);
assert.strictEqual(emilia.voice_actors[1].language, 'English');

const puck = data[1];
assert.strictEqual(puck.character.mal_id, 118739);
assert.strictEqual(puck.character.name, 'Puck');
assert.strictEqual(puck.role, 'Supporting');
assert.strictEqual(puck.favorites, 0);
assert.deepStrictEqual(puck.voice_actors, []);

console.log('animeCharacters.parser.test.js: OK');
