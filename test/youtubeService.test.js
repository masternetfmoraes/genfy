import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChannelDashboard } from '../src/scripts/services/youtube/youtubeService.js';

const originalFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = originalFetch;
});

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

const channelFixture = {
  id: 'UC123',
  snippet: {
    title: 'Canal Teste',
    description: 'descrição',
    customUrl: '@canalteste',
    publishedAt: '2015-01-01T00:00:00Z',
    thumbnails: { medium: { url: 'https://img/avatar.jpg' } }
  },
  statistics: { subscriberCount: '1000', viewCount: '50000', videoCount: '12' },
  contentDetails: { relatedPlaylists: { uploads: 'UU123' } }
};

const playlistItems = (start, count) =>
  Array.from({ length: count }, (_, i) => ({
    snippet: {
      title: `Vídeo ${start + i}`,
      publishedAt: '2026-01-01T00:00:00Z',
      thumbnails: { medium: { url: `https://img/${start + i}.jpg` } }
    },
    contentDetails: { videoId: `id${start + i}` }
  }));

test('loadChannelDashboard pagina uploads, agrupa estatísticas e expõe publishedAt', async () => {
  const calls = [];

  globalThis.fetch = async (url, options) => {
    const target = new URL(String(url));
    calls.push({ target, auth: options.headers.Authorization });

    if (target.pathname.endsWith('/channels')) {
      return jsonResponse({ items: [channelFixture] });
    }
    if (target.pathname.endsWith('/playlistItems')) {
      const secondPage = target.searchParams.get('pageToken') === 'next';
      return jsonResponse({
        items: playlistItems(secondPage ? 50 : 0, secondPage ? 1 : 50),
        nextPageToken: secondPage ? undefined : 'next'
      });
    }
    if (target.pathname.endsWith('/videos')) {
      const ids = target.searchParams.get('id').split(',');
      return jsonResponse({
        items: ids.map((id) => ({
          id,
          snippet: { description: `Descrição de ${id}`, tags: ['youtube', 'seo'], categoryId: '22' },
          statistics: { viewCount: '100', likeCount: '5', commentCount: '1' }
        }))
      });
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  const channel = await loadChannelDashboard('token', { videoLimit: 51 });

  assert.equal(channel.publishedAt, '2015-01-01T00:00:00Z');
  assert.equal(channel.handle, '@canalteste');
  assert.equal(channel.recentVideos.length, 51);
  assert.equal(channel.recentVideos[0].id, 'id0');
  assert.equal(channel.recentVideos[50].id, 'id50');
  assert.equal(channel.recentVideos[50].viewCount, '100');
  assert.equal(channel.recentVideos[0].description, 'Descrição de id0');
  assert.deepEqual(channel.recentVideos[0].tags, ['youtube', 'seo']);
  assert.equal(channel.recentVideos[0].categoryId, '22');
  assert.ok(calls.every((call) => call.auth === 'Bearer token'));

  const playlistCalls = calls.filter((call) => call.target.pathname.endsWith('/playlistItems'));
  const videoCalls = calls.filter((call) => call.target.pathname.endsWith('/videos'));

  assert.equal(playlistCalls.length, 2);
  assert.equal(playlistCalls[1].target.searchParams.get('pageToken'), 'next');
  assert.equal(videoCalls.length, 2, '51 IDs devem gerar dois lotes de videos.list');
});

test('loadChannelDashboard falha de forma amigável quando não há canal', async () => {
  globalThis.fetch = async () => jsonResponse({ items: [] });
  await assert.rejects(loadChannelDashboard('token'), /Nenhum canal do YouTube/);
});

test('loadChannelDashboard valida resposta malformada da API', async () => {
  globalThis.fetch = async () => jsonResponse({ unexpected: true });
  await assert.rejects(loadChannelDashboard('token'), /Resposta inválida/);
});
