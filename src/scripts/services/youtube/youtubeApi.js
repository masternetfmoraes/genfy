// src/scripts/services/youtube/youtubeApi.js
// Chamadas HTTP puras à YouTube Data API v3, com timeout, retry e validação.

export const API_BASE = 'https://www.googleapis.com/youtube/v3';
export const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 15000;
export const MAX_IDS_PER_REQUEST = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class YouTubeApiError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = status;
    this.reason = reason;
  }
}

function buildUrl(path, params) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, value);
  });
  return url.toString();
}

async function readError(res) {
  const body = await res.json().catch(() => null);
  const apiError = body && body.error;
  return {
    reason:
      (apiError && apiError.errors && apiError.errors[0] && apiError.errors[0].reason) ||
      (apiError && apiError.status) ||
      '',
    message: (apiError && apiError.message) || `HTTP ${res.status}`
  };
}

function isQuotaReason(reason) {
  return /quota|dailyLimit/i.test(String(reason || ''));
}

function quotaError(detail, status) {
  return new YouTubeApiError(
    'Cota da YouTube API excedida ou limite de requisições atingido. Aguarde alguns minutos (ou a renovação diária da cota) e tente novamente.',
    { status, reason: detail.reason || 'quotaExceeded' }
  );
}

async function apiGet(path, params, accessToken) {
  if (!accessToken) {
    throw new YouTubeApiError('Token de acesso ausente.', { status: 401, reason: 'noToken' });
  }

  const url = buildUrl(path, params);
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal
      });

      if (res.ok) {
        return await res.json();
      }

      const detail = await readError(res);
      if ((res.status === 403 || res.status === 429) && isQuotaReason(detail.reason)) {
        console.warn('[GENFY][YouTube API]', path, res.status, detail.reason);
        throw quotaError(detail, res.status);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(400 * 2 ** attempt);
        continue;
      }

      console.warn('[GENFY][YouTube API]', path, res.status, detail.reason);
      throw new YouTubeApiError(`Falha na YouTube API (HTTP ${res.status}).`, {
        status: res.status,
        reason: detail.reason
      });
    } catch (err) {
      if (err instanceof YouTubeApiError) throw err;
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new YouTubeApiError('Falha de rede ao consultar a YouTube API.', {
    status: 0,
    reason: 'network',
    cause: lastError
  });
}

async function apiSend(path, {
  method = 'POST',
  params = {},
  accessToken,
  body = null,
  headers = {},
  timeoutMs = TIMEOUT_MS
} = {}) {
  if (!accessToken) {
    throw new YouTubeApiError('Token de acesso ausente.', { status: 401, reason: 'noToken' });
  }

  const url = buildUrl(path, params);
  const hasJsonBody = body != null && !(body instanceof Blob) && !(body instanceof FormData);
  const requestHeaders = {
    Authorization: `Bearer ${accessToken}`,
    ...headers
  };
  if (hasJsonBody) requestHeaders['Content-Type'] = 'application/json';

  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body == null ? undefined : hasJsonBody ? JSON.stringify(body) : body,
        signal: controller.signal
      });

      if (res.ok) {
        if (res.status === 204) return null;
        return await res.json().catch(() => null);
      }

      const detail = await readError(res);
      if ((res.status === 403 || res.status === 429) && isQuotaReason(detail.reason)) {
        console.warn('[GENFY][YouTube API]', method, path, res.status, detail.reason);
        throw quotaError(detail, res.status);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(400 * 2 ** attempt);
        continue;
      }

      console.warn('[GENFY][YouTube API]', method, path, res.status, detail.reason);
      throw new YouTubeApiError(`Falha na YouTube API (HTTP ${res.status}).`, {
        status: res.status,
        reason: detail.reason
      });
    } catch (err) {
      if (err instanceof YouTubeApiError) throw err;
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new YouTubeApiError('Falha de rede ao chamar a YouTube API.', {
    status: 0,
    reason: 'network',
    cause: lastError
  });
}

export function getMyChannel(accessToken) {
  return apiGet('/channels', {
    part: 'snippet,statistics,contentDetails',
    mine: 'true'
  }, accessToken);
}

export function getPlaylistItems(accessToken, playlistId, maxResults, pageToken) {
  return apiGet('/playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: String(maxResults || 50),
    pageToken: pageToken || undefined
  }, accessToken);
}

export function getVideosByIds(accessToken, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return Promise.resolve({ items: [] });
  }
  if (ids.length > MAX_IDS_PER_REQUEST) {
    throw new YouTubeApiError(`Máximo de ${MAX_IDS_PER_REQUEST} IDs por requisição.`, {
      status: 400,
      reason: 'tooManyIds'
    });
  }
  return apiGet('/videos', {
    part: 'statistics,snippet,contentDetails',
    id: ids.join(',')
  }, accessToken);
}

export function getPopularVideos(accessToken, {
  regionCode = 'BR',
  videoCategoryId = '',
  maxResults = 12
} = {}) {
  return apiGet('/videos', {
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode,
    videoCategoryId: videoCategoryId || undefined,
    maxResults: String(maxResults)
  }, accessToken);
}

export function searchRecentVideos(accessToken, {
  query = '',
  regionCode = 'BR',
  videoCategoryId = '',
  publishedAfter,
  relevanceLanguage,
  maxResults = 12
} = {}) {
  return apiGet('/search', {
    part: 'snippet',
    q: query || undefined,
    type: 'video',
    order: 'viewCount',
    publishedAfter,
    regionCode,
    videoCategoryId: videoCategoryId || undefined,
    relevanceLanguage: relevanceLanguage || undefined,
    maxResults: String(maxResults)
  }, accessToken);
}

export function getCommentThreads(accessToken, { videoId, order = 'relevance', maxResults = 20, pageToken, withReplies = false } = {}) {
  return apiGet('/commentThreads', {
    part: withReplies ? 'snippet,replies' : 'snippet',
    videoId,
    order,
    maxResults: String(maxResults || 20),
    textFormat: 'plainText',
    pageToken: pageToken || undefined
  }, accessToken);
}

export function getVideoCategories(accessToken, regionCode = 'BR') {
  return apiGet('/videoCategories', {
    part: 'snippet',
    regionCode
  }, accessToken);
}

export function getI18nLanguages(accessToken, hl = 'pt_BR') {
  return apiGet('/i18nLanguages', {
    part: 'snippet',
    hl
  }, accessToken);
}

export function getVideoStatuses(accessToken, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return Promise.resolve({ items: [] });
  }
  if (ids.length > MAX_IDS_PER_REQUEST) {
    throw new YouTubeApiError(`Máximo de ${MAX_IDS_PER_REQUEST} IDs por requisição.`, {
      status: 400,
      reason: 'tooManyIds'
    });
  }
  return apiGet('/videos', {
    part: 'status,processingDetails,snippet',
    id: ids.join(',')
  }, accessToken);
}

export function updateVideo(accessToken, videoId, part, resource) {
  return apiSend('/videos', {
    method: 'PUT',
    params: { part },
    accessToken,
    body: { id: videoId, ...resource }
  });
}

export function deleteVideo(accessToken, videoId) {
  return apiSend('/videos', {
    method: 'DELETE',
    params: { id: videoId },
    accessToken
  });
}
