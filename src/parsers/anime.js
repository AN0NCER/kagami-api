const cheerio = require('cheerio');
const { idFromUrl, commonImages, malUrlFromLink } = require('../mal/utils');

const BR = '@@__BR__@@';
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Парсит страницу аниме MAL (https://myanimelist.net/anime/:id)
 * в формат ответа Jikan v4 /anime/:id/full.
 * Селекторы портированы с jikan-me/jikan (AnimeParser.php).
 */
function parseAnimeFull(html) {
  const $ = cheerio.load(html);

  const url = $('meta[property="og:url"]').attr('content') || null;
  const title = ($('meta[property="og:title"]').attr('content') || '').trim() || null;
  const image = $('meta[property="og:image"]').attr('content') || null;

  const info = makeInfoReader($);

  const titleEnglish = info.text('English:');
  const titleJapanese = info.text('Japanese:');
  const synonyms = (info.text('Synonyms:') || '')
    .split(', ')
    .map((s) => s.trim())
    .filter(Boolean);

  const status = info.text('Status:');
  const airedString = info.text('Aired:');
  const premiered = normalizeUnknown(info.text('Premiered:'), ['?']);
  const [season, year] = parsePremiered(premiered);

  const episodesRaw = info.text('Episodes:');
  const typeRaw = normalizeUnknown(info.text('Type:'), ['Unknown']);

  return {
    mal_id: idFromUrl(url),
    url,
    images: commonImages(image),
    trailer: parseTrailer($),
    approved: parseApproved($),
    titles: buildTitles(title, synonyms, titleJapanese, titleEnglish),
    title,
    title_english: titleEnglish,
    title_japanese: titleJapanese,
    title_synonyms: synonyms,
    type: typeRaw,
    source: info.text('Source:'),
    episodes: parseIntOrNull(episodesRaw),
    status,
    airing: status === 'Currently Airing',
    aired: parseDateRange(airedString),
    duration: parseDuration(info.text('Duration:')),
    rating: normalizeUnknown(info.text('Rating:'), ['None']),
    score: parseScore($),
    scored_by: parseScoredBy($),
    rank: parseHashNumber(info.ownText('Ranked:')),
    popularity: parseHashNumber(info.text('Popularity:')),
    members: parseIntOrNull(info.text('Members:')),
    favorites: parseIntOrNull(info.text('Favorites:')),
    synopsis: parseSynopsis($),
    background: parseBackground($),
    season,
    year,
    broadcast: parseBroadcast(info.text('Broadcast:')),
    producers: info.links('Producers:'),
    licensors: info.links('Licensors:'),
    studios: info.links('Studios:'),
    genres: info.links('Genres:').concat(info.links('Genre:')),
    explicit_genres: info.links('Explicit Genres:').concat(info.links('Explicit Genre:')),
    themes: info.links('Themes:').concat(info.links('Theme:')),
    demographics: info.links('Demographics:').concat(info.links('Demographic:')),
    relations: parseRelations($),
    theme: {
      openings: parseThemeSongs($, 'opnening'), // да, у MAL опечатка в классе
      endings: parseThemeSongs($, 'ending'),
    },
    external: parseExternal($),
    streaming: parseStreaming($),
  };
}

// ---- Чтение блока Information (span.dark_text "Label:" + значение) --------

function makeInfoReader($) {
  function findSpan(label) {
    return $('span.dark_text')
      .filter((_, el) => $(el).text().trim() === label)
      .first();
  }

  return {
    /** Значение после метки (текст ссылок сохраняется: Type: <a>TV</a>) */
    text(label) {
      const span = findSpan(label);
      if (!span.length) return null;
      const parent = span.parent().clone();
      parent.find('span.dark_text').remove();
      parent.find('sup').remove();
      parent.find('.statistics-info').remove();
      const t = clean(parent.text());
      return t || null;
    },

    /** Только собственные текстовые узлы родителя (для Ranked: #59<sup>2</sup>) */
    ownText(label) {
      const span = findSpan(label);
      if (!span.length) return null;
      const parent = span.parent().clone();
      parent.children().remove();
      const t = clean(parent.text());
      return t || null;
    },

    /** Список ссылок после метки (Producers:, Genres:, Studios:, ...) */
    links(label) {
      const span = findSpan(label);
      if (!span.length) return [];
      const parent = span.parent();
      if (/None found|No genres have been added yet/i.test(parent.text())) return [];
      return parent
        .find('a')
        .map((_, a) => malUrlFromLink($(a).attr('href'), $(a).text()))
        .get()
        .filter(Boolean);
    },
  };
}

// ---- Отдельные поля --------------------------------------------------------

function parseApproved($) {
  const node = $('#addtolist span').filter((_, el) =>
    $(el).text().includes('pending approval')
  );
  return node.length === 0;
}

function parseTrailer($) {
  const href = $('div.video-promotion a').first().attr('href') || null;
  const m = href ? href.match(/\/embed\/([\w-]+)/) : null;
  const id = m ? m[1] : null;
  return {
    youtube_id: id,
    url: id ? `https://www.youtube.com/watch?v=${id}` : null,
    embed_url: id
      ? `https://www.youtube.com/embed/${id}?enablejsapi=1&wmode=opaque&autoplay=1`
      : null,
    images: {
      image_url: id ? `https://img.youtube.com/vi/${id}/default.jpg` : null,
      small_image_url: id ? `https://img.youtube.com/vi/${id}/sddefault.jpg` : null,
      medium_image_url: id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null,
      large_image_url: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null,
      maximum_image_url: id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null,
    },
  };
}

function buildTitles(title, synonyms, japanese, english) {
  const titles = [];
  if (title) titles.push({ type: 'Default', title });
  for (const s of synonyms) titles.push({ type: 'Synonym', title: s });
  if (japanese) titles.push({ type: 'Japanese', title: japanese });
  if (english) titles.push({ type: 'English', title: english });
  return titles;
}

function parseScore($) {
  const el = $('[itemprop="ratingValue"]').first();
  if (!el.length) return null;
  const t = clean(el.text());
  if (!t || t === 'N/A') return null;
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

function parseScoredBy($) {
  const el = $('[itemprop="ratingCount"]').first();
  if (!el.length) return null;
  const digits = el.text().replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

function parseSynopsis($) {
  const p = $('p[itemprop="description"]').first();
  if (!p.length) return null;
  const clone = p.clone();
  clone.find('br').replaceWith(BR);
  const text = joinBr(clone.text());
  if (!text || text.startsWith('No synopsis information has been added')) return null;
  return text;
}

function parseBackground($) {
  const parent = $('p[itemprop="description"]').first().parent();
  if (!parent.length) return null;
  const clone = parent.clone();
  clone.find('p[itemprop="description"], h2, div, table').remove(); // блоки (синопсис, заголовки)
  clone.find('br').replaceWith(BR);
  // inline-теги (<i>Название</i> и т.п.) разворачиваем в текст, не теряя содержимое
  clone.find('i, em, b, strong, a, span, sup, small').each((_, el) => {
    $(el).replaceWith($(el).text());
  });
  clone.children().remove();
  const text = joinBr(clone.text());
  if (!text || /No background information has been added/i.test(text)) return null;
  return text;
}

function parseRelations($) {
  const map = new Map();

  const push = (relation, entry) => {
    if (!relation) return;
    if (!map.has(relation)) map.set(relation, []);
    if (entry) map.get(relation).push(entry);
  };

  // Формат "плитки"
  $('div.related-entries div.entries-tile div.entry').each((_, el) => {
    const $el = $(el);
    const relEl = $el.find('div.content div.relation').first();
    if (!relEl.length) return;
    const relation = clean(relEl.text().replace(/\s\(.*\)/, ''));
    $el.find('div.content div.title a').each((_, a) => {
      const name = clean($(a).text());
      if (!name) return;
      push(relation, malUrlFromLink($(a).attr('href'), name));
    });
  });

  // Табличный формат
  $('table.entries-table tr').each((_, tr) => {
    const $tr = $(tr);
    const relation = clean($tr.find('td').first().text().replace(/:/g, ''));
    $tr.find('td').eq(1).find('a').each((_, a) => {
      const name = clean($(a).text());
      if (!name) return;
      push(relation, malUrlFromLink($(a).attr('href'), name));
    });
  });

  return [...map.entries()].map(([relation, entry]) => ({ relation, entry }));
}

function parseThemeSongs($, kind) {
  const rows = $(`div.theme-songs.js-theme-songs.${kind} table tr`);
  const out = [];
  const PLATFORM_RE = /^(?:(?:Spotify|Apple Music|Amazon Music|Youtube Music|YouTube Music)\s*)+$/i;
  rows.each((_, tr) => {
    const $tr = $(tr).clone();
    $tr.find('.js-theme-song-buttons, button, input').remove(); // кнопки стримингов
    const text = clean($tr.text());
    if (!text || /No (opening|ending) themes have been added/i.test(text)) return;
    if (PLATFORM_RE.test(text)) return; // строка целиком из названий платформ
    out.push(text);
  });
  return out;
}

function parseExternal($) {
  const out = [];
  $('#content table div.external_links a.link').each((_, a) => {
    const $a = $(a);
    if ($a.hasClass('js-more-links')) return;
    const name = clean($a.text());
    const href = $a.attr('href');
    if (!href || !name) return;
    out.push({ name, url: href });
  });
  return out;
}

function parseStreaming($) {
  const out = [];
  const seen = new Set();
  $('#content table div.broadcast a').each((_, a) => {
    const $a = $(a);
    const name = clean($a.text()) || $a.attr('title') || '';
    const href = $a.attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ name, url: href });
  });
  return out;
}

// ---- Даты, сезоны, трансляция ----------------------------------------------

function parseDate(str) {
  const s = (str || '').trim();
  if (!s || s === '?' || /Not available/i.test(s)) return null;

  let m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) return { day: +m[2], month: MONTHS[m[1].toLowerCase()] || null, year: +m[3] };

  m = s.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (m) return { day: null, month: MONTHS[m[1].toLowerCase()] || null, year: +m[2] };

  m = s.match(/^(\d{4})$/);
  if (m) return { day: null, month: null, year: +m[1] };

  return null;
}

function toIso(prop) {
  if (!prop || !prop.year) return null;
  const mm = String(prop.month || 1).padStart(2, '0');
  const dd = String(prop.day || 1).padStart(2, '0');
  return `${prop.year}-${mm}-${dd}T00:00:00+00:00`;
}

function parseDateRange(str) {
  const string = clean(str) || null;
  const empty = { day: null, month: null, year: null };
  let fromProp = null;
  let toProp = null;

  if (string && !/Not available/i.test(string)) {
    const parts = string.split(' to ');
    fromProp = parseDate(parts[0]);
    toProp = parts.length > 1 ? parseDate(parts[1]) : null;
  }

  return {
    from: toIso(fromProp),
    to: toIso(toProp),
    prop: {
      from: fromProp ? { day: fromProp.day, month: fromProp.month, year: fromProp.year } : { ...empty },
      to: toProp ? { day: toProp.day, month: toProp.month, year: toProp.year } : { ...empty },
    },
    string,
  };
}

function parsePremiered(premiered) {
  if (!premiered) return [null, null];
  const m = premiered.match(/^(Winter|Spring|Summer|Fall)\s+(\d{4})$/i);
  if (!m) return [null, null];
  return [m[1].toLowerCase(), Number.parseInt(m[2], 10)];
}

function parseBroadcast(str) {
  const string = clean(str) || null;
  const res = { day: null, time: null, timezone: null, string };
  if (!string || string === 'Unknown' || string === 'Not scheduled once per week') {
    return res;
  }
  const m = string.match(/^([A-Za-z]+)\s+at\s+(\d{2}:\d{2})(?:\s+\(JST\))?$/);
  if (m) {
    res.day = m[1];
    res.time = m[2];
    res.timezone = 'Asia/Tokyo';
  }
  return res;
}

// ---- Мелкие хелперы ---------------------------------------------------------

function clean(s) {
  if (s == null) return '';
  return s
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinBr(text) {
  return text
    .split(BR)
    .map((seg) => seg.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseIntOrNull(str) {
  if (!str || /Unknown|N\/A/i.test(str)) return null;
  const digits = String(str).replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

function parseHashNumber(str) {
  if (!str) return null;
  const m = String(str).match(/#\s*([\d,]+)/);
  if (!m) return null;
  return Number.parseInt(m[1].replace(/,/g, ''), 10);
}

function parseDuration(str) {
  if (!str) return null;
  const v = clean(String(str).replace(/\./g, ''));
  return v || null;
}

function normalizeUnknown(value, unknownValues) {
  if (!value) return null;
  return unknownValues.includes(value) ? null : value;
}

module.exports = { parseAnimeFull };
