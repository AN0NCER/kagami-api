const cheerio = require('cheerio');
const { idFromUrl } = require('../mal/utils');
const { parseProducerHeader, parseEstablished, labelValue, clean } = require('./producers');

const TYPES = {
  1: 'TV', 2: 'OVA', 3: 'Movie', 4: 'Special', 5: 'ONA',
  6: 'Music', 7: 'CM', 8: 'PV', 9: 'TV Special',
};

/**
 * Парсит страницу студии (https://myanimelist.net/anime/producer/:id):
 * шапка, ссылки и все тайтлы студии в компактном виде.
 * Агрегаты здесь не считаются — они выводятся из titles отдельно.
 */
function parseProducerPage(html) {
  const $ = cheerio.load(html);
  const head = parseProducerHeader($);

  const byType = (type) => (head.titles.find((t) => t.type === type) || {}).title || null;

  return {
    mal_id: head.mal_id,
    url: head.url,
    name: byType('Default'),
    name_japanese: byType('Japanese'),
    synonyms: head.titles.filter((t) => t.type === 'Synonym').map((t) => t.title),
    logo: head.images.jpg.image_url,
    established: head.established,
    established_precision: parseEstablished(labelValue($, 'Established:')).precision,
    favorites: head.favorites,
    about: head.about,
    links: parseLinks($),
    nav_total: head.count,
    titles: parseTitles($),
  };
}

/** Блоки «Available At» (сайт, соцсети) и «Resources» (справочные ссылки). */
function parseLinks($) {
  const links = [];
  const seen = new Set();
  const add = (type, a) => {
    const url = ($(a).attr('href') || '').trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ type, url, label: clean($(a).text()) || null });
  };

  $('.user-profile-sns a[href]').each((_, a) => add('official', a));

  $('h2').each((_, h) => {
    if (clean($(h).text()) !== 'Resources') return;
    $(h).next().find('a[href]').each((__, a) => add('resource', a));
  });

  return links;
}

function parseTitles($) {
  const out = [];
  const seen = new Set();

  $('div.js-seasonal-anime').each((_, card) => {
    const $c = $(card);
    const link = $c.find('div.title a').first();
    const malId = idFromUrl(link.attr('href'));
    if (!malId || seen.has(malId)) return;
    seen.add(malId);

    const typeId = typeFromClasses($c.attr('class') || '');

    out.push({
      mal_id: malId,
      title: clean(link.text()) || clean($c.find('span.js-title').text()),
      role: roleOf(clean($c.find('div.category').first().text())),
      score: scoreOf(clean($c.find('div.stars').first().text())),
      members: intOf($c.find('span.js-members').first().text() || $c.find('div.users').first().text()),
      start_date: dateOf(clean($c.find('span.js-start_date').first().text())),
      type_id: typeId,
      type: TYPES[typeId] || null,
      r18: /\bjs-r18\b/.test($c.attr('class') || ''),
      genres: ($c.attr('data-genre') || '')
        .split(',')
        .map((g) => Number.parseInt(g, 10))
        .filter((g) => Number.isInteger(g) && g > 0),
    });
  });

  return out;
}

/** Класс js-anime-type-N (N = 0..9); js-anime-type-all пропускается. */
function typeFromClasses(cls) {
  const m = cls.match(/js-anime-type-(\d+)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

function roleOf(text) {
  const t = text.toLowerCase();
  return t === 'studio' || t === 'producer' || t === 'licensor' ? t : null;
}

/** "8.03" -> 8.03; "N/A" -> null */
function scoreOf(text) {
  return /^\d/.test(text) ? Number.parseFloat(text) : null;
}

function intOf(text) {
  const digits = String(text || '').replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

/** "20021003" -> {year, month, day}; "20270000" -> месяц и день null; пусто/0 -> null */
function dateOf(text) {
  const m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  if (!year) return null;
  return {
    year,
    month: Number.parseInt(m[2], 10) || null,
    day: Number.parseInt(m[3], 10) || null,
  };
}

module.exports = { parseProducerPage };
