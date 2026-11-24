import { analysisTable } from './csv.js';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const FONT_SIZE = 10;
const LEADING = 14;
const CHARS_PER_LINE = 96;

const REPLACEMENTS = {
  '—': '-',
  '–': '-',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '→': '->',
  '•': '-',
  '≥': '>=',
  '≤': '<=',
  '×': 'x',
  '✨': '',
  '✅': '',
  '⚠': ''
};

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sheetName(value) {
  const clean = String(value || 'Analises').replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  return clean || 'Analises';
}

function cellXml(value) {
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

export function toXls({ sheet = 'Analises', headers = [], rows = [] } = {}) {
  const tableRows = [headers, ...rows]
    .map((row) => `<Row>${row.map(cellXml).join('')}</Row>`)
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    `<Worksheet ss:Name="${xmlEscape(sheetName(sheet))}"><Table>${tableRows}</Table></Worksheet>`,
    '</Workbook>'
  ].join('\n');
}

export function analysisXls(entries, sheet = 'Analises') {
  const { headers, rows } = analysisTable(entries);
  return toXls({ sheet, headers, rows });
}

export function channelXls(report = {}) {
  const rows = [
    ['canal', report.channelTitle || ''],
    ['periodo', report.periodLabel || ''],
    ['modelo', report.model || ''],
    ['analisado_em', report.analyzedAt || '']
  ];
  String(report.text || '').split(/\r?\n/).forEach((line, index) => {
    rows.push([`linha_${index + 1}`, line]);
  });
  return toXls({ sheet: 'Analise do canal', headers: ['campo', 'conteudo'], rows });
}

function latin1(text) {
  return String(text == null ? '' : text).split('').map((ch) => {
    if (REPLACEMENTS[ch] !== undefined) return REPLACEMENTS[ch];
    const code = ch.charCodeAt(0);
    return code >= 32 && code <= 255 ? ch : '?';
  }).join('');
}

function pdfEscape(text) {
  return latin1(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (word.length > CHARS_PER_LINE) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += CHARS_PER_LINE) {
        lines.push(word.slice(i, i + CHARS_PER_LINE));
      }
      return;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > CHARS_PER_LINE) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

export function pdfLines(text) {
  return String(text || '').split(/\r?\n/).flatMap((line) => wrapLine(line));
}

function paginate(lines) {
  const maxPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LEADING);
  const pages = [];
  let current = [];

  lines.forEach((line) => {
    if (current.length >= maxPerPage) {
      pages.push(current);
      current = [];
    }
    current.push(line);
  });
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

export function toPdf({ title = '', lines = [] } = {}) {
  const contentLines = [title, '', ...lines].flatMap((line) => pdfLines(line));
  const pages = paginate(contentLines);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];

  pages.forEach((pageLines, index) => {
    const contentId = 5 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);

    let stream = `BT\n/F1 ${FONT_SIZE} Tf\n${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n${LEADING} TL\n`;
    pageLines.forEach((line) => {
      stream += `(${pdfEscape(line)}) Tj\nT*\n`;
    });
    stream += 'ET\n';
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export function analysisPdf(entries, title = 'Análises técnicas por IA') {
  const { rows } = analysisTable(entries);
  const lines = [];

  rows.forEach((row, index) => {
    const [id, videoTitle, published, views, likes, comments, duration, titleLength, descriptionLength, tagsCount, categoryId, , model, analyzedAt, text] = row;
    lines.push(`Vídeo ${index + 1} - ${videoTitle || id}`);
    lines.push(`Publicação: ${published || '-'} | Visualizações: ${views} | Curtidas: ${likes} | Comentários: ${comments}`);
    lines.push(`Duração: ${duration}s | Modelo: ${model || '-'} | Analisado em: ${analyzedAt || '-'}`);
    lines.push(`SEO: Título ${titleLength} caracteres | Descrição ${descriptionLength} caracteres | Tags: ${tagsCount} | Categoria: ${categoryId || '-'}`);
    lines.push(`Análise: ${text || '-'}`);
    lines.push('');
  });

  return toPdf({ title, lines });
}

export function channelPdf(report = {}) {
  const lines = [
    `Canal: ${report.channelTitle || '-'}`,
    `Período: ${report.periodLabel || '-'}`,
    `Modelo: ${report.model || '-'}`,
    `Analisado em: ${report.analyzedAt || '-'}`,
    '',
    ...String(report.text || '').split(/\r?\n/)
  ];
  return toPdf({ title: 'Análise geral do canal (Gemini)', lines });
}
