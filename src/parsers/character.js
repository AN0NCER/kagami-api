const cheerio = require('cheerio');
const {
  parseImageQuality,
  idFromUrl,
  imageSrc,
  characterImages,
  commonImages,
  personImages,
} = require('../mal/utils');

/**
 * Парсит страницу персонажа MAL (https://myanimelist.net/character/:id)
 * в формат ответа Jikan v4 /characters/:id/full.
 * Селекторы портированы с jikan-me/jikan (CharacterParser.php).
 *
 * @param {string} html
 * @returns {object} data
 */
function parseCharacterFull(html) {
  const $ = cheerio.load(html);

  const url = $('meta[property="og:url"]').attr('content') || null;
  const name = ($('meta[property="og:title"]').attr('content') || '').trim() || null;
  const image = $('meta[property="og:image"]').attr('content') || null;
  const malId = idFromUrl(url);

  // Две колонки макета: первая tr внешней таблицы внутри #content
  const layoutTds = $('#content table').first().find('tr').first().children('td');
  const leftTd = layoutTds.eq(0);
  const rightTd = layoutTds.eq(1);

  return {
    mal_id: malId,
    url,
    images: characterImages(image),
    name,
    name_kanji: parseKanji($, rightTd),
    nicknames: parseNicknames($),
    favorites: parseFavorites(leftTd),
    about: parseAbout(rightTd),
    anime: parseOgraphy($, leftTd, 'Animeography', 'anime'),
    manga: parseOgraphy($, leftTd, 'Mangaography', 'manga'),
    voices: parseVoices($, rightTd),
  };
}

/** Кандзи: <h2 class="normal_header">Emilia <span><small>(エミリア)</small></span></h2> */
function parseKanji($, rightTd) {
  let el = $('h2.normal_header span small').first();
  if (!el.length) el = rightTd.find('h2 small').first();
  if (el.length) {
    const kanji = el.text().replace(/[()]/g, '').trim();
    if (kanji) return kanji;
  }
  // Фолбэк: скобки в тексте заголовка
  const h2 = rightTd.find('h2').first().text();
  const m = h2.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

/** Никнеймы: в <h1> в кавычках — Emilia "Satella, Lia, ..." */
function parseNicknames($) {
  const h1 = $('h1').first().text();
  const m = h1.match(/"(.+)"/);
  if (!m) return [];
  return m[1]
    .split(', ')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Member Favorites: 24,445" — текстовые узлы левой колонки. */
function parseFavorites(leftTd) {
  const clone = leftTd.clone();
  clone.children().remove();
  const m = clone.text().match(/Member Favorites:\s*([\d,]+)/i) || [null, clone.text()];
  const digits = String(m[1] || '').replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

/** Биография: текстовые узлы правой колонки, <br> -> \n. */
function parseAbout(rightTd) {
  const BR = '@@__BR__@@'; // маркер <br>, чтобы отличать реальные переносы от переносов в исходнике HTML
  const clone = rightTd.clone();
  clone.find('br').replaceWith(BR);
  clone.children().remove(); // убирает h1/h2/div/table, остаётся голый текст

  const about = clone
    .text()
    .replace(/ /g, ' ')
    .split(BR)
    .map((seg) => seg.replace(/\s+/g, ' ').trim()) // HTML-пробелы -> один пробел
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // максимум одна пустая строка подряд
    .trim();

  if (!about || /No biography written/i.test(about)) return null;
  return about;
}

/** Animeography / Mangaography — таблица после соответствующего заголовка. */
function parseOgraphy($, leftTd, header, key) {
  const div = leftTd
    .find('div')
    .filter((_, el) => $(el).text().trim() === header)
    .first();
  if (!div.length) return [];

  const table = div.nextAll('table').first();
  const entries = [];

  table.find('tr').each((_, tr) => {
    const $tr = $(tr);
    const link = $tr
      .find('a')
      .filter((_, a) => $(a).find('img').length === 0 && !!$(a).attr('href'))
      .filter((_, a) => idFromUrl($(a).attr('href')) !== null)
      .first();
    if (!link.length) return;

    const href = link.attr('href');
    const img = imageSrc($tr.find('img').first());

    entries.push({
      role: $tr.find('small').first().text().trim() || null,
      [key]: {
        mal_id: idFromUrl(href),
        url: href,
        images: commonImages(parseImageQuality(img)),
        title: link.text().trim(),
      },
    });
  });

  return entries;
}

/** Сэйю: таблицы после заголовка "Voice Actors" в правой колонке. */
function parseVoices($, rightTd) {
  const div = rightTd
    .find('div')
    .filter((_, el) => $(el).text().trim().includes('Voice Actors'))
    .first();
  if (!div.length) return [];

  const voices = [];

  div.nextAll('table').each((_, tableEl) => {
    $(tableEl)
      .find('tr')
      .each((_, tr) => {
        const $tr = $(tr);
        const link = $tr
          .find('a')
          .filter((_, a) => $(a).find('img').length === 0 && !!$(a).attr('href'))
          .filter((_, a) => idFromUrl($(a).attr('href')) !== null)
          .first();
        if (!link.length) return;

        const href = link.attr('href');
        const language =
          $tr.find('.js-anime-character-language').first().text().trim() ||
          $tr.find('small').first().text().trim() ||
          null;

        voices.push({
          language,
          person: {
            mal_id: idFromUrl(href),
            url: href,
            images: personImages(parseImageQuality(imageSrc($tr.find('img').first()))),
            name: link.text().trim(),
          },
        });
      });
  });

  return voices;
}

module.exports = { parseCharacterFull };
