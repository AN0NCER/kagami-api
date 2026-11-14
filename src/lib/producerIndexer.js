const config = require('../config');
const { cached } = require('../cache');
const { fetchPage } = require('../mal/client');
const { parseProducersList } = require('../parsers/producers');
const { getProducerSnapshot } = require('./producerSnapshot');
const { indexState } = require('./producerIndex');
const { getScores } = require('./producerHits');
const { getSeasonNow } = require('./seasonNow');

// Причина обновления; при равной востребованности раньше идёт та, что выше в списке
const REASON_RANK = { changed: 0, new: 1, season: 2, scheduled: 3 };

/**
 * Очередь обновления студий.
 *
 * list      — студии из общего списка MAL: [{ mal_id, count }]
 * state     — Map id -> { list_count, fetched_at, members_total } (индекс)
 * hits      — Map id -> востребованность (число запросов с затуханием)
 * seasonIds — Set id студий текущего сезона
 *
 * Обновляются: студии с изменившимся числом тайтлов, ещё не попавшие в индекс, сезонные (раз в
 * seasonTtl), самые востребованные (раз в hotTtl) и остальные (раз в coldTtl).
 * Порядок: сначала самые востребованные студии, при равенстве — по причине, потом по числу тайтлов.
 */
function planQueue({ list, state, hits, seasonIds, now, cfg }) {
  const candidates = list.filter((s) => s.count >= cfg.minTitles);
  const hitsOf = (id) => hits.get(id) || 0;

  // «Горячие»: топ по востребованности, при её отсутствии — по участникам, затем по числу тайтлов
  const hot = new Set(
    candidates
      .slice()
      .sort((a, b) => hitsOf(b.mal_id) - hitsOf(a.mal_id)
        || ((state.get(b.mal_id) || {}).members_total || 0) - ((state.get(a.mal_id) || {}).members_total || 0)
        || b.count - a.count)
      .slice(0, cfg.hotCount)
      .map((s) => s.mal_id)
  );

  const queue = [];
  for (const s of candidates) {
    const row = state.get(s.mal_id);
    let reason = null;

    if (!row) reason = 'new';
    else if (row.list_count !== s.count) reason = 'changed';
    else {
      const baseTtl = hot.has(s.mal_id) ? cfg.hotTtl : cfg.coldTtl;
      const seasonal = seasonIds.has(s.mal_id);
      const ttl = seasonal ? Math.min(baseTtl, cfg.seasonTtl) : baseTtl;
      if (now - row.fetched_at >= ttl) reason = seasonal && cfg.seasonTtl < baseTtl ? 'season' : 'scheduled';
    }

    if (reason) queue.push({ id: s.mal_id, reason, hits: hitsOf(s.mal_id), count: s.count });
  }

  queue.sort((a, b) => b.hits - a.hits || REASON_RANK[a.reason] - REASON_RANK[b.reason] || b.count - a.count || a.id - b.id);
  return queue;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatEta(sec) {
  return sec >= 90 ? `${Math.round(sec / 60)} min` : `${sec} s`;
}

let running = false;
let listCheckedAt = 0;
let timer = null;

function currentConfig() {
  return {
    minTitles: config.INDEX_MIN_TITLES,
    hotCount: config.INDEX_HOT_COUNT,
    hotTtl: config.INDEX_HOT_TTL_MS,
    seasonTtl: config.INDEX_SEASON_TTL_MS,
    coldTtl: config.INDEX_COLD_TTL_MS,
  };
}

/** Общий список студий; не чаще раза в INDEX_LIST_CHECK_MS скачивается заново (иначе — из кэша). */
async function loadList(now) {
  const due = now - listCheckedAt >= config.INDEX_LIST_CHECK_MS;
  const { data } = await cached(
    'producers/list',
    async () => parseProducersList(await fetchPage('/anime/producer')),
    due ? 0 : undefined
  );
  if (due) listCheckedAt = now;
  return data;
}

/** Студии текущего сезона; если сезон не загрузился — пустое множество (это только подсказка). */
async function loadSeasonIds() {
  try {
    const { data } = await getSeasonNow();
    const ids = new Set();
    for (const e of data.entries) for (const s of e.studios || []) if (s.mal_id) ids.add(s.mal_id);
    return ids;
  } catch (err) {
    console.error(`[indexer] season unavailable: ${err.message}`);
    return new Set();
  }
}

/**
 * Один проход: собрать очередь и обойти студии по одной с паузой.
 * При INDEX_MAX_FAILS ошибках подряд обход прекращается до следующего прохода.
 */
async function runCycle({ now = Date.now(), log = console.log } = {}) {
  if (running) return { skipped: true };
  running = true;
  const result = { queued: 0, updated: 0, failed: 0, stopped: false };
  try {
    const list = await loadList(now);
    const queue = planQueue({
      list: list.map((s) => ({ mal_id: s.mal_id, count: s.count })),
      state: indexState(),
      hits: getScores(now),
      seasonIds: await loadSeasonIds(),
      now,
      cfg: currentConfig(),
    });
    result.queued = queue.length;
    result.queue = queue.map((q) => ({ id: q.id, reason: q.reason }));
    if (queue.length) log(`[indexer] queue: ${queue.length} (first: ${queue.slice(0, 3).map((q) => `${q.id}/${q.reason}`).join(', ')})`);

    let fails = 0;
    const startedAt = Date.now();
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const { cache } = await getProducerSnapshot(item.id, { force: true });
        if (cache === 'STALE') throw new Error('MAL unavailable, kept old copy');
        result.updated += 1;
        fails = 0;
      } catch (err) {
        result.failed += 1;
        fails += 1;
        log(`[indexer] producer ${item.id}: ${err.message}`);
        if (fails >= config.INDEX_MAX_FAILS) {
          result.stopped = true;
          break;
        }
      }
      const done = i + 1;
      if (done < queue.length && done % config.INDEX_LOG_EVERY === 0) {
        const left = Math.round(((Date.now() - startedAt) / done) * (queue.length - done) / 1000);
        log(`[indexer] ${done}/${queue.length} (${Math.round((done / queue.length) * 100)}%), failed ${result.failed}, ~${formatEta(left)} left`);
      }
      if (config.INDEX_DELAY_MS) await sleep(config.INDEX_DELAY_MS);
    }
    if (queue.length) log(`[indexer] done: updated ${result.updated}, failed ${result.failed}${result.stopped ? ', stopped' : ''}`);
  } finally {
    running = false;
  }
  return result;
}

/** Запускает обход через несколько секунд после старта и затем раз в INDEX_CYCLE_MS. */
function startIndexer() {
  if (timer || !config.INDEXER_ENABLED) return;
  const tick = () => runCycle().catch((err) => console.error(`[indexer] cycle failed: ${err.message}`));
  setTimeout(tick, 5000).unref();
  timer = setInterval(tick, config.INDEX_CYCLE_MS);
  timer.unref();
}

module.exports = { planQueue, runCycle, startIndexer };
