import { escapeHtml, formatDate, formatDecimal, isValidVideo } from '../../core/format.js';
import { UI } from '../../ui/designSystem.js';

const SLICE_COLORS = [
  { fill: 'text-indigo-500 dark:text-indigo-400', dot: 'bg-indigo-500' },
  { fill: 'text-emerald-500 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { fill: 'text-amber-500 dark:text-amber-400', dot: 'bg-amber-500' },
  { fill: 'text-sky-500 dark:text-sky-400', dot: 'bg-sky-500' }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function columnColor(ratio) {
  if (ratio >= 0.8) return 'text-emerald-500 dark:text-emerald-400';
  if (ratio >= 0.4) return 'text-indigo-500 dark:text-indigo-400';
  if (ratio > 0) return 'text-amber-500 dark:text-amber-400';
  return 'text-gray-300 dark:text-gray-600';
}

export function healthColumnsSvg(criteria = []) {
  if (!criteria.length) {
    return `<p class="text-xs ${UI.muted} py-4 text-center">Sem critérios para exibir.</p>`;
  }

  const W = 360;
  const H = 152;
  const TOP = 24;
  const BASE = 116;
  const LEFT = 6;
  const RIGHT = 6;
  const slot = (W - LEFT - RIGHT) / criteria.length;
  const barWidth = Math.min(44, slot * 0.52);

  const bars = criteria.map((cr, i) => {
    const max = Math.max(1, Number(cr.max) || 25);
    const value = clamp(cr.points, 0, max);
    const ratio = value / max;
    const height = ratio * (BASE - TOP);
    const center = LEFT + slot * i + slot / 2;
    const x = center - barWidth / 2;
    const y = BASE - height;
    const label = escapeHtml(cr.short || cr.label || `Critério ${i + 1}`);

    return `
      <rect x="${x.toFixed(1)}" y="${TOP}" width="${barWidth.toFixed(1)}" height="${BASE - TOP}" rx="6" fill="currentColor" class="text-gray-100 dark:text-gray-700" />
      ${height > 0 ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="6" fill="currentColor" class="${columnColor(ratio)}"><title>${label}: ${formatDecimal(value, 0)} de ${formatDecimal(max, 0)} pontos</title></rect>` : ''}
      <text x="${center.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor" class="text-gray-700 dark:text-gray-200">${formatDecimal(value, 0)}/${formatDecimal(max, 0)}</text>
      <text x="${center.toFixed(1)}" y="${BASE + 18}" text-anchor="middle" font-size="10" fill="currentColor" class="text-gray-500 dark:text-gray-400">${label}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Gráfico de colunas com os pontos de cada critério do Channel Health">
      <line x1="${LEFT}" x2="${W - RIGHT}" y1="${BASE}" y2="${BASE}" stroke="currentColor" stroke-width="1" class="text-gray-200 dark:text-gray-600" />
      ${bars}
    </svg>
  `;
}

function donutSlice(start, end) {
  const cx = 50;
  const cy = 50;
  const outer = 44;
  const inner = 28;
  const rad = (deg) => (deg * Math.PI) / 180;
  const point = (radius, deg) => `${(cx + radius * Math.cos(rad(deg))).toFixed(2)} ${(cy + radius * Math.sin(rad(deg))).toFixed(2)}`;
  const large = end - start > 180 ? 1 : 0;
  return `M ${point(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`;
}

export function healthCompositionHtml(criteria = [], score = 0) {
  const slices = criteria.map((cr, i) => ({
    label: escapeHtml(cr.short || cr.label || `Critério ${i + 1}`),
    points: clamp(cr.points, 0, Number(cr.max) || 25),
    color: SLICE_COLORS[i % SLICE_COLORS.length]
  })).filter((slice) => slice.points > 0);

  const total = slices.reduce((sum, slice) => sum + slice.points, 0);
  if (!total) {
    return `<p class="text-xs ${UI.muted} py-4 text-center">Sem pontos para compor o gráfico.</p>`;
  }

  let angle = -90;
  const paths = slices.map((slice) => {
    const sweep = (slice.points / total) * 359.99;
    const start = angle;
    const end = start + sweep;
    angle = end;
    return `<path d="${donutSlice(start, end)}" fill="currentColor" class="${slice.color.fill}"><title>${slice.label}: ${formatDecimal(slice.points, 0)} ponto(s)</title></path>`;
  }).join('');

  const legend = slices.map((slice) => `
    <div class="flex items-center gap-2 text-[11px]" title="${formatDecimal(slice.points, 0)} ponto(s)">
      <span class="w-2 h-2 rounded-full flex-shrink-0 ${slice.color.dot}"></span>
      <span class="truncate ${UI.textBody}">${slice.label}</span>
      <span class="ml-auto font-semibold ${UI.textStrong}">${Math.round((slice.points / total) * 100)}%</span>
    </div>
  `).join('');

  return `
    <div class="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" class="w-24 h-24 flex-shrink-0" role="img" aria-label="Gráfico de pizza da composição do score do Channel Health">
        ${paths}
        <text x="50" y="48" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor" class="text-gray-900 dark:text-white">${clamp(score, 0, 100)}</text>
        <text x="50" y="61" text-anchor="middle" font-size="9" fill="currentColor" class="text-gray-500 dark:text-gray-400">pontos</text>
      </svg>
      <div class="flex-1 min-w-[130px] space-y-1.5">${legend}</div>
    </div>
  `;
}

export function publicationGapChartSvg(videos = []) {
  const sorted = videos.filter(isValidVideo).slice().sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = (new Date(sorted[i].publishedAt) - new Date(sorted[i - 1].publishedAt)) / 86400000;
    if (isFinite(days) && days > 0) {
      gaps.push({ label: formatDate(sorted[i].publishedAt), value: days });
    }
  }

  const points = gaps.slice(-12);
  if (points.length < 2) {
    return `<p class="text-xs ${UI.muted} py-4 text-center">Publicações insuficientes para desenhar a linha de intervalos.</p>`;
  }

  const W = 600;
  const H = 150;
  const PAD_X = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const max = Math.max(...points.map((point) => point.value)) * 1.1;
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const x = (i) => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (value) => H - PAD_B - (value / max) * (H - PAD_T - PAD_B);

  const line = points
    .map((point, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`;

  const averageLine = `
    <line x1="${PAD_X}" x2="${W - PAD_X}" y1="${y(average).toFixed(1)}" y2="${y(average).toFixed(1)}" stroke="currentColor" stroke-dasharray="5 4" class="text-gray-400 dark:text-gray-500" />
    <text x="${W - PAD_X}" y="${(y(average) - 5).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" class="text-gray-500 dark:text-gray-400">média ${formatDecimal(average, 1)} dia(s)</text>
  `;

  const step = Math.ceil(points.length / 6);
  const dots = points.map((point, i) => `
    <circle cx="${x(i).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="3.5" fill="currentColor" class="text-indigo-500 dark:text-indigo-400">
      <title>${escapeHtml(point.label)}: ${formatDecimal(point.value, 1)} dia(s)</title>
    </circle>
    ${i % step === 0 || i === points.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="currentColor" class="text-gray-500 dark:text-gray-400">${escapeHtml(point.label)}</text>` : ''}
  `).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Gráfico de linha do intervalo entre publicações recentes">
      <path d="${area}" fill="currentColor" class="text-indigo-500/10" />
      ${averageLine}
      <path d="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="text-indigo-500 dark:text-indigo-400" />
      ${dots}
    </svg>
    <p class="text-[11px] ${UI.muted} mt-1">Últimos ${points.length} intervalos • média de ${formatDecimal(average, 1)} dia(s) entre publicações.</p>
  `;
}
