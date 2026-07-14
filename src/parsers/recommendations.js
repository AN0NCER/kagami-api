const cheerio = require('cheerio');
const { parseImageQuality, idFromUrl, imageSrc, commonImages } = require('../mal/utils');

/**
 * Парсит недавние рекомендации (https://myanimelist.net/recommendations.php?s=recentrecs&t=anime)
 * в формат Jikan v4 /recommendations/anime.
 * Блок: #content div.spaceit.borderClass — пара тайтлов + текст + автор + дата.
 */
function parseRecentRecommendations(html) {
  const $ = cheerio.load(html);
  const out = [];

  $('#content div.spaceit.borderClass').each((_, el) => {
    const $el = $(el);

    // Пара тайтлов: table tr td ×2
    const entry = [];
    $el.find('table tr td').each((_, td) => {
      const $td = $(td);
      const link = $td.find('a').filter((_, a) => !!$(a).attr('href') && $(a).find('strong').length > 0).first();
      const href = (link.attr('href') || '').split('?')[0];
      if (!href) return;
      entry.push({
        mal_id: idFromUrl(href),
        url: href,
        images: commonImages(parseImageQuality(imageSrc($td.find('img').first()))),
        title: clean(link.find('strong').first().text()),
      });
    });
    if (entry.length < 2) return;

    const content = clean($el.find('div.recommendations-user-recs-text').first().text()) || null;

    // div.lightLink: "Anime rec by <a>User</a> - Nov 2, 2021"
    const lightLink = $el.find('div.lightLink').last();
    const userA = lightLink.find('a').first();
    const username = clean(userA.text()) || null;
    let userUrl = userA.attr('href') || null;
    if (userUrl && !userUrl.startsWith('http')) userUrl = `https://myanimelist.net${userUrl}`;

    const llClone = lightLink.clone();
    llClone.children().remove();
    const dateMatch = clean(llClone.text()).match(/-\s*(.+)$/);
    const date = dateMatch ? parseRecDate(dateMatch[1]) : null;

    out.push({
      mal_id: `${entry[0].mal_id}-${entry[1].mal_id}`,
      entry,
      content,
      date,
      user: { url: userUrl, username },
    });
  });

  return {
    results: out,
    lastPage: parseLastPage($),
    hasNextPage: parseHasNextPage($),
  };
}

function parseLastPage($) {
  const span = $('#horiznav_nav div span').first();
  if (!span.length) return 1;
  const tokens = clean(span.text()).split(' ');
  return Number.parseInt(tokens[tokens.length - 1].replace(/[[\]]/g, ''), 10) || 1;
}

function parseHasNextPage($) {
  const span = $('#horiznav_nav div span').first();
  if (!span.length) return false;
  return /\[\d+\]\s*\d+/.test(clean(span.text()));
}

/** "Nov 2, 2021" / "Today, 5:39 AM" / "Yesterday, 11:01 PM" -> ISO */
function parseRecDate(str) {
  const s = clean(str);
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  let m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) {
    const d = new Date(Date.UTC(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));
    return d.toISOString().replace('.000Z', '+00:00');
  }

  m = s.match(/^(Today|Yesterday)/i);
  if (m) {
    const d = new Date();
    if (/yesterday/i.test(m[1])) d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().replace('.000Z', '+00:00');
  }

  return null;
}

function clean(s) {
  if (s == null) return '';
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parseRecentRecommendations };
