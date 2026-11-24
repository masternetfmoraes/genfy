import test from 'node:test';
import assert from 'node:assert/strict';
import { getPopularVideos, searchRecentVideos } from '../src/scripts/services/youtube/youtubeApi.js';
import {
  RISING_WINDOW_DAYS,
  loadTrendingVideos,
  scoreTrendingVideo,
  clearTrendingCache
} from '../src/scripts/services/youtube/youtubeTrendingService.js';
import { TRENDING_CACHE_KEY } from '../src/scripts/constants.js';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const NOW = Date.now() - 24 * 3600000;

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

function installStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index],
    get length() {
      return values.size;
    }
  };
  return values;
}

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

test('getPopularVideos monta a chamada chart=mostPopular com região e categoria', async () => {
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url: new URL(String(url)), options };
    return jsonResponse({ items: [] });
  };

  await getPopularVideos('token', { regionCode: 'BR', videoCategoryId: '10', maxResults: 8 });

  assert.equal(captured.url.pathname, '/youtube/v3/videos');
  assert.equal(captured.url.searchParams.get('chart'), 'mostPopular');
  assert.equal(captured.url.searchParams.get('regionCode'), 'BR');
  assert.equal(captured.url.searchParams.get('videoCategoryId'), '10');
  assert.equal(captured.url.searchParams.get('maxResults'), '8');
  assert.equal(captured.options.headers.Authorization, 'Bearer token');
});

test('searchRecentVideos filtra vídeos recentes por data e ordem de views', async () => {
  let captured = null;
  globalThis.fetch = async (url) => {
    captured = new URL(String(url));
    return jsonResponse({ items: [] });
  };

  await searchRecentVideos('token', {
    query: 'inteligência artificial',
    regionCode: 'PT',
    videoCategoryId: '28',
    publishedAfter: '2026-11-11T00:00:00.000Z',
    maxResults: 6
  });

  assert.equal(captured.pathname, '/youtube/v3/search');
  assert.equal(captured.searchParams.get('q'), 'inteligência artificial');
  assert.equal(captured.searchParams.get('type'), 'video');
  assert.equal(captured.searchParams.get('order'), 'viewCount');
  assert.equal(captured.searchParams.get('publishedAfter'), '2026-11-11T00:00:00.000Z');
  assert.equal(captured.searchParams.get('videoCategoryId'), '28');
  assert.equal(captured.searchParams.get('regionCode'), 'PT');
});

test('scoreTrendingVideo combina velocidade e engajamento em escala 0-100', () => {
  const video = {
    viewCount: '10000',
    likeCount: '500',
    commentCount: '50',
    publishedAt: new Date(NOW - 2 * 3600000).toISOString()
  };
  const score = scoreTrendingVideo(video, NOW);
  assert.ok(score > 0 && score <= 100);
  assert.ok(score > scoreTrendingVideo({ ...video, viewCount: '100' }, NOW));
});

test('loadTrendingVideos busca o ranking, normaliza métricas e reutiliza o cache', async () => {
  installStorage();
  await clearTrendingCache();
  const calls = [];
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    calls.push(target);
    return jsonResponse({
      items: [{
        id: 'v1',
        snippet: {
          title: 'Vídeo em alta',
          publishedAt: new Date(NOW - 2 * 3600000).toISOString(),
          channelTitle: 'Canal Teste',
          channelId: 'UC1',
          thumbnails: { medium: { url: 'https://img/v1.jpg' } }
        },
        statistics: { viewCount: '10000', likeCount: '500', commentCount: '50' }
      }]
    });
  };

  const options = { mode: 'charts', regionCode: 'br', categoryId: '10', now: NOW };
  const first = await loadTrendingVideos('token', options);

  assert.equal(first.cached, false);
  assert.equal(first.regionCode, 'BR');
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].id, 'v1');
  assert.equal(first.items[0].viewsPerHour, 5000);
  assert.equal(first.items[0].engagementRate, 5.5);
  assert.equal(first.items[0].url, 'https://www.youtube.com/watch?v=v1');
  assert.equal(calls[0].searchParams.get('chart'), 'mostPopular');

  const second = await loadTrendingVideos('token', { ...options, now: NOW + 3600000 });
  assert.equal(second.cached, true);
  assert.equal(second.items[0].id, 'v1');
  assert.equal(calls.length, 1, 'cache válido não deve chamar a API');

  await loadTrendingVideos('token', { ...options, force: true });
  assert.equal(calls.length, 2, 'force deve atualizar o cache');
});

test('loadTrendingVideos usa o último resultado salvo quando a API falha', async () => {
  installStorage();
  await clearTrendingCache();
  globalThis.fetch = async () => jsonResponse({ items: [{ id: 'v1', snippet: { title: 'Antigo', publishedAt: new Date(NOW - 3600000).toISOString() }, statistics: { viewCount: '10' } }] });
  await loadTrendingVideos('token', { now: NOW });

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { errors: [{ reason: 'badRequest' }], message: 'falha' } })
  });
  const stale = await loadTrendingVideos('token', { now: Date.now() + 4 * 3600000 });

  assert.equal(stale.stale, true);
  assert.equal(stale.items.length, 1);
  assert.ok(stale.warning);
});

test('loadTrendingVideos no modo rising ordena por velocidade e busca estatísticas', async () => {
  installStorage();
  await clearTrendingCache();
  const calls = [];
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    calls.push(target);
    if (target.pathname.endsWith('/search')) {
      return jsonResponse({
        items: ['a', 'b'].map((id) => ({
          id: { videoId: id, kind: 'youtube#video' },
          snippet: { title: `Busca ${id}`, publishedAt: new Date(NOW - 3600000).toISOString() }
        }))
      });
    }
    return jsonResponse({
      items: [
        { id: 'a', snippet: { title: 'A', channelTitle: 'Canal A', publishedAt: new Date(NOW - 3600000).toISOString() }, statistics: { viewCount: '100', likeCount: '2' } },
        { id: 'b', snippet: { title: 'B', channelTitle: 'Canal B', publishedAt: new Date(NOW - 3600000).toISOString() }, statistics: { viewCount: '9000', likeCount: '400' } }
      ]
    });
  };

  const result = await loadTrendingVideos('token', {
    mode: 'rising',
    regionCode: 'BR',
    query: 'tech',
    now: NOW
  });
  const searchCall = calls.find((call) => call.pathname.endsWith('/search'));

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 'b');
  assert.equal(result.items[0].channelTitle, 'Canal B');
  assert.equal(searchCall.searchParams.get('order'), 'viewCount');
  assert.equal(searchCall.searchParams.get('q'), 'tech');
  assert.equal(
    searchCall.searchParams.get('publishedAfter'),
    new Date(NOW - RISING_WINDOW_DAYS * 86400000).toISOString()
  );
  assert.ok(calls.some((call) => call.pathname.endsWith('/videos')));
  const cache = JSON.parse(globalThis.localStorage.getItem(TRENDING_CACHE_KEY));
  assert.deepEqual((cache['rising|BR|all|tech'].items || []).map((i) => i.id), ['b', 'a']);
});
