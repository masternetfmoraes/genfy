import {
  DEFAULT_LANGUAGE,
  DEFAULT_REGION_CODE,
  FALLBACK_CATEGORIES,
  FALLBACK_LANGUAGES,
  METADATA_CACHE_KEY,
  QUOTA_COSTS
} from '../../../../constants.js';
import { storageGet, storageSet } from '../../../../services/storage.js';
import { getI18nLanguages, getVideoCategories } from '../../../../services/youtube/youtubeApi.js';
import { recordQuotaUsage } from '../../../../core/quota.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cacheWrite = Promise.resolve();

function isFresh(entry) {
  return entry && Array.isArray(entry.items) && Date.now() - entry.savedAt < CACHE_TTL_MS;
}

function normalizeCategories(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.id && item.snippet && item.snippet.assignable !== false)
    .map((item) => ({ id: String(item.id), title: String(item.snippet.title || item.id) }));
}

function normalizeLanguages(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.id && item.snippet)
    .map((item) => ({ code: String(item.id), name: String(item.snippet.name || item.id) }));
}

async function readCache() {
  const cache = await storageGet(METADATA_CACHE_KEY, {});
  return cache && typeof cache === 'object' ? cache : {};
}

function writeCache(key, items) {
  const operation = cacheWrite.then(async () => {
    const cache = await readCache();
    await storageSet(METADATA_CACHE_KEY, {
      ...cache,
      [key]: { savedAt: Date.now(), items }
    });
  });
  cacheWrite = operation.catch(() => {});
  return operation;
}

export async function loadVideoCategories(accessToken, {
  regionCode = DEFAULT_REGION_CODE,
  force = false
} = {}) {
  const cache = await readCache();
  const key = `categories:${regionCode}`;
  const cached = cache[key];
  if (!force && isFresh(cached)) return cached.items;
  if (!accessToken) return isFresh(cached) ? cached.items : FALLBACK_CATEGORIES;

  try {
    const response = await getVideoCategories(accessToken, regionCode);
    const items = normalizeCategories(response.items);
    if (items.length === 0) throw new Error('Nenhuma categoria retornada.');
    await writeCache(key, items);
    await recordQuotaUsage(QUOTA_COSTS.videoCategoriesList, 'videoCategories.list');
    return items;
  } catch (err) {
    console.warn('[GENFY] Categorias do YouTube indisponíveis:', err && err.message);
    return isFresh(cached) ? cached.items : FALLBACK_CATEGORIES;
  }
}

export async function loadLanguages(accessToken, {
  hl = 'pt_BR',
  force = false
} = {}) {
  const cache = await readCache();
  const key = `languages:${hl}`;
  const cached = cache[key];
  if (!force && isFresh(cached)) return cached.items;
  if (!accessToken) return isFresh(cached) ? cached.items : FALLBACK_LANGUAGES;

  try {
    const response = await getI18nLanguages(accessToken, hl);
    const items = normalizeLanguages(response.items);
    if (items.length === 0) throw new Error('Nenhum idioma retornado.');
    await writeCache(key, items);
    await recordQuotaUsage(QUOTA_COSTS.i18nLanguagesList, 'i18nLanguages.list');
    return items;
  } catch (err) {
    console.warn('[GENFY] Idiomas do YouTube indisponíveis:', err && err.message);
    return isFresh(cached) ? cached.items : FALLBACK_LANGUAGES;
  }
}

export async function loadPublishingMetadata(accessToken, options = {}) {
  const [categories, languages] = await Promise.all([
    loadVideoCategories(accessToken, { regionCode: options.regionCode || DEFAULT_REGION_CODE }),
    loadLanguages(accessToken, { hl: options.hl || DEFAULT_LANGUAGE.replace('-', '_') })
  ]);
  return { categories, languages };
}
