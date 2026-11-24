import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell, toCsv, toAnalysisCsv } from '../src/scripts/core/csv.js';

test('sanitizeCsvCell envolve em aspas e escapa aspas internas', () => {
  assert.equal(sanitizeCsvCell('a"b'), '"a""b"');
  assert.equal(sanitizeCsvCell(null), '""');
});

test('sanitizeCsvCell neutraliza fórmulas de CSV injection', () => {
  for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
    const output = sanitizeCsvCell(`${prefix}cmd`);
    assert.ok(output.startsWith(`"'${prefix}`), `prefixo ${JSON.stringify(prefix)} não neutralizado`);
  }
  assert.equal(sanitizeCsvCell('texto normal'), '"texto normal"');
});

test('toCsv monta cabeçalho e linhas com delimitador', () => {
  const csv = toCsv(['nome', 'valor'], [['a;b', 1], ['=x', 2]]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '"nome";"valor"');
  assert.equal(lines[1], '"a;b";"1"');
  assert.equal(lines[2], `"'=x";"2"`);
});

test('toAnalysisCsv inclui dados brutos, sinais de SEO e mantém a análise em uma linha', () => {
  const description = 'Descrição otimizada com palavras-chave.';
  const csv = toAnalysisCsv([{
    video: {
      id: 'abc123',
      title: 'Meu vídeo',
      publishedAt: '2025-08-14T00:00:00Z',
      viewCount: 239,
      likeCount: 12,
      commentCount: 3,
      durationSeconds: 900,
      description,
      tags: ['seo', 'youtube'],
      categoryId: '22'
    },
    analysis: {
      status: 'ready',
      model: 'gemini-3.5-flash-lite',
      analyzedAt: '2026-11-17T12:00:00.000Z',
      text: 'RESUMO: bom desempenho.\nPRÓXIMOS PASSOS: testar outro título.'
    }
  }]);

  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /"video_id";"titulo";"publicado_em";"visualizacoes";"curtidas";"comentarios"/);
  assert.match(lines[0], /"titulo_caracteres";"descricao_caracteres";"tags";"categoria"/);
  assert.match(lines[1], /"abc123";"Meu vídeo"/);
  assert.match(lines[1], /"239";"12";"3";"900"/);
  assert.match(lines[1], new RegExp(`"9";"${description.length}";"2";"22"`));
  assert.match(lines[1], /"gemini-3\.5-flash-lite"/);
  assert.match(lines[1], /RESUMO: bom desempenho\. \| PRÓXIMOS PASSOS: testar outro título\./);
});

test('toAnalysisCsv neutraliza fórmula no título do vídeo', () => {
  const csv = toAnalysisCsv([{ video: { id: 'x', title: '=cmd' }, analysis: { text: 'ok' } }]);
  assert.match(csv, /"'=cmd"/);
});
