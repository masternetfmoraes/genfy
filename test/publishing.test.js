import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quotaDateKey,
  normalizeQuota,
  quotaSnapshot
} from '../src/scripts/core/quota.js';
import {
  parseTags,
  toPublishAt,
  validatePublication,
  validateThumbnailFile,
  validateVideoFile
} from '../src/scripts/modules/youtube/publishing/utils/videoValidation.js';
import {
  buildCancelStatus,
  buildScheduleStatus,
  buildVideoMetadata
} from '../src/scripts/modules/youtube/publishing/utils/metadataFormatter.js';
import { refreshPublications } from '../src/scripts/modules/youtube/publishing/services/youtubeScheduleService.js';
import { renderUploadForm } from '../src/scripts/modules/youtube/publishing/pages/videoUploadPage.js';
import { renderScheduledVideos } from '../src/scripts/modules/youtube/publishing/pages/scheduledVideosPage.js';
import { mountPublishing } from '../src/scripts/modules/youtube/publishing/controller/publishingController.js';
import {
  FALLBACK_CATEGORIES,
  FALLBACK_LANGUAGES,
  PUBLICATION_STATUS
} from '../src/scripts/constants.js';

const videoFile = { name: 'video.mp4', type: 'video/mp4', size: 1024 * 1024 };
const thumbFile = { name: 'thumb.jpg', type: 'image/jpeg', size: 1024 };

test('quotaDateKey usa o fuso do Pacífico, não o fuso local', () => {
  assert.equal(quotaDateKey(new Date('2026-07-15T06:30:00Z')), '2026-07-14');
  assert.equal(quotaDateKey(new Date('2026-07-15T08:00:00Z')), '2026-07-15');
});

test('normalizeQuota zera a cota quando muda o dia do Pacífico', () => {
  const sameDay = normalizeQuota(
    { date: '2026-11-02', used: 1650, entries: [{ cost: 1600 }] },
    new Date('2026-11-02T12:00:00Z')
  );
  assert.equal(sameDay.used, 1650);
  assert.equal(sameDay.entries.length, 1);

  const nextDay = normalizeQuota(
    { date: '2026-11-01', used: 1650, entries: [{ cost: 1600 }] },
    new Date('2026-11-02T12:00:00Z')
  );
  assert.equal(nextDay.used, 0);
  assert.deepEqual(nextDay.entries, []);
});

test('quotaSnapshot calcula restante e uploads estimados', () => {
  const snapshot = quotaSnapshot(
    { date: '2026-11-02', used: 3300, entries: [] },
    new Date('2026-11-02T12:00:00Z')
  );
  assert.equal(snapshot.limit, 10000);
  assert.equal(snapshot.remaining, 6700);
  assert.equal(snapshot.estimatedUploads, 4);
});

test('parseTags separa, remove vazios e deduplica', () => {
  assert.deepEqual(parseTags(' react, hooks, react,, tutorial '), ['react', 'hooks', 'tutorial']);
  assert.deepEqual(parseTags(['a', ' a ', 'b']), ['a', 'b']);
});

test('validateVideoFile aceita vídeo comum e rejeita arquivo inválido', () => {
  assert.equal(validateVideoFile(videoFile).valid, true);
  assert.equal(validateVideoFile({ name: 'a.txt', type: 'text/plain', size: 10 }).valid, false);
  assert.equal(validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 0 }).valid, false);
  assert.equal(validateVideoFile(null).valid, false);
});

test('validateThumbnailFile limita formato e tamanho', () => {
  assert.equal(validateThumbnailFile(thumbFile).valid, true);
  assert.equal(validateThumbnailFile({ name: 'a.gif', type: 'image/gif', size: 10 }).valid, false);
  assert.equal(validateThumbnailFile({ name: 'a.jpg', type: 'image/jpeg', size: 3 * 1024 * 1024 }).valid, false);
});

test('toPublishAt exige data futura e devolve ISO em UTC', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(toPublishAt('', now).publishAt, null);
  assert.match(toPublishAt('2020-01-01T10:00', now).error, /futuro/);
  assert.match(toPublishAt('data-invalida', now).error, /inválida/);
  assert.equal(
    toPublishAt('2026-11-02T15:30', now).publishAt,
    new Date('2026-11-02T15:30').toISOString()
  );
});

test('validatePublication aceita agendamento público e bloqueia privado', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const base = {
    title: 'Vídeo de teste',
    categoryId: '22',
    file: videoFile,
    thumbnail: thumbFile,
    scheduledAt: '2026-11-03T15:00'
  };

  const valid = validatePublication({ ...base, privacyStatus: 'public' }, now);
  assert.equal(valid.valid, true);
  assert.ok(valid.values.publishAt);
  assert.deepEqual(valid.values.tags, []);

  const invalid = validatePublication({ ...base, privacyStatus: 'private' }, now);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => /públicos/.test(error)));

  const noTitle = validatePublication({ ...base, privacyStatus: 'public', title: ' ' }, now);
  assert.equal(noTitle.valid, false);
});

test('buildVideoMetadata força privado quando há publishAt e preserva privacidade imediata', () => {
  const scheduled = buildVideoMetadata({
    title: 'Agendado',
    description: 'desc',
    tags: ['a'],
    categoryId: '22',
    defaultLanguage: 'pt-BR',
    privacyStatus: 'public',
    publishAt: '2026-11-03T15:00:00.000Z'
  });
  assert.equal(scheduled.status.privacyStatus, 'private');
  assert.equal(scheduled.status.publishAt, '2026-11-03T15:00:00.000Z');
  assert.equal(scheduled.snippet.defaultLanguage, 'pt-BR');

  const immediate = buildVideoMetadata({
    title: 'Imediato',
    tags: [],
    categoryId: '22',
    privacyStatus: 'unlisted'
  });
  assert.equal(immediate.status.privacyStatus, 'unlisted');
  assert.equal(immediate.status.publishAt, undefined);
  assert.equal(immediate.snippet.tags, undefined);
});

test('buildScheduleStatus e buildCancelStatus geram o status esperado', () => {
  assert.deepEqual(buildScheduleStatus('2026-11-03T15:00:00.000Z').status, {
    privacyStatus: 'private',
    publishAt: '2026-11-03T15:00:00.000Z',
    selfDeclaredMadeForKids: false
  });
  assert.deepEqual(buildCancelStatus().status, {
    privacyStatus: 'private',
    publishAt: null,
    selfDeclaredMadeForKids: false
  });
});

test('refreshPublications mapeia status agendado, publicado e removido', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          id: 'v1',
          status: {
            uploadStatus: 'processed',
            privacyStatus: 'private',
            publishAt: '2099-01-01T00:00:00Z'
          }
        },
        {
          id: 'v2',
          status: {
            uploadStatus: 'processed',
            privacyStatus: 'public'
          }
        }
      ]
    })
  });

  try {
    const result = await refreshPublications('token', [
      { id: 'a', videoId: 'v1', status: PUBLICATION_STATUS.PRIVATE },
      { id: 'b', videoId: 'v2', status: PUBLICATION_STATUS.PRIVATE },
      { id: 'c', videoId: 'missing', status: PUBLICATION_STATUS.SCHEDULED }
    ]);
    assert.equal(result[0].status, PUBLICATION_STATUS.SCHEDULED);
    assert.equal(result[1].status, PUBLICATION_STATUS.PUBLISHED);
    assert.equal(result[2].status, PUBLICATION_STATUS.FAILED);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('páginas de publicação renderizam formulário, cota e lista', () => {
  const upload = renderUploadForm({
    categories: FALLBACK_CATEGORIES,
    languages: FALLBACK_LANGUAGES,
    canPublish: false,
    authBusy: false,
    busy: false,
    progress: 0,
    success: '',
    error: '',
    thumbnailWarning: '',
    minSchedule: '2026-11-02T12:05'
  });
  assert.match(upload, /Publicar ou agendar no YouTube/);
  assert.match(upload, /Conectar publicação no YouTube/);
  assert.match(upload, /People &amp; Blogs/);

  const list = renderScheduledVideos({
    publications: [{
      id: 'p1',
      videoId: 'v1',
      title: 'Vídeo <script>',
      status: PUBLICATION_STATUS.SCHEDULED,
      privacyStatus: 'private',
      publishAt: '2099-01-01T00:00:00Z',
      uploadedAt: '2026-11-02T12:00:00Z'
    }],
    quota: { used: 1650, limit: 10000, remaining: 8350, estimatedUploads: 5 },
    canPublish: true,
    authBusy: false,
    refreshing: false,
    editingId: null,
    listError: '',
    busy: false
  });
  assert.match(list, /1\.650 de 10\.000 unidades/);
  assert.match(list, /Vídeo &lt;script&gt;/);
  assert.doesNotMatch(list, /<script>/);
});

test('controller monta o painel sem depender do DOM real', async () => {
  const root = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const controller = mountPublishing(root, { getToken: () => null });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(root.innerHTML, /Publicar ou agendar no YouTube/);
  assert.match(root.innerHTML, /Publicações no YouTube/);
  controller.destroy();
});

test('uploadVideo respeita o Range retornado em chunks parciais', async () => {
  const originalFetch = globalThis.fetch;
  const ranges = [];
  let step = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('uploadType=resumable')) {
      return { ok: true, status: 200, headers: { get: () => 'https://upload.example/session' } };
    }
    ranges.push(options.headers['Content-Range']);
    step += 1;
    if (step === 1) return { status: 308, headers: { get: () => 'bytes=0-2' } };
    if (step === 2) return { status: 308, headers: { get: () => 'bytes=0-6' } };
    return { ok: true, status: 200, json: async () => ({ id: 'video-1', status: { privacyStatus: 'private' } }) };
  };

  try {
    const { uploadVideo } = await import('../src/scripts/modules/youtube/publishing/services/youtubeUploadService.js');
    let progress = 0;
    const file = {
      size: 8,
      type: 'video/mp4',
      slice: (start, end) => ({ start, end })
    };
    const result = await uploadVideo({
      token: 'token',
      file,
      metadata: { snippet: { title: 'Teste' } },
      chunkSize: 4,
      onProgress: (value) => { progress = value; }
    });
    assert.equal(result.video.id, 'video-1');
    assert.equal(progress, 1);
    assert.deepEqual(ranges, [
      'bytes 0-3/8',
      'bytes 3-6/8',
      'bytes 7-7/8'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
