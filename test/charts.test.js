import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateChannelHealth, calculateConsistency } from '../src/scripts/core/analysis.js';
import {
  healthColumnsSvg,
  healthCompositionHtml,
  publicationGapChartSvg
} from '../src/scripts/pages/dashboard/charts.js';
import { renderOverview } from '../src/scripts/pages/dashboard/render.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const video = (id, days, views) => ({ id, title: id, publishedAt: daysAgo(days), viewCount: views });

const videos = [video('a', 28, 100), video('b', 21, 200), video('c', 14, 300), video('d', 0, 400)];
const consistency = calculateConsistency(videos);
const health = calculateChannelHealth(videos, consistency);

test('healthColumnsSvg desenha colunas com os pontos de cada critério', () => {
  const svg = healthColumnsSvg(health.criteria);
  assert.match(svg, /<svg/);
  assert.match(svg, /Atividade/);
  assert.match(svg, /Frequência/);
  assert.match(svg, /Consistência/);
  assert.match(svg, /Volume/);
  assert.match(svg, /18\/25|25\/25/);
});

test('healthCompositionHtml gera fatias e legenda com percentuais', () => {
  const html = healthCompositionHtml(health.criteria, health.score);
  assert.match(html, /<path/);
  assert.match(html, /<title>/);
  assert.match(html, /%/);
  assert.match(html, new RegExp(String(health.score)));
});

test('publicationGapChartSvg plota linha com média e avisa quando faltam dados', () => {
  const svg = publicationGapChartSvg(videos);
  assert.match(svg, /<svg/);
  assert.match(svg, /média/);
  assert.match(svg, /dia\(s\)/);

  const fallback = publicationGapChartSvg([video('a', 1, 100)]);
  assert.match(fallback, /Publicações insuficientes/);
});

test('renderOverview inclui gráficos de colunas, pizza e linha no card de saúde', () => {
  const html = renderOverview({
    c: { title: 'Canal', avatar: '', subscriberCount: 10, viewCount: 100, videoCount: 4 },
    videos,
    perf: { avg: 250 },
    health,
    trend: null
  });
  assert.match(html, /GENFY Channel Health/);
  assert.match(html, /Gráfico de colunas/);
  assert.match(html, /Gráfico de pizza/);
  assert.match(html, /Gráfico de linha/);
});
