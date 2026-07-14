const { MAL_BASE_URL, USER_AGENT, REQUEST_TIMEOUT_MS } = require('../config');
const { ApiError } = require('../errors');

/**
 * Загружает HTML-страницу с MyAnimeList.
 * @param {string} pagePath например "/character/118737"
 * @returns {Promise<string>} HTML
 */
async function fetchPage(pagePath) {
  let res;
  try {
    res = await fetch(`${MAL_BASE_URL}${pagePath}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiError(
      503,
      'BadResponseException',
      `Failed to connect to MyAnimeList: ${err.message}`
    );
  }

  if (res.status === 404) {
    throw new ApiError(404, 'BadResponseException', 'Resource does not exist');
  }

  if (!res.ok) {
    throw new ApiError(
      503,
      'BadResponseException',
      `MyAnimeList returned HTTP ${res.status}. MyAnimeList may be down/unavailable or refuses to connect`
    );
  }

  return res.text();
}

module.exports = { fetchPage };
