const cheerio = require('cheerio');
const { parseImageQuality, idFromUrl, imageSrc, commonImages, malUrlFromLink } = require('../mal/utils');

/**
 * Парсит сезонную страницу MAL (https://myanimelist.net/anime/season[/:year/:season])
 * в формат ответа Jikan v4 /seasons/:year/:season.
 * Карточка: div.seasonal-anime.js-seasonal-anime (внутри секций .seasonal-anime-list
 * с заголовком .anime-header: "TV (New)", "TV (Continuing)", "ONA", "Movie", ...)
 */
function parseSeasonPage(html) {
  const $ = cheerio.load(html);

  // "Summer 2026 - Anime - MyAnimeList.net"
  const t = ($('title').text() || '').match(/(Winter|Spring|Summer|Fall)\s+(\d{4})/i);
  const season = t ? t[1].toLowerCase() : null;
  const year = t ? Number.parseInt(t[2], 10) : null;

  const entries = [];

  $('div.seasonal-anime.js-seasonal-anime').each((_, el) => {
    const $el = $(el);

    const link = $el.find('h2.h2_anime_title a, div.title a.link-title').first();
    const href = link.attr('href');
    if (!href) return;

    const header = clean($el.closest('.seasonal-anime-list').find('.anime-header').first().text());
    const continuing = /\(Continuing\)/i.test(header);
    const type = header ? clean(header.replace(/\s*\(.*\)$/, '')) || null : null;

    const title = clean(link.text());
    const image = parseImageQuality(imageSrc($el.find('div.image img').first()));

    const scoreText = clean($el.find('.js-score').first().text());
    const score = /^\d/.test(scoreText) ? Number.parseFloat(scoreText) : null;
    const membersText = clean($el.find('.js-members').first().text());
    const members = /^\d+$/.test(membersText) ? Number.parseInt(membersText, 10) : null;

    // js-start_date: "20260706" (день/месяц могут быть "00")
    const sd = clean($el.find('.js-start_date').first().text());
    const aired = parseStartDate(sd, clean($el.find('div.prodsrc div.info span.item').first().text()));

    // "14 eps", "23 min" внутри второго span.item
    let episodes = null;
    let duration = null;
    $el.find('div.prodsrc div.info span').each((_, s) => {
      const text = clean($(s).text());
      const epsMatch = text.match(/^(\d+|\?)\s*eps?$/);
      if (epsMatch) episodes = epsMatch[1] === '?' ? null : Number.parseInt(epsMatch[1], 10);
      const durMatch = text.match(/^(\d+)\s*min$/);
      if (durMatch) duration = `${durMatch[1]} min`;
    });

    const genres = [];
    const explicitGenres = [];
    $el.find('span.genre a').each((_, a) => {
      const item = malUrlFromLink($(a).attr('href'), $(a).text());
      if (!item) return;
      if ($(a).closest('span.genre').hasClass('explicit')) explicitGenres.push(item);
      else genres.push(item);
    });

    const synopsis = clean($el.find('div.synopsis p').first().text()) || null;

    // properties: Studio / Source / Theme(s) / Demographic(s)
    const studios = [];
    const themes = [];
    const demographics = [];
    let source = null;
    $el.find('div.properties div.property').each((_, prop) => {
      const $prop = $(prop);
      const caption = clean($prop.find('span.caption').first().text());
      const links = $prop
        .find('span.item a')
        .map((_, a) => malUrlFromLink($(a).attr('href'), $(a).text()))
        .get()
        .filter(Boolean);
      if (/^Studios?$/i.test(caption)) studios.push(...links);
      else if (/^Source$/i.test(caption)) source = clean($prop.find('span.item').first().text()) || null;
      else if (/^Themes?$/i.test(caption)) themes.push(...links);
      else if (/^Demographics?$/i.test(caption)) demographics.push(...links);
    });

    const classes = ($el.attr('class') || '').split(/\s+/);

    // Статус выводим только там, где он однозначен
    let status = null;
    let airing = null;
    if (continuing) {
      status = 'Currently Airing';
      airing = true;
    } else if (aired.from && new Date(aired.from) > new Date()) {
      status = 'Not yet aired';
      airing = false;
    }

    entries.push({
      mal_id: idFromUrl(href),
      url: href,
      images: commonImages(image),
      title,
      titles: [{ type: 'Default', title }],
      type,
      source,
      episodes,
      status,
      airing,
      aired,
      duration,
      score,
      members,
      synopsis,
      season,
      year,
      genres,
      explicit_genres: explicitGenres,
      themes,
      demographics,
      studios,
      continuing,
      r18: classes.includes('r18'),
      kids: classes.includes('kids'),
    });
  });

  return { season, year, entries };
}

/**
 * Парсит архив сезонов (https://myanimelist.net/anime/season/archive)
 * в формат Jikan v4 /seasons: [{year, seasons: ["winter", ...]}]
 */
function parseSeasonArchive(html) {
  const $ = cheerio.load(html);
  const byYear = new Map();
  const ORDER = ['winter', 'spring', 'summer', 'fall'];

  $('a[href*="/anime/season/"]').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/\/anime\/season\/(\d{4})\/(winter|spring|summer|fall)/i);
    if (!m) return;
    const year = Number.parseInt(m[1], 10);
    const season = m[2].toLowerCase();
    if (!byYear.has(year)) byYear.set(year, new Set());
    byYear.get(year).add(season);
  });

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, seasons]) => ({
      year,
      seasons: ORDER.filter((s) => seasons.has(s)),
    }));
}

function parseStartDate(yyyymmdd, airedString) {
  const empty = { day: null, month: null, year: null };
  let from = null;
  let prop = { ...empty };

  const m = (yyyymmdd || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const year = Number.parseInt(m[1], 10) || null;
    const month = Number.parseInt(m[2], 10) || null;
    const day = Number.parseInt(m[3], 10) || null;
    if (year) {
      prop = { day, month, year };
      from = `${year}-${String(month || 1).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}T00:00:00+00:00`;
    }
  }

  return {
    from,
    to: null,
    prop: { from: prop, to: { ...empty } },
    string: airedString || null,
  };
}

function clean(s) {
  if (s == null) return '';
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parseSeasonPage, parseSeasonArchive };
