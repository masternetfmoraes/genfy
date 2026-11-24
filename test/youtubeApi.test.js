import test from 'node:test';
import assert from 'node:assert/strict';
import { getCommentThreads, getVideosByIds, MAX_IDS_PER_REQUEST } from '../src/scripts/services/youtube/youtubeApi.js';

test('getVideosByIds aceita lista vazia sem chamar a rede', async () => {
  assert.deepEqual(await getVideosByIds('token', []), { items: [] });
});

test('getVideosByIds rejeita lotes acima do limite da API', () => {
  const ids = Array.from({ length: MAX_IDS_PER_REQUEST + 1 }, (_, i) => `id${i}`);
  assert.throws(() => getVideosByIds('token', ids), /Máximo de 50 IDs/);
});

test('getVideosByIds rejeita quando não há token', async () => {
  await assert.rejects(getVideosByIds('', ['abc']), /Token de acesso ausente/);
});

test('getCommentThreads pagina e inclui respostas quando solicitado', async () => {
  const originalFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = async (url, options) => {
    captured.push({ url: new URL(String(url)), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ id: 't1' }],
        nextPageToken: captured.length === 1 ? 'pagina-2' : undefined
      })
    };
  };

  try {
    const first = await getCommentThreads('token', {
      videoId: 'v1',
      order: 'time',
      maxResults: 100,
      withReplies: true
    });
    assert.equal(first.nextPageToken, 'pagina-2');
    assert.equal(captured[0].url.searchParams.get('part'), 'snippet,replies');
    assert.equal(captured[0].url.searchParams.get('maxResults'), '100');
    assert.equal(captured[0].url.searchParams.get('order'), 'time');

    await getCommentThreads('token', { videoId: 'v1', pageToken: 'pagina-2' });
    assert.equal(captured[1].url.searchParams.get('pageToken'), 'pagina-2');
    assert.equal(captured[1].url.searchParams.get('part'), 'snippet');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updateVideo envia PUT JSON com id e campos de status', async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url: new URL(String(url)), options };
    return { ok: true, status: 200, json: async () => ({ id: 'v1' }) };
  };

  try {
    const { updateVideo } = await import('../src/scripts/services/youtube/youtubeApi.js');
    const result = await updateVideo('token', 'v1', 'status', { status: { privacyStatus: 'private' } });
    assert.equal(result.id, 'v1');
    assert.equal(captured.options.method, 'PUT');
    assert.equal(captured.options.headers.Authorization, 'Bearer token');
    assert.equal(captured.options.headers['Content-Type'], 'application/json');
    assert.equal(captured.url.searchParams.get('part'), 'status');
    assert.deepEqual(JSON.parse(captured.options.body), {
      id: 'v1',
      status: { privacyStatus: 'private' }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deleteVideo aceita resposta 204 sem corpo', async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url: new URL(String(url)), options };
    return { ok: true, status: 204 };
  };

  try {
    const { deleteVideo } = await import('../src/scripts/services/youtube/youtubeApi.js');
    assert.equal(await deleteVideo('token', 'v1'), null);
    assert.equal(captured.options.method, 'DELETE');
    assert.equal(captured.url.searchParams.get('id'), 'v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
