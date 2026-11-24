import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS,
  aggregateEngagement,
  buildEngagement
} from '../src/scripts/services/youtube/youtubeAnalyticsService.js';

const rows = [
  { day: '2026-11-02', views: '100', likes: '10', comments: '2', shares: '1' },
  { day: '2026-11-03', views: '200', likes: '20', comments: '3', shares: '2' },
  { day: '2026-11-09', views: '300', likes: '30', comments: '4', shares: '3' },
  { day: '2026-12-01', views: '400', likes: '40', comments: '5', shares: '4' }
];

test('buildEngagement soma interações por dia e calcula a taxa sobre views', () => {
  const result = buildEngagement(rows);
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.days, 4);
  assert.deepEqual(result.totals, {
    views: 1000,
    likes: 100,
    comments: 14,
    shares: 10,
    interactions: 124,
    rate: 12.4
  });
  assert.equal(result.daily[0].date, '2026-11-02');
  assert.equal(result.daily[0].interactions, 13);
  assert.equal(result.daily[0].rate, 13);
});

test('buildEngagement ignora linhas sem dia válido', () => {
  const result = buildEngagement([...rows, { day: '', views: '999' }, null]);
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.days, 4);
  assert.equal(buildEngagement([]).status, STATUS.EMPTY);
});

test('aggregateEngagement agrupa por dia, semana, mês e total', () => {
  const engagement = buildEngagement(rows);

  const byDay = aggregateEngagement(engagement, 'day');
  assert.equal(byDay.length, 4);
  assert.deepEqual(byDay.map((b) => b.label), ['02/11', '03/11', '09/11', '01/12']);

  const byWeek = aggregateEngagement(engagement, 'week');
  assert.equal(byWeek.length, 3);
  assert.equal(byWeek[0].key, '2026-11-02');
  assert.equal(byWeek[0].days, 2);
  assert.equal(byWeek[0].interactions, 38);

  const byMonth = aggregateEngagement(engagement, 'month');
  assert.equal(byMonth.length, 2);
  assert.deepEqual(byMonth.map((b) => b.label), ['nov/26', 'dez/26']);
  assert.equal(byMonth[0].days, 3);

  const total = aggregateEngagement(engagement, 'total');
  assert.equal(total.length, 1);
  assert.equal(total[0].label, 'Período inteiro');
  assert.equal(total[0].interactions, 124);
  assert.equal(total[0].rate, 12.4);
});

test('aggregateEngagement limita o número de barras e valida a granularidade', () => {
  const manyRows = Array.from({ length: 100 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return { day: date, views: '100', likes: '5', comments: '1', shares: '0' };
  });
  const engagement = buildEngagement(manyRows);

  assert.equal(aggregateEngagement(engagement, 'day').length, 14);
  assert.equal(aggregateEngagement(engagement, 'week').length, 12);
  assert.deepEqual(aggregateEngagement(engagement, 'inexistente'), aggregateEngagement(engagement, 'week'));
  assert.deepEqual(aggregateEngagement(null, 'week'), []);
});
