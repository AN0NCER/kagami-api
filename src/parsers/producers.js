const cheerio = require('cheerio');
const { parseImageQuality, imageSrc } = require('../mal/utils');

function producerId(url) {
  const m = (url || '').match(/\/producer\/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

const BR = '@@__BR__@@';
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Парсит список студий/продюсеров (https://myanimelist.net/anime/producer)
 * в формат Jikan v4 /producers.
 * Элемент: <a class="genre-name-link" href=".../anime/producer/18/Toei_Animation">Toei Animation (812)</a>
 */
function parseProducersList(html) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();

  $('a.genre-name-link').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!/\/anime\/producer\/\d+/.test(href)) return;
    const malId = producerId(href);
    if (!malId || seen.has(malId)) return;
    seen.add(malId);

    const text = clean($(a).text());
    const m = text.match(/^(.*?)\s*\(([\d,]+)\)$/);
    const name = m ? m[1] : text;
    const count = m ? Number.parseInt(m[2].replace(/,/g, ''), 10) : 0;

    out.push({
      mal_id: malId,
      url: href.startsWith('http') ? href : `https://myanimelist.net${href}`,
      titles: [{ type: 'Default', title: name }],
      images: { jpg: { image_url: null } },
      favorites: null,
      established: null,
      about: null,
      count,
    });
  });

  return out;
}

/**
 * Парсит страницу студии/продюсера (https://myanimelist.net/anime/producer/:id)
 * в формат Jikan v4 /producers/:id.
 */
function parseProducerFull(html) {
  const $ = cheerio.load(html);

  const url = $('meta[property="og:url"]').attr('content') || null;
  const name = clean($('h1.title-name, .title-name').first().text()) || null;

  const titles = [];
  if (name) titles.push({ type: 'Default', title: name });
  const japanese = labelValue($, 'Japanese:');
  if (japanese) titles.push({ type: 'Japanese', title: japanese });
  const synonyms = labelValue($, 'Synonyms:');
  if (synonyms) {
    for (const s of synonyms.split(', ').map(clean).filter(Boolean)) {
      titles.push({ type: 'Synonym', title: s });
    }
  }

  // Логотип
  const logo = parseImageQuality(imageSrc($('#content div.logo img').first())) ||
    parseImageQuality(imageSrc($('.content-left .logo img, .logo img').first()));

  // Established: "Oct 1, 1972"
  const established = parseReadableDate(labelValue($, 'Established:'));

  const favText = labelValue($, 'Member Favorites:');
  const favorites = favText ? Number.parseInt(favText.replace(/\D/g, ''), 10) || null : null;

  // About: span в spaceit_pad без dark_text
  let about = null;
  const aboutEl = $('#content div.spaceit_pad > span:not(.dark_text)').first();
  if (aboutEl.length) {
    const cl = aboutEl.clone();
    cl.find('br').replaceWith(BR);
    about = cl
      .text()
      .split(BR)
      .map((seg) => seg.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || null;
  }

  // Количество тайтлов: первый пункт навигации "All Anime (812)"
  let count = 0;
  const navText = clean($('div.navi-seasonal li').first().text());
  const cm = navText.match(/\(([\d,]+)\)/);
  if (cm) count = Number.parseInt(cm[1].replace(/,/g, ''), 10);

  return {
    mal_id: producerId(url),
    url,
    titles,
    images: { jpg: { image_url: logo } },
    favorites,
    established,
    about,
    count,
  };
}

function labelValue($, label) {
  const span = $('span.dark_text')
    .filter((_, el) => clean($(el).text()) === label)
    .first();
  if (!span.length) return null;
  const parent = span.parent().clone();
  parent.find('span.dark_text').remove();
  return clean(parent.text()) || null;
}

/** "Oct 1, 1972" -> ISO */
function parseReadableDate(str) {
  if (!str) return null;
  const m = str.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) {
      return `${m[3]}-${String(month).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}T00:00:00+00:00`;
    }
  }
  const y = str.match(/^(\d{4})$/);
  if (y) return `${y[1]}-01-01T00:00:00+00:00`;
  return null;
}

function clean(s) {
  if (s == null) return '';
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parseProducersList, parseProducerFull };
