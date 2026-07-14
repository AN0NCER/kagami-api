const assert = require('node:assert');
const { parseRecentRecommendations } = require('../src/parsers/recommendations');

const html = `
<html><body>
<div id="horiznav_nav"><div><span>[1] 2 3</span></div></div>
<div id="content">
<div class="spaceit borderClass">
  <table><tr>
    <td>
      <div class="picSurround"><a href="https://myanimelist.net/anime/31240/Re_Zero"><img data-src="https://cdn.myanimelist.net/r/50x70/images/anime/11/79410.webp?s=a" src="data:image/gif;base64,R0" class="lazyload"></a></div>
      <a href="https://myanimelist.net/anime/31240/Re_Zero"><strong>Re:Zero kara Hajimeru Isekai Seikatsu</strong></a>
    </td>
    <td>
      <div class="picSurround"><a href="https://myanimelist.net/anime/9253/Steins_Gate"><img data-src="https://cdn.myanimelist.net/r/50x70/images/anime/5/73199.webp?s=b" src="data:image/gif;base64,R0" class="lazyload"></a></div>
      <a href="https://myanimelist.net/anime/9253/Steins_Gate"><strong>Steins;Gate</strong></a>
    </td>
  </tr></table>
  <div class="recommendations-user-recs-text">Both feature time loops and desperate protagonists.</div>
  <div class="lightLink" style="float: left;">Anime rec by <a href="/profile/someuser">someuser</a> - Nov 2, 2021</div>
</div>
</div>
</body></html>`;

const { results, lastPage, hasNextPage } = parseRecentRecommendations(html);

assert.strictEqual(results.length, 1);
assert.strictEqual(lastPage, 3);
assert.strictEqual(hasNextPage, true);

const rec = results[0];
assert.strictEqual(rec.mal_id, '31240-9253');
assert.strictEqual(rec.entry.length, 2);
assert.strictEqual(rec.entry[0].mal_id, 31240);
assert.strictEqual(rec.entry[0].title, 'Re:Zero kara Hajimeru Isekai Seikatsu');
assert.strictEqual(rec.entry[1].mal_id, 9253);
assert.strictEqual(
  rec.entry[1].images.jpg.image_url,
  'https://cdn.myanimelist.net/images/anime/5/73199.jpg'
);
assert.strictEqual(rec.content, 'Both feature time loops and desperate protagonists.');
assert.strictEqual(rec.user.username, 'someuser');
assert.strictEqual(rec.user.url, 'https://myanimelist.net/profile/someuser');
assert.strictEqual(rec.date, '2021-11-02T00:00:00+00:00');

console.log('recommendations.parser.test.js: OK');
