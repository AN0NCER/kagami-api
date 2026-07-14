const cheerio = require('cheerio');
const { parseImageQuality, imageSrc, commonImages } = require('../mal/utils');

/**
 * Парсит страницу картинок аниме (https://myanimelist.net/anime/:id/_/pics)
 * в формат ответа Jikan v4 /anime/:id/pictures.
 * Формат элемента: {jpg: {image_url, small_image_url, large_image_url}, webp: {...}}
 */
function parseAnimePictures(html) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();

  $('a.js-picture-gallery').each((_, a) => {
    const $a = $(a);
    let url = $a.attr('href');
    if (!url || !/^https?:/.test(url)) {
      url = parseImageQuality(imageSrc($a.find('img').first()));
    }
    if (!url) return;
    // Ссылки галереи часто ведут на большую версию (…123l.jpg) —
    // срезаем суффикс l/t до базового имени, иначе получим …ll.jpg (404)
    url = url.split('?')[0].replace(/(\d)[lt]\.(jpe?g|png|webp)$/i, '$1.$2');
    if (seen.has(url)) return;
    seen.add(url);

    out.push(commonImages(url));
  });

  return out;
}

module.exports = { parseAnimePictures };
