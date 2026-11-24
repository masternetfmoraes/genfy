import { getSeoSignals } from './seo.js';

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeCsvCell(value) {
  const raw = value == null ? '' : String(value);
  const guarded = FORMULA_PREFIXES.some((p) => raw.startsWith(p)) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(headers, rows, delimiter = ';') {
  const head = headers.map(sanitizeCsvCell).join(delimiter);
  const body = rows.map((row) => row.map(sanitizeCsvCell).join(delimiter));
  return [head, ...body].join('\n');
}

function analysisLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
}

export const ANALYSIS_HEADERS = [
  'video_id',
  'titulo',
  'publicado_em',
  'visualizacoes',
  'curtidas',
  'comentarios',
  'duracao_segundos',
  'titulo_caracteres',
  'descricao_caracteres',
  'tags',
  'categoria',
  'status',
  'modelo',
  'analisado_em',
  'analise'
];

export function analysisTable(entries) {
  const rows = (Array.isArray(entries) ? entries : []).map(({ video = {}, analysis = {} } = {}) => {
    const seo = getSeoSignals(video);
    return [
      video.id,
      video.title,
      video.publishedAt,
      Number(video.viewCount) || 0,
      Number(video.likeCount) || 0,
      Number(video.commentCount) || 0,
      Number(video.durationSeconds) || 0,
      seo.titleLength,
      seo.descriptionLength,
      seo.tagsCount,
      seo.categoryId,
      analysis.status,
      analysis.model,
      analysis.analyzedAt,
      analysisLine(analysis.text)
    ];
  });
  return { headers: ANALYSIS_HEADERS, rows };
}

export function toAnalysisCsv(entries) {
  const { headers, rows } = analysisTable(entries);
  return toCsv(headers, rows);
}
