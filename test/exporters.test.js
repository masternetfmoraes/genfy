import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toXls,
  analysisXls,
  channelXls,
  toPdf,
  pdfLines,
  analysisPdf,
  channelPdf
} from '../src/scripts/core/exporters.js';

const entries = [{
  video: {
    id: 'abc123',
    title: 'Título com <tags> & "aspas"',
    publishedAt: '2025-08-14T00:00:00Z',
    viewCount: 1234,
    likeCount: 50,
    commentCount: 7,
    durationSeconds: 900,
    description: 'Descrição com palavras-chave.',
    tags: ['seo', 'youtube'],
    categoryId: '22'
  },
  analysis: {
    status: 'ready',
    model: 'gemini-3.5-flash-lite',
    analyzedAt: '2026-11-17T12:00:00.000Z',
    text: 'RESUMO: bom desempenho.\nPRÓXIMOS PASSOS: testar outro título.'
  }
}];

test('analysisXls gera SpreadsheetML compatível com Excel', () => {
  const xls = analysisXls(entries, 'Analises');
  assert.match(xls, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xls, /mso-application progid="Excel\.Sheet"/);
  assert.match(xls, /ss:Name="Analises"/);
  assert.match(xls, />video_id</);
  assert.match(xls, />abc123</);
  assert.match(xls, /Título com &lt;tags&gt; &amp; &quot;aspas&quot;/);
  assert.match(xls, /RESUMO: bom desempenho\. \| PRÓXIMOS PASSOS: testar outro título\./);
});

test('toXls sanitiza nome da aba e escapa XML', () => {
  const xls = toXls({ sheet: 'a/b?c*d[e]:f', headers: ['campo'], rows: [['x & <y>']] });
  assert.match(xls, /ss:Name="a_b_c_d_e__f"/);
  assert.match(xls, /x &amp; &lt;y&gt;/);
});

test('channelXls inclui metadados e cada linha da análise', () => {
  const xls = channelXls({ channelTitle: 'Canal Teste', periodLabel: '28 dias', model: 'gemini-3.5-flash-lite', analyzedAt: 'hoje', text: 'Linha 1\nLinha 2' });
  assert.match(xls, /ss:Name="Analise do canal"/);
  assert.match(xls, />Canal Teste</);
  assert.match(xls, />linha_1</);
  assert.match(xls, />Linha 2</);
});

test('pdfLines quebra linhas longas sem perder conteúdo', () => {
  const words = Array.from({ length: 80 }, (_, i) => `palavra${i}`);
  const lines = pdfLines(words.join(' '));
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => line.length <= 96));
  assert.equal(lines.join(' '), words.join(' '));
});

test('toPdf gera estrutura válida com xref e escapa parênteses/backslash', () => {
  const pdf = toPdf({ title: 'Relatório', lines: ['linha com (parênteses) e \\barra'] });
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Type \/Catalog/);
  assert.match(pdf, /\/Type \/Pages/);
  assert.match(pdf, /\/Count 1/);
  assert.match(pdf, /linha com \\\(parênteses\\\) e \\\\barra/);

  const offset = Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.slice(offset, offset + 4), 'xref');
  assert.ok(pdf.endsWith('%%EOF'));
});

test('toPdf pagina automaticamente quando há muitas linhas', () => {
  const lines = Array.from({ length: 120 }, (_, i) => `linha ${i + 1}`);
  const pdf = toPdf({ title: 'Relatório longo', lines });
  assert.match(pdf, /\/Count 3/);
});

test('analysisPdf e channelPdf trazem título e conteúdo da análise', () => {
  const videoPdf = analysisPdf(entries);
  assert.match(videoPdf, /Análises técnicas por IA/);
  assert.match(videoPdf, /Vídeo 1 - Título com <tags> & "aspas"/);
  const seo = entries[0].video;
  assert.match(videoPdf, new RegExp(`SEO: Título ${seo.title.length} caracteres \\| Descrição ${seo.description.length} caracteres \\| Tags: 2 \\| Categoria: 22`));
  assert.match(videoPdf, /Análise: RESUMO: bom desempenho/);

  const channelPdfText = channelPdf({ channelTitle: 'Canal Teste', periodLabel: '28 dias', text: 'RESUMO GERAL DO CANAL: tudo certo.' });
  assert.match(channelPdfText, /Análise geral do canal \\\(Gemini\\\)/);
  assert.match(channelPdfText, /Período: 28 dias/);
  assert.match(channelPdfText, /RESUMO GERAL DO CANAL: tudo certo\./);
});
