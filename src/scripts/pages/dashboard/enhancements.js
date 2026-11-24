// GENFY — utilitários de UX. Sem regra de negócio e sem cálculo de métricas.
// O tema vive em `../../ui/theme.js` e é re-exportado aqui para compatibilidade.

import { toCsv, toAnalysisCsv } from '../../core/csv.js';
import { analysisXls, channelXls, analysisPdf, channelPdf } from '../../core/exporters.js';

export { THEMES, THEME_LABEL, applyTheme, nextTheme, watchSystemTheme } from '../../ui/theme.js';

export function animateCounters(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-animate]').forEach((el) => {
    const target = Number(el.textContent.trim().replace(/\./g, ''));
    if (!isFinite(target) || target <= 0) return;
    const duration = 700;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString('pt-BR');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function skeletonHtml() {
  const box = (h) => `<div class="animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700 ${h}"></div>`;
  return `
    <div class="space-y-6" aria-busy="true" aria-label="Carregando dados do YouTube">
      ${box('h-32')}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${[1, 2, 3, 4, 5, 6].map(() => box('h-24')).join('')}
      </div>
      ${box('h-48')}
    </div>
  `;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function lineChartSvg(points, avg, formatNumber) {
  if (!points || points.length < 2) {
    return '<p class="text-sm text-gray-500 dark:text-gray-400">Vídeos insuficientes para desenhar o gráfico.</p>';
  }
  const W = 600, H = 180, PAD_X = 10, PAD_T = 14, PAD_B = 14;
  const max = Math.max(...points.map((p) => p.views), avg || 0, 1);
  const x = (i) => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (v) => H - PAD_B - (v / max) * (H - PAD_T - PAD_B);

  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`)
    .join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`;

  const dots = points
    .map((p, i) => {
      const above = avg > 0 && p.views >= avg;
      const color = above ? 'text-green-500' : 'text-indigo-500';
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.views).toFixed(1)}" r="4" fill="currentColor"
        class="${color} cursor-pointer"><title>${esc(p.label)}: ${formatNumber(p.views)} views</title></circle>`;
    })
    .join('');

  const avgLine = avg > 0
    ? `<line x1="${PAD_X}" x2="${W - PAD_X}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}"
         stroke="currentColor" stroke-dasharray="5 4" class="text-gray-400 dark:text-gray-500"/>
       <text x="${W - PAD_X}" y="${(y(avg) - 4).toFixed(1)}" text-anchor="end" font-size="10"
         fill="currentColor" class="text-gray-500 dark:text-gray-400">média ${formatNumber(avg)}</text>`
    : '';

  return `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img"
         aria-label="Evolução das visualizações por vídeo">
      <path d="${area}" fill="currentColor" class="text-indigo-500/10"/>
      ${avgLine}
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" class="text-indigo-500"/>
      ${dots}
    </svg>
    <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
      Pontos verdes estão acima da média da amostra. Passe o mouse para ver o título e as views.
    </p>
  `;
}

export function ringHtml(score) {
  const r = 34, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const offset = c * (1 - clamped / 100);
  return `
    <div class="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 80 80" class="w-full h-full -rotate-90" role="img"
           aria-label="Channel Health: ${clamped} de 100">
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="currentColor" stroke-width="7"
                class="text-gray-100 dark:text-gray-700"/>
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="currentColor" stroke-width="7"
                stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
                class="text-genfy-primary dark:text-indigo-400 transition-all duration-700"/>
      </svg>
      <div class="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-900 dark:text-white">${clamped}</div>
    </div>
  `;
}

let spyObserver = null;

export function initScrollSpy(onChange) {
  if (spyObserver) spyObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;
  const sections = Array.from(document.querySelectorAll('[id^="genfy-section-"]'));
  if (sections.length === 0) return;
  spyObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) onChange(visible.target.id.replace('genfy-section-', ''));
    },
    { rootMargin: '-20% 0px -70% 0px' }
  );
  sections.forEach((s) => spyObserver.observe(s));
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportVideosCsv(videos) {
  const csv = toCsv(
    ['id', 'titulo', 'publicado_em', 'visualizacoes'],
    videos.map((v) => [v.id, v.title, v.publishedAt, Number(v.viewCount) || 0])
  );
  downloadFile('genfy-videos.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8');
}

function analysisFileName(part) {
  return String(part || 'geral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

export function exportAnalysisCsv(video, analysis) {
  const csv = toAnalysisCsv([{ video, analysis }]);
  downloadFile(`genfy-analise-${analysisFileName(video && video.id)}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
}

export function exportAnalysesCsv(entries, suffix = 'geral') {
  const csv = toAnalysisCsv(entries);
  downloadFile(`genfy-analises-${analysisFileName(suffix)}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
}

function latin1Bytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

export function exportAnalysisXls(entries, suffix = 'geral') {
  const name = analysisFileName(suffix);
  downloadFile(`genfy-analise-${name}.xls`, '\uFEFF' + analysisXls(entries, name), 'application/vnd.ms-excel;charset=utf-8');
}

export function exportAnalysesXls(entries, suffix = 'geral') {
  const name = analysisFileName(suffix);
  downloadFile(`genfy-analises-${name}.xls`, '\uFEFF' + analysisXls(entries, name), 'application/vnd.ms-excel;charset=utf-8');
}

export function exportAnalysisPdf(entries, suffix = 'geral') {
  const name = analysisFileName(suffix);
  downloadFile(`genfy-analise-${name}.pdf`, latin1Bytes(analysisPdf(entries)), 'application/pdf');
}

export function exportAnalysesPdf(entries, suffix = 'geral') {
  const name = analysisFileName(suffix);
  downloadFile(`genfy-analises-${name}.pdf`, latin1Bytes(analysisPdf(entries)), 'application/pdf');
}

export function exportChannelXls(report, suffix = 'canal') {
  const name = analysisFileName(suffix);
  downloadFile(`genfy-analise-canal-${name}.xls`, '\uFEFF' + channelXls(report), 'application/vnd.ms-excel;charset=utf-8');
}

export function exportChannelPdf(report, suffix = 'canal') {
  const name = analysisFileName(suffix);
  downloadFile(`genfy-analise-canal-${name}.pdf`, latin1Bytes(channelPdf(report)), 'application/pdf');
}

export function exportJson(data, filename = 'genfy-dados.json') {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
