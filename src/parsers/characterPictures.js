const cheerio = require('cheerio');
const { parseImageQuality, imageSrc } = require('../mal/utils');

/**
 * Парсит страницу картинок персонажа (https://myanimelist.net/character/:id/_/pictures)
 * в формат ответа Jikan v4 /characters/:id/pictures.
 */
function parseCharacterPictures(html) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();

  $('a.js-picture-gallery').each((_, a) => {
    const $a = $(a);
    let url = $a.attr('href');
    if (!url || !/^https?:/.test(url)) {
      url = parseImageQuality(imageSrc($a.find('img').first()));
    }
    if (!url || seen.has(url)) return;
    seen.add(url);

    const jpg = url.replace(/\.webp$/i, '.jpg');
    const webp = jpg.replace(/\.(jpe?g|png)$/i, '.webp');
    out.push({ jpg: { image_url: jpg }, webp: { image_url: webp } });
  });

  return out;
}

module.exports = { parseCharacterPictures };
