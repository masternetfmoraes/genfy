import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  formatNumber,
  formatPercent,
  formatIsoDate,
  safeViews,
  isValidVideo
} from '../src/scripts/core/format.js';

test('escapeHtml neutraliza markup e aspas', () => {
  assert.equal(
    escapeHtml(`<img src="x" onerror='alert(1)'>&`),
    '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;'
  );
  assert.equal(escapeHtml(null), '');
});

test('formatNumber usa separador pt-BR e trata inválidos', () => {
  assert.equal(formatNumber(1000), '1.000');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber('abc'), '—');
});

test('formatPercent trata nulos', () => {
  assert.equal(formatPercent(null), '—');
  assert.match(formatPercent(12.34), /^12,3%$/);
});

test('formatIsoDate converte AAAA-MM-DD em DD/MM/AAAA', () => {
  assert.equal(formatIsoDate('2026-11-02'), '02/11/2026');
  assert.equal(formatIsoDate('invalido'), 'invalido');
});

test('safeViews e isValidVideo protegem contra dados sujos', () => {
  assert.equal(safeViews({ viewCount: '42' }), 42);
  assert.equal(safeViews({ viewCount: 'x' }), 0);
  assert.equal(safeViews(null), 0);
  assert.equal(isValidVideo({ publishedAt: '2026-01-01T00:00:00Z' }), true);
  assert.equal(isValidVideo({ publishedAt: 'nope' }), false);
  assert.equal(isValidVideo(null), false);
});
