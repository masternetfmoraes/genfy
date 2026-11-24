import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMENT_SORTS,
  COMMENTS_MODAL_PAGE_SIZE,
  normalizeCommentsSort,
  normalizeCommentSnippet,
  groupCommentsByVideo,
  sortCommentGroups,
  paginateItems
} from '../src/scripts/core/comments.js';

const video = {
  id: 'v1',
  title: 'Vídeo um',
  publishedAt: '2026-11-20T10:00:00Z',
  thumbnail: 'https://img/um.jpg'
};

const comment = (id, publishedAt, likeCount = 0) => ({
  id,
  videoId: 'v1',
  videoTitle: 'Vídeo um',
  videoPublishedAt: '2026-11-20T10:00:00Z',
  publishedAt,
  likeCount
});

test('normalizeCommentsSort converte valores antigos e desconhecidos', () => {
  assert.equal(normalizeCommentsSort('time'), 'newest');
  assert.equal(normalizeCommentsSort('relevance'), 'most');
  assert.equal(normalizeCommentsSort('newest'), 'newest');
  assert.equal(normalizeCommentsSort('most'), 'most');
  assert.equal(normalizeCommentsSort('qualquer'), 'newest');
  assert.deepEqual(COMMENT_SORTS, ['newest', 'most']);
});

test('normalizeCommentSnippet preserva autor, texto, data e metadados de resposta', () => {
  const result = normalizeCommentSnippet(
    {
      authorDisplayName: 'Ana',
      authorProfileImageUrl: 'https://img/ana.jpg',
      textDisplay: 'Ótimo vídeo',
      likeCount: '12',
      publishedAt: '2026-11-21T12:00:00Z'
    },
    video,
    { id: 'c1', videoIsShort: true, replyCount: 3, isReply: true, parentId: 'top1' }
  );

  assert.equal(result.id, 'c1');
  assert.equal(result.videoId, 'v1');
  assert.equal(result.videoTitle, 'Vídeo um');
  assert.equal(result.videoThumbnail, 'https://img/um.jpg');
  assert.equal(result.videoIsShort, true);
  assert.equal(result.author, 'Ana');
  assert.equal(result.text, 'Ótimo vídeo');
  assert.equal(result.likeCount, 12);
  assert.equal(result.replyCount, 3);
  assert.equal(result.isReply, true);
  assert.equal(result.parentId, 'top1');
  assert.equal(normalizeCommentSnippet({}, video, { id: 'vazio' }), null);
});

test('groupCommentsByVideo agrupa e coloca os comentários mais novos primeiro', () => {
  const groups = groupCommentsByVideo([
    comment('a', '2026-11-20T10:00:00Z'),
    comment('b', '2026-11-22T10:00:00Z'),
    { ...comment('c', '2026-11-21T10:00:00Z'), videoId: 'v2', videoTitle: 'Vídeo dois' }
  ]);

  assert.equal(groups.length, 2);
  const first = groups.find((group) => group.videoId === 'v1');
  assert.equal(first.videoTitle, 'Vídeo um');
  assert.equal(first.videoPublishedAt, video.publishedAt);
  assert.deepEqual(first.comments.map((item) => item.id), ['b', 'a']);
});

test('sortCommentGroups ordena por data ou por quantidade de comentários', () => {
  const groups = [
    {
      videoId: 'antigo',
      videoPublishedAt: '2026-11-01T10:00:00Z',
      comments: Array.from({ length: 8 }, (_, i) => ({ id: String(i) }))
    },
    {
      videoId: 'recente',
      videoPublishedAt: '2026-11-22T10:00:00Z',
      comments: Array.from({ length: 2 }, (_, i) => ({ id: String(i) }))
    }
  ];

  assert.deepEqual(sortCommentGroups(groups, 'newest').map((g) => g.videoId), ['recente', 'antigo']);
  assert.deepEqual(sortCommentGroups(groups, 'most').map((g) => g.videoId), ['antigo', 'recente']);
});

test('paginateItems limita a página e devolve metadados', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  const paged = paginateItems(items, 99, COMMENTS_MODAL_PAGE_SIZE);
  assert.equal(paged.page, 3);
  assert.equal(paged.totalPages, 3);
  assert.equal(paged.total, 23);
  assert.deepEqual(paged.items, [20, 21, 22]);
  assert.deepEqual(paginateItems([], 1, 10).items, []);
});
