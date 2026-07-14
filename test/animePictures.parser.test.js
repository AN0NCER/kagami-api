const assert = require('node:assert');
const { parseAnimePictures } = require('../src/parsers/animePictures');

const html = `
<div id="content">
  <div class="picSurround"><a class="js-picture-gallery" rel="gallery" href="https://cdn.myanimelist.net/images/anime/1522/128039l.jpg"><img src="https://cdn.myanimelist.net/images/anime/1522/128039.jpg"></a></div>
  <div class="picSurround"><a class="js-picture-gallery" rel="gallery" href="https://cdn.myanimelist.net/images/anime/11/79410.jpg"><img src="https://cdn.myanimelist.net/images/anime/11/79410.jpg"></a></div>
  <div class="picSurround"><a class="js-picture-gallery" rel="gallery" href="https://cdn.myanimelist.net/images/anime/11/79410.jpg"><img src="https://cdn.myanimelist.net/images/anime/11/79410.jpg"></a></div>
</div>`;

const data = parseAnimePictures(html);

assert.strictEqual(data.length, 2); // дубликат отфильтрован
assert.strictEqual(data[0].jpg.image_url, 'https://cdn.myanimelist.net/images/anime/1522/128039.jpg');
assert.strictEqual(data[0].jpg.small_image_url, 'https://cdn.myanimelist.net/images/anime/1522/128039t.jpg');
assert.strictEqual(data[0].jpg.large_image_url, 'https://cdn.myanimelist.net/images/anime/1522/128039l.jpg');
assert.strictEqual(data[0].webp.image_url, 'https://cdn.myanimelist.net/images/anime/1522/128039.webp');
assert.strictEqual(data[1].jpg.image_url, 'https://cdn.myanimelist.net/images/anime/11/79410.jpg');

console.log('animePictures.parser.test.js: OK');
