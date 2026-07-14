const assert = require('node:assert');
const { parseAnimeSearch } = require('../src/parsers/animeSearch');

const html = `
<html><body>
<div class="normal_header"><div><div><span>Pages: [1] 2 3 ... 20</span></div></div></div>
<div class="js-categories-seasonal js-block-list list">
<table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td></td><td>Title</td><td>Type</td><td>Eps.</td><td>Score</td><td>Start Date</td><td>End Date</td><td>Members</td><td>Rated</td>
  </tr>
  <tr>
    <td class="borderClass">
      <div class="picSurround"><a href="https://myanimelist.net/anime/10087/Fate_Zero"><img src="data:image/gif;base64,R0" data-src="https://cdn.myanimelist.net/r/50x70/images/anime/2/73249.webp?s=x" class="lazyload"></a></div>
    </td>
    <td class="borderClass">
      <a href="https://myanimelist.net/anime/10087/Fate_Zero"><strong>Fate/Zero</strong></a>
      <div class="pt4">With the promise of granting any wish... <a href="https://myanimelist.net/anime/10087/Fate_Zero">read more.</a></div>
    </td>
    <td class="borderClass ac">TV</td>
    <td class="borderClass ac">13</td>
    <td class="borderClass ac">8.28</td>
    <td class="borderClass ac">10-02-11</td>
    <td class="borderClass ac">12-25-11</td>
    <td class="borderClass ac">1,824,555</td>
    <td class="borderClass ac">R</td>
  </tr>
  <tr>
    <td class="borderClass"><div class="picSurround"><a href="https://myanimelist.net/anime/60999/Fate_Unknown"><img src="data:image/gif;base64,R0" data-src="https://cdn.myanimelist.net/r/50x70/images/anime/3/99999.webp?s=y" class="lazyload"></a></div></td>
    <td class="borderClass">
      <a href="https://myanimelist.net/anime/60999/Fate_Unknown"><strong>Fate Unknown</strong></a>
      <div class="pt4">Upcoming title.</div>
    </td>
    <td class="borderClass ac">ONA</td>
    <td class="borderClass ac">-</td>
    <td class="borderClass ac">N/A</td>
    <td class="borderClass ac">-</td>
    <td class="borderClass ac">-</td>
    <td class="borderClass ac">3,001</td>
    <td class="borderClass ac">Rx</td>
  </tr>
</table>
</div>
</body></html>`;

const { results, lastPage, hasNextPage } = parseAnimeSearch(html);

assert.strictEqual(results.length, 2);
assert.strictEqual(lastPage, 20);
assert.strictEqual(hasNextPage, true);

const fz = results[0];
assert.strictEqual(fz.mal_id, 10087);
assert.strictEqual(fz.title, 'Fate/Zero');
assert.strictEqual(fz.type, 'TV');
assert.strictEqual(fz.episodes, 13);
assert.strictEqual(fz.score, 8.28);
assert.strictEqual(fz.members, 1824555);
assert.strictEqual(fz.rating, 'R');
assert.strictEqual(fz.aired.from, '2011-10-02T00:00:00+00:00');
assert.strictEqual(fz.aired.to, '2011-12-25T00:00:00+00:00');
assert.strictEqual(fz.airing, false);
assert.ok(fz.synopsis.startsWith('With the promise'));
assert.ok(!fz.synopsis.includes('read more'));
assert.strictEqual(fz.images.jpg.image_url, 'https://cdn.myanimelist.net/images/anime/2/73249.jpg');

const unknown = results[1];
assert.strictEqual(unknown.episodes, null);
assert.strictEqual(unknown.score, null);
assert.strictEqual(unknown.aired.from, null);
assert.strictEqual(unknown.rating, 'Rx');

console.log('animeSearch.parser.test.js: OK');
