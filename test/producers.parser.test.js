const assert = require('node:assert');
const { parseProducersList, parseProducerFull } = require('../src/parsers/producers');

const listHtml = `
<html><body><div id="content">
<div class="genre-list al">
  <a href="/anime/producer/18/Toei_Animation" class="genre-name-link">Toei Animation (812)</a>
</div>
<div class="genre-list al">
  <a href="/anime/producer/314/White_Fox" class="genre-name-link">White Fox (56)</a>
</div>
<div class="genre-list al">
  <a href="/anime/producer/314/White_Fox" class="genre-name-link">White Fox (56)</a>
</div>
</div></body></html>`;

const list = parseProducersList(listHtml);
assert.strictEqual(list.length, 2); // дубликат отфильтрован
assert.strictEqual(list[0].mal_id, 18);
assert.strictEqual(list[0].titles[0].title, 'Toei Animation');
assert.strictEqual(list[0].count, 812);
assert.strictEqual(list[0].url, 'https://myanimelist.net/anime/producer/18/Toei_Animation');

const fullHtml = `
<html><head>
<meta property="og:url" content="https://myanimelist.net/anime/producer/314/White_Fox">
</head><body>
<div id="contentWrapper">
<h1 class="title-name">White Fox</h1>
<div id="content">
<div class="content-left">
  <div class="logo"><img data-src="https://cdn.myanimelist.net/r/84x124/images/company/1000/White_Fox.png?s=q" class="lazyload"></div>
  <div class="spaceit_pad"><span class="dark_text">Japanese:</span> ホワイトフォックス</div>
  <div class="spaceit_pad"><span class="dark_text">Established:</span> Apr 1, 2007</div>
  <div class="spaceit_pad"><span class="dark_text">Member Favorites:</span> 12,345</div>
  <div class="spaceit_pad"><span>White Fox is a Japanese animation studio.<br><br>Founded by Gaku Iwasa.</span></div>
</div>
<div class="content-right">
  <div class="navi-seasonal"><div><ul><li><a href="#">All Anime (56)</a></li></ul></div></div>
</div>
</div>
</div>
</body></html>`;

const full = parseProducerFull(fullHtml);
assert.strictEqual(full.mal_id, 314);
assert.strictEqual(full.titles[0].title, 'White Fox');
assert.strictEqual(full.titles[1].title, 'ホワイトフォックス');
assert.strictEqual(full.established, '2007-04-01T00:00:00+00:00');
assert.strictEqual(full.favorites, 12345);
assert.strictEqual(full.count, 56);
assert.ok(full.about.startsWith('White Fox is a Japanese animation studio.'));
assert.ok(full.about.includes('\n\nFounded by Gaku Iwasa.'));
assert.strictEqual(full.images.jpg.image_url, 'https://cdn.myanimelist.net/images/company/1000/White_Fox.png');

console.log('producers.parser.test.js: OK');
