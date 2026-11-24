import {
  DEFAULT_REGION_CODE,
  DEFAULT_TRENDING_MODE,
  QUOTA_COSTS,
  TRENDING_CACHE_KEY,
  TRENDING_MODES
} from '../../constants.js';
import { storageGet, storageSet } from '../storage.js';
import { recordQuotaUsage } from '../../core/quota.js';
import { getPopularVideos, getVideosByIds, searchRecentVideos } from './youtubeApi.js';

export const TRENDING_MAX_RESULTS = 12;
export const RISING_WINDOW_DAYS = 7;

const CHART_TTL_MS = 3 * 60 * 60 * 1000;
const RISING_TTL_MS = 6 * 60 * 60 * 1000;
let cacheWrite = Promise.resolve();

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ageHours(publishedAt, now) {
  const ts = new Date(publishedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(1, (now - ts) / 3600000);
}

export function scoreTrendingVideo(video, now = Date.now()) {
  const views = toNumber(video && video.viewCount) || 0;
  const hours = ageHours(video && video.publishedAt, now);
  const velocity = hours ? views / hours : 0;
  const likes = toNumber(video && video.likeCount) || 0;
  const comments = toNumber(video && video.commentCount) || 0;
  const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
  const velocityPart = Math.min(60, (Math.log10(velocity + 1) / 5) * 60);
  const engagementPart = Math.min(40, (engagement / 10) * 40);
  return Math.round(Math.max(0, velocityPart + engagementPart));
}

function mapVideo(item, details, now) {
  const snippet = (item && (details && details.snippet || item.snippet)) || (item && item.snippet) || {};
  const stats = (item && item.statistics) || (details && details.statistics) || {};
  const id = item && typeof item.id === 'string' ? item.id : item && item.id && item.id.videoId;
  if (!id) return null;

  const viewCount = toNumber(stats.viewCount);
  const likeCount = toNumber(stats.likeCount);
  const commentCount = toNumber(stats.commentCount);
  const hours = ageHours(snippet.publishedAt, now);
  const viewsPerHour = viewCount != null && hours ? viewCount / hours : null;
  const engagementRate = viewCount > 0 && (likeCount != null || commentCount != null)
    ? (((likeCount || 0) + (commentCount || 0)) / viewCount) * 100
    : null;
  const thumbs = snippet.thumbnails || {};
  const base = {
    id,
    title: snippet.title || '(sem título)',
    thumbnail:
      (thumbs.medium && thumbs.medium.url) ||
      (thumbs.high && thumbs.high.url) ||
      (thumbs.default && thumbs.default.url) ||
      '',
    channelTitle: snippet.channelTitle || '',
    channelId: snippet.channelId || '',
    publishedAt: snippet.publishedAt || null,
    viewCount,
    likeCount,
    commentCount,
    viewsPerHour,
    engagementRate
  };

  return { ...base, score: scoreTrendingVideo(base, now), url: `https://www.youtube.com/watch?v=${id}` };
}

async function readCache() {
  const cache = await storageGet(TRENDING_CACHE_KEY, {});
  return cache && typeof cache === 'object' ? cache : {};
}

function writeCache(key, entry) {
  const operation = cacheWrite.then(async () => {
    const cache = await readCache();
    await storageSet(TRENDING_CACHE_KEY, { ...cache, [key]: entry });
  });
  cacheWrite = operation.catch(() => {});
  return operation;
}

export async function clearTrendingCache() {
  await storageSet(TRENDING_CACHE_KEY, {});
}

async function fetchChartVideos(accessToken, { regionCode, categoryId, maxResults }, now) {
  const res = await getPopularVideos(accessToken, { regionCode, videoCategoryId: categoryId, maxResults });
  await recordQuotaUsage(QUOTA_COSTS.videosList, 'videos.list (em alta)');
  return ((res && res.items) || [])
    .map((item) => mapVideo(item, null, now))
    .filter(Boolean);
}

async function fetchRisingVideos(accessToken, { regionCode, categoryId, query, maxResults }, now) {
  const publishedAfter = new Date(now - RISING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await searchRecentVideos(accessToken, {
    query,
    regionCode,
    videoCategoryId: categoryId,
    publishedAfter,
    maxResults
  });
  await recordQuotaUsage(QUOTA_COSTS.searchList, 'search.list (cota de buscas: 100/dia)');

  const items = ((res && res.items) || []).filter((item) => item && item.id && item.id.videoId);
  const ids = items.map((item) => item.id.videoId).slice(0, maxResults);
  const detailsById = {};

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const details = await getVideosByIds(accessToken, chunk);
    ((details && details.items) || []).forEach((video) => {
      detailsById[video.id] = video;
    });
    if (chunk.length) await recordQuotaUsage(QUOTA_COSTS.videosList, 'videos.list (estatísticas em alta)');
  }

  return items
    .map((item) => mapVideo(item, detailsById[item.id.videoId], now))
    .filter(Boolean)
    .sort((a, b) => (b.viewsPerHour || 0) - (a.viewsPerHour || 0))
    .slice(0, maxResults);
}

export async function loadTrendingVideos(accessToken, {
  mode = DEFAULT_TRENDING_MODE,
  regionCode = DEFAULT_REGION_CODE,
  categoryId = '',
  query = '',
  force = false,
  maxResults = TRENDING_MAX_RESULTS,
  now = Date.now()
} = {}) {
  const normalizedMode = mode === TRENDING_MODES.rising ? TRENDING_MODES.rising : TRENDING_MODES.charts;
  const normalizedRegion = /^[a-z]{2}$/i.test(regionCode || '')
    ? String(regionCode).toUpperCase()
    : DEFAULT_REGION_CODE;
  const normalizedCategory = categoryId ? String(categoryId) : '';
  const normalizedQuery = String(query || '').trim().slice(0, 100);
  const params = {
    mode: normalizedMode,
    regionCode: normalizedRegion,
    categoryId: normalizedCategory,
    query: normalizedQuery
  };
  const cacheKey = [
    normalizedMode,
    normalizedRegion,
    normalizedCategory || 'all',
    normalizedQuery.toLowerCase()
  ].join('|');

  const cache = await readCache();
  const entry = cache[cacheKey];
  const ttl = normalizedMode === TRENDING_MODES.rising ? RISING_TTL_MS : CHART_TTL_MS;
  const isFresh = entry && Array.isArray(entry.items) && now - entry.savedAt < ttl;

  if (!force && isFresh) {
    return { ...params, items: entry.items, fetchedAt: entry.savedAt, cached: true, stale: false };
  }

  try {
    const items = normalizedMode === TRENDING_MODES.rising
      ? await fetchRisingVideos(accessToken, { ...params, maxResults }, now)
      : await fetchChartVideos(accessToken, { ...params, maxResults }, now);
    const fetchedAt = Date.now();
    await writeCache(cacheKey, { savedAt: fetchedAt, items });
    return { ...params, items, fetchedAt, cached: false, stale: false };
  } catch (err) {
    console.warn('[GENFY] Vídeos em alta indisponíveis:', err && err.message);
    if (entry && Array.isArray(entry.items)) {
      return {
        ...params,
        items: entry.items,
        fetchedAt: entry.savedAt,
        cached: true,
        stale: true,
        warning: 'Não foi possível atualizar agora. Exibindo o último resultado salvo.'
      };
    }
    throw err;
  }
}
