const cheerio = require('cheerio');
const { parseImageQuality, idFromUrl, imageSrc, commonImages } = require('../mal/utils');

/**
 * Парсит результаты поиска MAL (anime.php?q=...&c[]=a...&c[]=g)
 * в формат ответа Jikan v4 /anime?q=...
 * Колонки: img | title+synopsis | type | eps | score | start | end | members | rated
 */
function parseAnimeSearch(html) {
  const $ = cheerio.load(html);
  const results = [];

  const rows = $('div.js-categories-seasonal table tr');
  rows.each((i, tr) => {
    if (i === 0) return; // заголовок таблицы

    const $tr = $(tr);
    const tds = $tr.children('td');
    if (tds.length < 5) return;

    const link = tds.eq(1).find('a').filter((_, a) => !!$(a).attr('href')).first();
    const href = link.attr('href');
    if (!href || !/\/anime\//.test(href)) return;

    const title = clean(link.find('strong').first().text()) || clean(link.text());
    const image = parseImageQuality(imageSrc(tds.eq(0).find('img').first()));

    // Синопсис: div.pt4 без дочерних элементов (там ссылка "read more.")
    const synClone = tds.eq(1).find('div.pt4').first().clone();
    synClone.children().remove();
    const synopsis = clean(synClone.text()).replace(/\.{3}$/, '...') || null;

    const type = nullIfDash(clean(tds.eq(2).text()));
    const episodes = intOrNull(clean(tds.eq(3).text()));
    const scoreText = clean(tds.eq(4).text());
    const score = /^\d/.test(scoreText) ? Number.parseFloat(scoreText) : null;

    const startDate = parseMDY(clean(tds.eq(5).text()));
    const endDate = parseMDY(clean(tds.eq(6).text()));
    const members = intOrNull(clean(tds.eq(7).text()));
    const rating = nullIfDash(clean(tds.eq(8).text()));

    results.push({
      mal_id: idFromUrl(href),
      url: href.split('?')[0],
      images: commonImages(image),
      title,
      titles: [{ type: 'Default', title }],
      type,
      episodes,
      score,
      members,
      rating,
      synopsis,
      airing: computeAiring(episodes, startDate, endDate),
      aired: {
        from: toIso(startDate),
        to: toIso(endDate),
        prop: {
          from: startDate || { day: null, month: null, year: null },
          to: endDate || { day: null, month: null, year: null },
        },
        string: null,
      },
    });
  });

  return {
    results,
    lastPage: parseLastPage($),
    hasNextPage: parseHasNextPage($),
  };
}

function parseLastPage($) {
  const span = $('div.normal_header div div span').first();
  if (!span.length) return 1;
  const tokens = clean(span.text()).split(' ');
  const last = tokens[tokens.length - 1].replace(/[[\]]/g, '');
  return Number.parseInt(last, 10) || 1;
}

function parseHasNextPage($) {
  const span = $('div.normal_header div div span').first();
  if (!span.length) return false;
  return /\[\d+\]\s*\d+/.test(clean(span.text()));
}

/** "04-08-12" (MM-DD-YY) -> {day, month, year} */
function parseMDY(str) {
  if (!str || str === '-') return null;
  const m = str.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yy = Number.parseInt(m[3], 10);
  const year = yy < 70 ? 2000 + yy : 1900 + yy;
  const month = Number.parseInt(m[1], 10) || null;
  const day = Number.parseInt(m[2], 10) || null;
  return { day, month, year };
}

function toIso(prop) {
  if (!prop || !prop.year) return null;
  const mm = String(prop.month || 1).padStart(2, '0');
  const dd = String(prop.day || 1).padStart(2, '0');
  return `${prop.year}-${mm}-${dd}T00:00:00+00:00`;
}

function computeAiring(episodes, start, end) {
  if (episodes === 1) return false;
  if (!start) return false;
  if (!end) return true;
  const now = new Date();
  const s = new Date(toIso(start));
  const e = new Date(toIso(end));
  return s <= now && now <= e;
}

function intOrNull(str) {
  if (!str || str === '-') return null;
  const digits = str.replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

function nullIfDash(str) {
  return !str || str === '-' ? null : str;
}

function clean(s) {
  if (s == null) return '';
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parseAnimeSearch };
