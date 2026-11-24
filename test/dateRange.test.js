import test from 'node:test';
import assert from 'node:assert/strict';
import { getDateRange } from '../src/scripts/services/youtube/youtubeAnalyticsService.js';

const dayMs = 24 * 60 * 60 * 1000;

test('getDateRange produz janelas inclusivas para 7/28/90 dias', () => {
  for (const [period, days] of [['7d', 7], ['28d', 28], ['90d', 90]]) {
    const { startDate, endDate } = getDateRange(period);
    const diff = (Date.parse(endDate) - Date.parse(startDate)) / dayMs;
    assert.equal(diff, days - 1, `período ${period}`);
  }
});

test('getDateRange usa a data de criação do canal no período "tudo"', () => {
  assert.equal(getDateRange('all', '2015-03-04T12:00:00Z').startDate, '2015-03-04');
});

test('getDateRange cai no fallback quando não há data válida', () => {
  assert.equal(getDateRange('all', null).startDate, '2008-07-01');
  assert.equal(getDateRange('all', 'data-invalida').startDate, '2008-07-01');
});
