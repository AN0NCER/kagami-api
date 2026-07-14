/** Общие хелперы для парсинга MAL (портированы с Jikan). */

/**
 * Превращает URL миниатюры в URL полного изображения:
 * https://cdn.myanimelist.net/r/23x32/images/anime/11/79410.webp?s=x
 *   -> https://cdn.myanimelist.net/images/anime/11/79410.webp
 */
function parseImageQuality(url) {
  if (!url) return null;
  return url.replace(/\/r\/\d+x\d+\//, '/').split('?')[0];
}

/** Достаёт mal_id из URL вида https://myanimelist.net/anime/31240/Title */
function idFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/(?:anime|manga|character|people)(?:\.php)?\/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** Берёт src картинки, игнорируя base64-заглушки lazy-load. */
function imageSrc($img) {
  if (!$img || !$img.length) return null;
  const dataSrc = $img.attr('data-src') || $img.attr('data-srcset');
  if (dataSrc) return dataSrc.split(' ')[0];
  const src = $img.attr('src');
  if (src && !src.startsWith('data:')) return src;
  return null;
}

/** ..../79410.jpg + "t" -> ..../79410t.jpg */
function suffixed(url, suffix) {
  return url.replace(/(\.[a-z]+)$/i, `${suffix}$1`);
}

/** Формат картинок персонажа (как у Jikan v4). */
function characterImages(jpgUrl) {
  if (!jpgUrl) {
    return { jpg: { image_url: null }, webp: { image_url: null, small_image_url: null } };
  }
  const webp = jpgUrl.replace(/\.(jpe?g|png)$/i, '.webp');
  return {
    jpg: { image_url: jpgUrl },
    webp: { image_url: webp, small_image_url: suffixed(webp, 't') },
  };
}

/** Формат картинок аниме/манги внутри ography (как у Jikan v4). */
function commonImages(url) {
  if (!url) {
    const empty = { image_url: null, small_image_url: null, large_image_url: null };
    return { jpg: { ...empty }, webp: { ...empty } };
  }
  const jpg = url.replace(/\.webp$/i, '.jpg');
  const webp = jpg.replace(/\.(jpe?g|png)$/i, '.webp');
  return {
    jpg: {
      image_url: jpg,
      small_image_url: suffixed(jpg, 't'),
      large_image_url: suffixed(jpg, 'l'),
    },
    webp: {
      image_url: webp,
      small_image_url: suffixed(webp, 't'),
      large_image_url: suffixed(webp, 'l'),
    },
  };
}

/** Формат картинок человека (сэйю) — у Jikan только jpg. */
function personImages(url) {
  return { jpg: { image_url: url ? url.replace(/\.webp$/i, '.jpg') : null } };
}

/** Чистка текста: убирает \r, лишние пробелы и пустые строки. */
function cleanse(text) {
  if (!text) return '';
  return text
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  parseImageQuality,
  idFromUrl,
  imageSrc,
  characterImages,
  commonImages,
  personImages,
  cleanse,
};

/**
 * Разбирает ссылку MAL в объект {mal_id, type, name, url} (формат MalUrl Jikan).
 * Тип — первый сегмент пути: /anime/producer/18 -> "anime", /manga/123 -> "manga".
 */
function malUrlFromLink(href, name) {
  if (!href) return null;
  const url = href.startsWith('http') ? href : `https://myanimelist.net${href}`;
  let type = null;
  let malId = null;
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    type = segs[0] || null;
    for (const s of segs) {
      if (/^\d+$/.test(s)) {
        malId = Number.parseInt(s, 10);
        break;
      }
    }
  } catch {
    return null;
  }
  return { mal_id: malId, type, name: (name || '').trim(), url };
}

module.exports.malUrlFromLink = malUrlFromLink;
