const cheerio = require('cheerio');
const {
  parseImageQuality,
  idFromUrl,
  imageSrc,
  characterImages,
  personImages,
} = require('../mal/utils');

/**
 * Парсит страницу персонажей аниме (https://myanimelist.net/anime/:id/_/characters)
 * в формат ответа Jikan v4 /anime/:id/characters.
 * Структура: div.anime-character-container > table.js-anime-character-table
 */
function parseAnimeCharacters(html) {
  const $ = cheerio.load(html);
  const out = [];

  $('div.anime-character-container table.js-anime-character-table').each((_, tableEl) => {
    const $t = $(tableEl);

    const h3 = $t.find('h3.h3_character_name').first();
    const link = h3.closest('a');
    const href = link.attr('href');
    if (!href) return;

    const name = clean(h3.text());
    const img = parseImageQuality(imageSrc($t.find('td').first().find('img').first()));

    // role: второй div.spaceit_pad во второй колонке (первый содержит ссылку с именем)
    const infoTd = $t.children('tbody').length
      ? $t.children('tbody').children('tr').first().children('td').eq(1)
      : $t.children('tr').first().children('td').eq(1);
    let role = null;
    infoTd.children('div.spaceit_pad').each((_, div) => {
      const $div = $(div);
      if ($div.find('a').length) return;
      const text = clean($div.text());
      if (!role && text && !/Favorites/i.test(text)) role = text;
    });

    // favorites: div.js-anime-character-favorites содержит чистое число
    let favorites = 0;
    const favEl = $t.find('div.js-anime-character-favorites').first();
    if (favEl.length) {
      favorites = Number.parseInt(favEl.text().replace(/\D/g, ''), 10) || 0;
    } else {
      const favText = infoTd
        .children('div.spaceit_pad')
        .filter((_, el) => /Favorites/i.test($(el).text()))
        .first()
        .text();
      favorites = Number.parseInt(favText.replace(/\D/g, ''), 10) || 0;
    }

    // Сэйю: table.js-anime-character-va, строка = один актёр
    const voiceActors = [];
    $t.find('table.js-anime-character-va tr').each((_, tr) => {
      const $tr = $(tr);
      const personLink = $tr
        .find('a')
        .filter((_, a) => $(a).find('img').length === 0 && !!$(a).attr('href'))
        .first();
      if (!personLink.length) return;

      const pHref = personLink.attr('href');
      voiceActors.push({
        person: {
          mal_id: idFromUrl(pHref),
          url: pHref,
          images: personImages(parseImageQuality(imageSrc($tr.find('img').first()))),
          name: clean(personLink.text()),
        },
        language: clean($tr.find('.js-anime-character-language').first().text()) || null,
      });
    });

    out.push({
      character: {
        mal_id: idFromUrl(href),
        url: href,
        images: characterImages(toJpg(img)),
        name,
      },
      role,
      favorites,
      voice_actors: voiceActors,
    });
  });

  return out;
}

function toJpg(url) {
  return url ? url.replace(/\.webp$/i, '.jpg') : null;
}

function clean(s) {
  if (s == null) return '';
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parseAnimeCharacters };
