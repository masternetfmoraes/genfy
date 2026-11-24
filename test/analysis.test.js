import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterVideosByPeriod,
  calculatePerformance,
  calculateMedianViews,
  performanceLabel,
  calculateConsistency,
  calculateChannelHealth,
  calculateTrend,
  analyzeTopics,
  generateVideoIdeas,
  sortVideosForContent
} from '../src/scripts/core/analysis.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const video = (id, days, views, title = 'Vídeo de teste') => ({
  id,
  title,
  publishedAt: daysAgo(days),
  viewCount: views
});

test('filterVideosByPeriod limita pela janela e ignora datas inválidas', () => {
  const videos = [video('a', 1, 100), video('b', 40, 200), { id: 'c', publishedAt: null, viewCount: 300 }];
  assert.deepEqual(filterVideosByPeriod(videos, '7d').map((v) => v.id), ['a']);
  assert.deepEqual(filterVideosByPeriod(videos, '90d').map((v) => v.id), ['a', 'b']);
  assert.equal(filterVideosByPeriod(videos, 'all').length, 3);
});

test('calculatePerformance calcula média, mediana, máximo e mínimo', () => {
  const videos = [video('a', 3, 100), video('b', 2, 200), video('c', 1, 300)];
  const perf = calculatePerformance(videos);
  assert.equal(perf.avg, 200);
  assert.equal(perf.median, 200);
  assert.equal(perf.max, 300);
  assert.equal(perf.min, 100);
  assert.equal(perf.count, 3);
  assert.equal(calculateMedianViews([video('a', 1, 100), video('b', 1, 200)]), 150);
  assert.deepEqual(calculatePerformance([]), { avg: 0, median: 0, max: 0, min: 0, count: 0 });
});

test('performanceLabel classifica em relação à média', () => {
  assert.equal(performanceLabel(120, 100).key, 'above');
  assert.equal(performanceLabel(90, 100).key, 'below');
  assert.equal(performanceLabel(100, 100).key, 'average');
  assert.equal(performanceLabel(100, 0).key, 'unknown');
});

test('calculateConsistency premia intervalos regulares', () => {
  const videos = [video('a', 21, 100), video('b', 14, 100), video('c', 7, 100), video('d', 0, 100)];
  const result = calculateConsistency(videos);
  assert.ok(result);
  assert.equal(result.score, 100);
  assert.ok(Math.abs(result.avgGapDays - 7) < 0.01);
});

test('calculateChannelHealth soma critérios esperados', () => {
  const videos = [video('a', 21, 100), video('b', 14, 100), video('c', 7, 100), video('d', 0, 100)];
  const result = calculateChannelHealth(videos, calculateConsistency(videos));
  assert.ok(result);
  assert.equal(result.criteria.length, 4);
  assert.equal(result.score, 75);
});

test('calculateTrend compara metade antiga com metade recente', () => {
  const videos = [video('a', 30, 100), video('b', 20, 100), video('c', 10, 200), video('d', 1, 200)];
  const trend = calculateTrend(videos);
  assert.ok(trend);
  assert.equal(trend.avgOld, 100);
  assert.equal(trend.avgNew, 200);
  assert.equal(trend.diffPct, 100);
});

test('analyzeTopics agrupa palavras recorrentes dos títulos', () => {
  const videos = [
    video('a', 5, 100, 'React hooks avançado'),
    video('b', 4, 300, 'React hooks básico'),
    video('c', 3, 50, 'Vue router essencial')
  ];
  const topics = analyzeTopics(videos);
  const words = topics.map((t) => t.word);
  assert.ok(words.includes('react'));
  assert.ok(words.includes('hooks'));
  const react = topics.find((t) => t.word === 'react');
  assert.equal(react.count, 2);
  assert.equal(react.avgViews, 200);
  assert.equal(react.bestVideo.id, 'b');
});

test('generateVideoIdeas usa o ano corrente e limita a 6 ideias', () => {
  const topics = [{ word: 'react' }, { word: 'typescript' }, { word: 'testes' }];
  const ideas = generateVideoIdeas(topics);
  assert.equal(ideas.length, 6);
  assert.ok(ideas.every((idea) => idea.status === 'ideia'));
  assert.ok(ideas.some((idea) => idea.title.includes(String(new Date().getFullYear()))));
});

test('sortVideosForContent ordena por data nos dois sentidos', () => {
  const videos = [video('a', 1, 100), video('b', 30, 500), video('c', 10, 50)];
  assert.deepEqual(sortVideosForContent(videos, 'newest').map((v) => v.id), ['a', 'c', 'b']);
  assert.deepEqual(sortVideosForContent(videos, 'oldest').map((v) => v.id), ['b', 'c', 'a']);
});

test('sortVideosForContent ordena por audiência nos dois sentidos', () => {
  const videos = [video('a', 1, 100), video('b', 30, 500), video('c', 10, 50)];
  assert.deepEqual(sortVideosForContent(videos, 'best').map((v) => v.id), ['b', 'a', 'c']);
  assert.deepEqual(sortVideosForContent(videos, 'worst').map((v) => v.id), ['c', 'a', 'b']);
});

test('sortVideosForContent aceita valores antigos e não altera a entrada', () => {
  const videos = [video('a', 1, 100), video('b', 30, 500)];
  const ids = videos.map((v) => v.id);
  assert.deepEqual(sortVideosForContent(videos, 'date').map((v) => v.id), ['a', 'b']);
  assert.deepEqual(sortVideosForContent(videos, 'audience').map((v) => v.id), ['b', 'a']);
  assert.deepEqual(videos.map((v) => v.id), ids);
});
