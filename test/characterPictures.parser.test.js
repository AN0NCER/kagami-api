const assert = require('node:assert');
const { parseCharacterPictures } = require('../src/parsers/characterPictures');

const html = `
<div id="content">
  <table><tr><td>
    <div class="picSurround">
      <a class="js-picture-gallery" rel="gallery" href="https://cdn.myanimelist.net/images/characters/16/551926.jpg"><img src="https://cdn.myanimelist.net/images/characters/16/551926.jpg"></a>
    </div>
    <div class="picSurround">
      <a class="js-picture-gallery" rel="gallery" href="https://cdn.myanimelist.net/images/characters/6/280693.jpg"><img src="https://cdn.myanimelist.net/images/characters/6/280693.jpg"></a>
    </div>
    <div class="picSurround">
      <a class="js-picture-gallery" rel="gallery" href="https://cdn.myanimelist.net/images/characters/6/280693.jpg"><img src="https://cdn.myanimelist.net/images/characters/6/280693.jpg"></a>
    </div>
  </td></tr></table>
</div>`;

const data = parseCharacterPictures(html);

assert.strictEqual(data.length, 2); // дубликат отфильтрован
assert.strictEqual(data[0].jpg.image_url, 'https://cdn.myanimelist.net/images/characters/16/551926.jpg');
assert.strictEqual(data[0].webp.image_url, 'https://cdn.myanimelist.net/images/characters/16/551926.webp');

console.log('characterPictures.parser.test.js: OK');
