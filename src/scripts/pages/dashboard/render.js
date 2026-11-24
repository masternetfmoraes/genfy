import { state, normalizeContentSort } from './state.js';
import {
  UI,
  CALC_BADGE_HTML as CALC_BADGE,
  performanceBadgeClass
} from '../../ui/designSystem.js';
import { t } from '../../core/i18n.js';
import {
  WEEKDAY_SHORT,
  HOUR_BLOCKS,
  MIN_FOR_TIME_ANALYSIS,
  CHECKLIST_ITEMS,
  APP_VERSION,
  FALLBACK_CATEGORIES,
  PERIOD_LABELS,
  TRENDING_MODES,
  TRENDING_REGIONS
} from '../../constants.js';
import {
  escapeHtml,
  formatNumber,
  formatPercent,
  formatDate,
  formatIsoDate,
  formatDecimal,
  daysSince,
  formatRelativeTime,
  truncate,
  safeViews,
  isValidVideo
} from '../../core/format.js';
import {
  analyzeTopics,
  calculateConsistency,
  performanceLabel,
  generateVideoIdeas,
  sortVideosForContent
} from '../../core/analysis.js';
import { getSeoSignals } from '../../core/seo.js';
import {
  COMMENTS_MODAL_PAGE_SIZE,
  COMMENTS_PAGE_SIZE,
  groupCommentsByVideo,
  paginateItems,
  sortCommentGroups
} from '../../core/comments.js';
import {
  STATUS as AUDIENCE_STATUS,
  ENGAGEMENT_GRANULARITIES,
  aggregateEngagement
} from '../../services/youtube/youtubeAnalyticsService.js';
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../../services/ai/geminiConfig.js';
import { isMockBackend, canExport, PLAN_FREE, PLAN_PRO } from '../../services/entitlement/entitlementClient.js';
import { ringHtml } from './enhancements.js';
import {
  healthColumnsSvg,
  healthCompositionHtml,
  publicationGapChartSvg
} from './charts.js';

const CARD = UI.card;
const TEXT_STRONG = UI.textStrong;
const TEXT_BODY = UI.textBody;
const MUTED = UI.muted;
const PROGRESS_TRACK = UI.progressTrack;
const PROGRESS_FILL = UI.progressFill;

export function section(id, title, subtitle, innerHtml) {
  return `
    <section id="genfy-section-${id}" class="${UI.section}">
      <div>
        <h3 class="${UI.sectionTitle}">${escapeHtml(title)}</h3>
        ${subtitle ? `<p class="${UI.sectionSubtitle}">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${innerHtml}
    </section>
  `;
}

export function renderPeriodSwitcher({ showLabel = false } = {}) {
  const buttons = Object.keys(PERIOD_LABELS).map((p, i) => `
    <button type="button" data-period="${p}" title="Atalho: ${i + 1}"
      aria-pressed="${state.period === p}"
      class="genfy-period-btn ${UI.buttonPill} ${state.period === p ? UI.buttonPillActive : UI.buttonPillIdle}">
      ${PERIOD_LABELS[p]}
    </button>
  `).join('');

  return `
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="${t('header.period')}">
      ${showLabel ? `<span class="text-[11px] ${MUTED} font-semibold uppercase tracking-wide">${t('header.period')}</span>` : ''}
      <div class="flex flex-wrap rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs bg-white dark:bg-gray-800">${buttons}</div>
    </div>
  `;
}

export function renderOverview({ c, videos, perf, health, trend }) {
  const avgViewsText = videos.length > 0 ? formatNumber(perf.avg) : '—';
  const summary = videos.length > 0
    ? `Seu canal possui ${formatNumber(c.subscriberCount)} inscritos e ${formatNumber(c.viewCount)} visualizações totais. Os ${videos.length} vídeos analisados apresentam média de ${avgViewsText} visualizações.`
    : `Seu canal possui ${formatNumber(c.subscriberCount)} inscritos e ${formatNumber(c.viewCount)} visualizações totais. Não há vídeos suficientes na amostra atual.`;

  const bestVideo = videos.length > 0
    ? videos.reduce((best, v) => (safeViews(v) > safeViews(best) ? v : best), videos[0])
    : null;

  const consistency = calculateConsistency(videos);
  const frequencyText = !consistency
    ? 'Sem histórico suficiente'
    : `1 vídeo a cada ${formatDecimal(consistency.avgGapDays)} dias`;

  const trendBadge = trend && trend.diffPct != null
    ? `<span class="text-xs font-semibold ${trend.diffPct >= 0 ? UI.success : UI.danger}">${trend.diffPct >= 0 ? '▲' : '▼'} ${formatDecimal(Math.abs(trend.diffPct))}%</span>`
    : `<span class="text-xs ${MUTED}">Sem histórico</span>`;

  const kpiCards = [
    { label: 'Inscritos', value: formatNumber(c.subscriberCount), note: 'Dado real do YouTube', calc: false, trend: null, animate: true },
    { label: 'Visualizações totais', value: formatNumber(c.viewCount), note: 'Dado real do YouTube', calc: false, trend: null, animate: true },
    { label: 'Vídeos publicados', value: formatNumber(c.videoCount), note: 'Dado real do YouTube', calc: false, trend: null, animate: true },
    { label: 'Média de visualizações', value: avgViewsText, note: `Com base em ${videos.length} vídeo(s)`, calc: true, trend: trendBadge, animate: true },
    { label: 'Melhor vídeo recente', value: bestVideo ? formatNumber(safeViews(bestVideo)) : '—', note: bestVideo ? truncate(bestVideo.title, 40) : 'Sem dados', calc: true, trend: null, animate: true },
    { label: 'Frequência de publicação', value: frequencyText, note: 'Baseado na amostra recente', calc: true, trend: null, animate: false }
  ];

  const healthBlock = health ? `
    <div class="${CARD} p-6">
      <div class="flex items-center justify-between mb-3">
        <h4 class="${TEXT_STRONG}">GENFY Channel Health</h4>
        ${CALC_BADGE}
      </div>
      <p class="text-[11px] ${MUTED} mb-4">Score experimental baseado nos dados disponíveis.</p>
      <div class="flex items-center gap-5 mb-4">
        ${ringHtml(health.score)}
        <div class="flex-1">
          <div class="${PROGRESS_TRACK}">
            <div class="${PROGRESS_FILL}" style="width:${health.score}%"></div>
          </div>
          <p class="text-xs ${MUTED} mt-2 font-medium">${health.score} de 100 pontos</p>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="p-3 rounded-xl border ${UI.border}">
          <p class="text-xs ${TEXT_STRONG}">Pontos por critério</p>
          <p class="text-[11px] ${MUTED} mt-0.5">Pontos conquistados x máximo de cada critério (colunas).</p>
          ${healthColumnsSvg(health.criteria)}
        </div>
        <div class="p-3 rounded-xl border ${UI.border}">
          <p class="text-xs ${TEXT_STRONG}">Composição do score</p>
          <p class="text-[11px] ${MUTED} mt-0.5">Participação de cada critério nos ${health.score} pontos (pizza).</p>
          <div class="mt-3">${healthCompositionHtml(health.criteria, health.score)}</div>
        </div>
      </div>
      <div class="mt-4 p-3 rounded-xl border ${UI.border}">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-xs ${TEXT_STRONG}">Intervalo entre publicações</p>
            <p class="text-[11px] ${MUTED} mt-0.5">Evolução dos intervalos entre vídeos consecutivos (linha).</p>
          </div>
          ${consistency ? `<span class="text-[11px] font-semibold ${UI.primary}">${formatDecimal(consistency.avgGapDays)} dia(s) em média</span>` : ''}
        </div>
        <div class="mt-2">${publicationGapChartSvg(videos)}</div>
      </div>
      <div class="mt-4 space-y-2.5 border-t ${UI.divider} pt-4">
        ${health.criteria.map((cr) => `
          <div class="flex items-center justify-between text-xs">
            <span class="${TEXT_BODY}">${escapeHtml(cr.label)} <span class="${MUTED}">— ${escapeHtml(cr.detail)}</span></span>
            <span class="font-semibold text-gray-900 dark:text-white">${cr.points}/${cr.max}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : `<div class="${CARD} p-6 text-sm ${MUTED}">Channel Health: precisamos de mais vídeos na amostra.</div>`;

  return section('overview', t('section.overview'), null, `
    <div class="${CARD} p-6">
      <div class="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <img src="${escapeHtml(c.avatar)}" alt="${escapeHtml(c.title)}" class="w-20 h-20 rounded-full object-cover bg-gray-100 dark:bg-gray-700 ${UI.avatar}" />
        <div class="text-center sm:text-left flex-1">
          <h3 class="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">${escapeHtml(c.title)}</h3>
          ${c.handle ? `<p class="${TEXT_BODY} mt-1">${escapeHtml(c.handle)}</p>` : ''}
          ${c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="${UI.primary} hover:underline text-sm font-medium mt-2 inline-block">Abrir canal no YouTube ↗</a>` : ''}
          <p class="mt-4 text-sm ${TEXT_BODY} leading-relaxed">${escapeHtml(summary)}</p>
        </div>
      </div>
      ${c.description ? `<p class="mt-5 text-sm ${MUTED} whitespace-pre-line border-t ${UI.divider} pt-4">${escapeHtml(truncate(c.description, 280))}</p>` : ''}
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${kpiCards.map((k) => `
        <div class="${CARD} p-5">
          <div class="flex items-center justify-between mb-2">
            <p class="text-[11px] uppercase tracking-wider font-semibold ${MUTED}">${escapeHtml(k.label)}</p>
            ${k.calc ? CALC_BADGE : ''}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <p ${k.animate ? 'data-animate' : ''} class="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">${escapeHtml(k.value)}</p>
            ${k.trend || ''}
          </div>
          <p class="text-xs ${MUTED} mt-2">${escapeHtml(k.note)}</p>
        </div>
      `).join('')}
    </div>
    ${healthBlock}
  `);
}

function isShortVideo(video) {
  const d = video && video.durationSeconds;
  return typeof d === 'number' && d > 0 && d <= 60;
}

function formatVideoDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const minutes = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:${minutes}` : minutes}:${String(s).padStart(2, '0')}`;
}

function renderVideoDataLine(video) {
  const duration = Number(video.durationSeconds) || 0;
  const items = [
    `${formatNumber(safeViews(video))} visualizações`,
    `${formatNumber(Number(video.likeCount) || 0)} curtidas`,
    `${formatNumber(Number(video.commentCount) || 0)} comentários`,
    `${duration > 0 ? formatVideoDuration(duration) : '—'} de duração`,
    `ID ${escapeHtml(truncate(video.id || '', 16))}`
  ];
  const chips = items.map((item) => `<span class="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">${item}</span>`).join('');
  return `
    <div class="mt-2 ml-10 flex flex-wrap items-center gap-2 text-[11px] ${MUTED}">
      <span class="font-medium ${TEXT_BODY}">${t('analysis.rawData')}</span>
      ${chips}
    </div>
  `;
}

function renderVideoSeoLine(video) {
  const seo = getSeoSignals(video);
  const category = FALLBACK_CATEGORIES.find((item) => item.id === seo.categoryId);
  const categoryLabel = !seo.categoryId
    ? 'indisponível'
    : category ? `${category.title} (${seo.categoryId})` : seo.categoryId;
  const items = [
    `Título: ${seo.titleLength} caracteres`,
    `Descrição: ${seo.descriptionLength ? `${seo.descriptionLength} caracteres` : 'indisponível'}`,
    `Tags: ${seo.tagsCount}`,
    `Categoria: ${categoryLabel}`
  ];
  const chips = items.map((item) => `<span class="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">${escapeHtml(item)}</span>`).join('');
  return `
    <div class="mt-1 ml-10 flex flex-wrap items-center gap-2 text-[11px] ${MUTED}">
      <span class="font-medium ${TEXT_BODY}">${t('analysis.seoData')}</span>
      ${chips}
    </div>
  `;
}

export function renderEntitlementBanner(entry = {}) {
  const data = entry.data;
  if (!data) {
    if (entry.status === 'loading') {
      return `<div id="genfy-entitlement-banner" class="p-3 rounded-xl border ${UI.border} text-xs ${MUTED}">Consultando seu plano...</div>`;
    }
    if (entry.status === 'error') {
      return `<div id="genfy-entitlement-banner" class="p-3 rounded-xl border border-rose-200 dark:border-rose-800 text-xs ${UI.danger}">${escapeHtml(entry.error || 'Falha ao consultar o plano.')}</div>`;
    }
    return '';
  }

  const isPro = data.plan === PLAN_PRO;
  const unlimited = data.remaining === null || data.remaining === undefined;
  const quotaText = unlimited
    ? 'análises IA ilimitadas'
    : `${data.remaining} de ${data.limit} análise(s) IA restante(s) neste mês`;
  const exhausted = !unlimited && data.remaining <= 0;
  const simulated = data.source === 'mock'
    ? '<span class="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-semibold">SIMULADO</span>'
    : '';
  const message = exhausted
    ? 'Limite atingido. Assine o Pro para continuar analisando.'
    : entry.error
      ? escapeHtml(entry.error)
      : '';
  const borderClass = exhausted
    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
    : UI.border;

  return `
    <div id="genfy-entitlement-banner" class="p-3 rounded-xl border ${borderClass} flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs ${TEXT_BODY}">
        <span class="font-semibold ${isPro ? UI.success : UI.primary}">Plano ${escapeHtml(data.label)}</span>${simulated} • ${quotaText}
      </p>
      ${message ? `<p class="text-[11px] ${exhausted ? UI.warning : UI.danger}">${message}</p>` : ''}
    </div>
  `;
}

export function renderMockBackendPanel(entry = {}) {
  if (!isMockBackend()) return '';
  const data = entry.data;
  const isPro = !!data && data.plan === PLAN_PRO;
  const used = data ? data.used : 0;
  const limitText = data && data.limit === null ? '∞' : String(data ? data.limit : 5);

  return `
    <div class="${CARD} p-4 space-y-3 border-amber-200 dark:border-amber-800">
      <h4 class="text-sm font-semibold text-gray-900 dark:text-white">BACKEND SIMULADO — MODO DE TESTE</h4>
      <p class="text-[11px] ${MUTED}">Plano atual: <strong class="${isPro ? UI.success : UI.primary}">${isPro ? 'Pro' : 'Gratuito'}</strong> • Uso: ${used}/${limitText} análise(s) neste mês</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="btn-mock-plan-pro" class="${UI.buttonBase} ${isPro ? UI.buttonSecondary : UI.buttonPrimary} text-xs">Ativar Pro</button>
        <button type="button" id="btn-mock-plan-free" class="${UI.buttonBase} ${isPro ? UI.buttonPrimary : UI.buttonSecondary} text-xs">Voltar ao Gratuito</button>
        <button type="button" id="btn-mock-reset-usage" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Zerar contador</button>
        <button type="button" id="btn-mock-refund" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Simular reembolso</button>
      </div>
      <p id="genfy-mock-status" class="text-[11px] ${MUTED}">As ações abaixo simulam o que o Paddle e o backend real fariam.</p>
    </div>
  `;
}

function planExportDisabled(format) {
  return canExport(state.entitlement && state.entitlement.data, format)
    ? ''
    : 'disabled opacity-50 cursor-not-allowed';
}

function renderMediaRow(video, idx, avg) {
  const label = performanceLabel(safeViews(video), avg);
  const badgeColor = performanceBadgeClass(label.key);
  const isShort = isShortVideo(video);
  const gemini = (state.videoGemini && state.videoGemini[video.id]) || { open: false, status: 'idle', text: '', error: '' };
  const videoId = escapeHtml(video.id);
  const geminiBody = gemini.status === 'loading'
    ? `<div class="flex items-center gap-2 text-xs ${MUTED}"><span class="inline-block w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>Analisando com o Gemini... pode levar alguns segundos.</div>`
    : gemini.status === 'error'
      ? `<p class="text-xs ${UI.danger} whitespace-pre-line">${escapeHtml(gemini.error || 'Falha ao analisar com Gemini.')}</p>`
      : gemini.status === 'ready'
        ? `<div class="text-xs ${TEXT_BODY} whitespace-pre-line leading-relaxed">${escapeHtml(gemini.text || '')}</div>`
        : `<p class="text-xs ${MUTED}">Clique em "Analisar com Gemini" para gerar uma análise individual deste vídeo.</p>`;

  return `
    <div class="py-3 border-b ${UI.divider} last:border-0">
      <div class="flex items-center gap-4">
        <span class="text-xs w-6 text-center font-semibold ${MUTED}">#${idx + 1}</span>
        <a href="https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}" target="_blank" rel="noopener noreferrer" class="flex-shrink-0">
          <img src="${escapeHtml(video.thumbnail)}" alt="" class="w-20 h-12 rounded-lg object-cover bg-gray-100 dark:bg-gray-700" />
        </a>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(video.title)}</p>
          <p class="text-xs ${MUTED} mt-0.5">
            ${video.publishedAt ? formatDate(video.publishedAt) : ''} • ${formatNumber(safeViews(video))} visualizações
            ${isShort ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-[10px] font-semibold">Short</span>' : ''}
          </p>
        </div>
        <div class="flex flex-col items-end gap-2 flex-shrink-0">
          <span class="${UI.badgeBase} ${badgeColor} whitespace-nowrap">${escapeHtml(label.text)}</span>
          <button type="button" data-gemini-video-toggle="${videoId}" class="text-[11px] text-indigo-600 dark:text-indigo-400 underline hover:no-underline">
            ${gemini.open ? 'Ocultar análise' : (gemini.status === 'ready' ? 'Ver análise Gemini' : 'Analisar com Gemini')}
          </button>
        </div>
      </div>
      ${renderVideoDataLine(video)}
      ${renderVideoSeoLine(video)}
      ${gemini.open ? `
        <div class="mt-2 ml-10 p-3 rounded-lg border ${UI.border} bg-gray-50 dark:bg-gray-800/50">
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-[11px] font-medium ${MUTED}">Análise Gemini — ${escapeHtml(truncate(video.title, 48))}</span>
            ${gemini.status === 'ready' || gemini.status === 'error'
              ? `<button type="button" data-gemini-video-refresh="${videoId}" class="text-[11px] text-indigo-600 dark:text-indigo-400 underline">${gemini.status === 'error' ? 'Tentar novamente' : 'Reanalisar'}</button>`
              : ''}
          </div>
          ${geminiBody}
          ${gemini.status === 'ready' ? `
            <div class="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" data-export-analysis="${videoId}" class="${UI.buttonBase} ${UI.buttonSecondary} text-[11px]">CSV</button>
              <button type="button" data-export-analysis-xls="${videoId}" title="Disponível no plano Pro" class="${UI.buttonBase} ${UI.buttonSecondary} text-[11px] ${planExportDisabled('xls')}">XLS</button>
              <button type="button" data-export-analysis-pdf="${videoId}" title="Disponível no plano Pro" class="${UI.buttonBase} ${UI.buttonSecondary} text-[11px] ${planExportDisabled('pdf')}">PDF</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderContentList(list, avg, emptyText) {
  if (!list.length) return `<p class="text-sm ${MUTED}">${escapeHtml(emptyText)}</p>`;
  const query = (state.contentSearch || '').trim().toLowerCase();
  const filtered = query ? list.filter((v) => String(v.title || '').toLowerCase().includes(query)) : list;
  if (!filtered.length && query) return `<p class="text-sm ${MUTED} py-6 text-center">Nenhum vídeo encontrado para essa busca.</p>`;
  const sorted = sortVideosForContent(filtered, state.contentSort);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  let page = Number(state.contentPage) || 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  state.contentPage = page;
  const start = (page - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);
  const rows = pageItems.map((v, idx) => renderMediaRow(v, start + idx, avg)).join('');
  const controls = sorted.length > pageSize ? `
    <div class="flex items-center justify-between mt-4 pt-3 border-t ${UI.divider}">
      <span class="text-xs ${MUTED}">Página ${page} de ${totalPages} • ${sorted.length} item(ns)</span>
      <div class="flex gap-2">
        <button type="button" data-content-page="${page - 1}" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
        <button type="button" data-content-page="${page + 1}" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${page >= totalPages ? 'disabled' : ''}>Próxima</button>
      </div>
    </div>
  ` : '';
  return `<div>${rows}${controls}</div>`;
}

function renderCommentItem(comment) {
  const date = comment.publishedAt ? formatDate(comment.publishedAt) : '';
  const likes = Number(comment.likeCount) || 0;
  const replies = Number(comment.replyCount) || 0;
  return `
    <div class="py-2 border-b ${UI.divider} last:border-0">
      <div class="flex flex-wrap items-center gap-2">
        <img src="${escapeHtml(comment.authorAvatar || '')}" alt="" class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
        <span class="text-xs font-semibold text-gray-900 dark:text-white">${escapeHtml(comment.author || 'Usuário')}</span>
        ${comment.isReply ? '<span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-[10px] font-semibold">Resposta</span>' : ''}
        ${date ? `<span class="text-[11px] ${MUTED}">${date}</span>` : ''}
        ${likes ? `<span class="text-[11px] ${MUTED}">${formatNumber(likes)} curtidas</span>` : ''}
        ${replies && !comment.isReply ? `<span class="text-[11px] ${MUTED}">${formatNumber(replies)} resposta(s)</span>` : ''}
      </div>
      <p class="text-sm ${TEXT_BODY} whitespace-pre-line mt-1">${escapeHtml(comment.text || '')}</p>
    </div>
  `;
}

function renderCommentVideoGroup(group) {
  const total = group.comments.length;
  const preview = group.comments.slice(0, 5);
  const kindBadge = group.videoIsShort
    ? '<span class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-[10px] font-semibold">Short</span>'
    : '<span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-[10px] font-semibold">Vídeo</span>';
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(group.videoId)}`;
  const thumbnail = group.videoThumbnail
    ? `<a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="flex-shrink-0"><img src="${escapeHtml(group.videoThumbnail)}" alt="" class="w-20 h-12 rounded-lg object-cover bg-gray-100 dark:bg-gray-700" /></a>`
    : '';

  return `
    <div class="rounded-xl border ${UI.border} p-4">
      <div class="flex items-start gap-3">
        ${thumbnail}
        <div class="min-w-0 flex-1">
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="block text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(group.videoTitle || 'Vídeo')}</a>
          <p class="text-[11px] ${MUTED} mt-0.5">
            ${group.videoPublishedAt ? formatDate(group.videoPublishedAt) : 'data indisponível'} • ${formatNumber(total)} comentário(s) ${kindBadge}
          </p>
        </div>
      </div>
      <div class="mt-3 border-t ${UI.divider}">${preview.map(renderCommentItem).join('')}</div>
      ${total > 5 ? `<button type="button" data-comments-modal="${escapeHtml(group.videoId)}" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs mt-3">Ver todos os ${formatNumber(total)} comentários</button>` : ''}
    </div>
  `;
}

function renderCommentsModalBody() {
  const modal = state.commentsModal || {};
  if (!modal.videoId) return '';
  const group = groupCommentsByVideo(state.comments).find((item) => item.videoId === modal.videoId);
  if (!group) return `<p class="text-sm ${MUTED}">Comentários indisponíveis.</p>`;
  const paged = paginateItems(group.comments, modal.page, COMMENTS_MODAL_PAGE_SIZE);
  return `
    <div>${paged.items.map(renderCommentItem).join('')}</div>
    <div class="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t ${UI.divider}">
      <span class="text-xs ${MUTED}">Página ${paged.page} de ${paged.totalPages} • ${formatNumber(paged.total)} comentário(s)</span>
      <div class="flex gap-2">
        <button type="button" data-comments-modal-page="prev" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${paged.page <= 1 ? 'disabled' : ''}>Anterior</button>
        <button type="button" data-comments-modal-page="next" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${paged.page >= paged.totalPages ? 'disabled' : ''}>Próxima</button>
      </div>
    </div>
  `;
}

function renderCommentsModal() {
  const modal = state.commentsModal || {};
  const group = groupCommentsByVideo(state.comments).find((item) => item.videoId === modal.videoId);
  return `
    <div id="genfy-comments-modal" class="fixed inset-0 z-50 ${modal.open ? 'flex' : 'hidden'} items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="genfy-comments-modal-title">
      <div id="genfy-comments-modal-backdrop" class="absolute inset-0 bg-black/60"></div>
      <div class="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl border ${UI.border}">
        <div class="sticky top-0 flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-gray-800 border-b ${UI.divider}">
          <div class="min-w-0">
            <h3 id="genfy-comments-modal-title" class="text-base font-bold text-gray-900 dark:text-white truncate">Comentários do vídeo</h3>
            <p class="text-[11px] ${MUTED} truncate">${escapeHtml(truncate((group && group.videoTitle) || '', 70))}</p>
          </div>
          <button type="button" id="genfy-comments-modal-close" class="${UI.buttonGhost} text-xs">Fechar</button>
        </div>
        <div class="p-5">${renderCommentsModalBody()}</div>
      </div>
    </div>
  `;
}

function renderCommentsPanel() {
  const order = state.commentsSort || 'newest';
  const tabs = `
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs bg-white dark:bg-gray-800">
        <button type="button" data-comments-sort="newest" class="${UI.buttonPill} ${order === 'newest' ? UI.buttonPillActive : UI.buttonPillIdle}">Mais novos</button>
        <button type="button" data-comments-sort="most" class="${UI.buttonPill} ${order === 'most' ? UI.buttonPillActive : UI.buttonPillIdle}">Mais comentados</button>
      </div>
      <button type="button" id="btn-load-comments" class="${UI.buttonSecondary} text-xs">${state.commentsStatus === 'ready' ? 'Atualizar comentários' : 'Carregar comentários'}</button>
      ${state.commentsLoadedAt ? `<span class="text-[11px] ${MUTED}">Atualizado ${escapeHtml(formatRelativeTime(state.commentsLoadedAt))}</span>` : ''}
    </div>
  `;

  let body = '';
  if (state.commentsStatus === 'loading') {
    body = `<div class="flex items-center gap-2 text-sm ${MUTED}"><span class="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>Carregando comentários de todos os vídeos...</div>`;
  } else if (state.commentsStatus === 'error' && !state.comments.length) {
    body = `<p class="text-sm ${UI.danger}">${escapeHtml(state.commentsError || 'Não foi possível carregar comentários.')}</p>`;
  } else if (state.commentsStatus !== 'ready' || !state.comments.length) {
    body = `<p class="text-sm ${MUTED}">Clique em "Carregar comentários" para buscar os comentários de todos os vídeos/shorts deste período.</p>`;
  } else {
    const groups = sortCommentGroups(groupCommentsByVideo(state.comments), order);
    const paged = paginateItems(groups, state.commentsPage, COMMENTS_PAGE_SIZE);
    const controls = paged.totalPages > 1 ? `
      <div class="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t ${UI.divider}">
        <span class="text-xs ${MUTED}">Página ${paged.page} de ${paged.totalPages} • ${paged.total} vídeo(s)</span>
        <div class="flex gap-2">
          <button type="button" data-comments-page="${paged.page - 1}" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${paged.page <= 1 ? 'disabled' : ''}>Anterior</button>
          <button type="button" data-comments-page="${paged.page + 1}" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${paged.page >= paged.totalPages ? 'disabled' : ''}>Próxima</button>
        </div>
      </div>
    ` : '';
    body = `
      ${state.commentsError ? `<p class="text-xs ${UI.warning} mb-3">${escapeHtml(state.commentsError)}</p>` : ''}
      <div class="space-y-4">${paged.items.map(renderCommentVideoGroup).join('')}</div>
      ${controls}
    `;
  }

  return `${tabs}${body}${renderCommentsModal()}`;
}

function renderAiAnalysisCard(videos, perf) {
  const longVideos = videos.filter((v) => !isShortVideo(v));
  const shorts = videos.filter(isShortVideo);
  const tab = state.contentTab || 'videos';
  const tabBtn = (key, label, count) => `
    <button type="button" data-content-tab="${key}" class="px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : `border-transparent ${MUTED} hover:text-gray-900 dark:hover:text-white`}">
      ${label} <span class="ml-1 text-xs ${MUTED}">(${count})</span>
    </button>
  `;

  let panel = '';
  if (tab === 'shorts') {
    panel = renderContentList(shorts, perf.avg, 'Nenhum Short identificado neste período (vídeos com duração ≤ 60s).');
  } else if (tab === 'comments') {
    panel = renderCommentsPanel();
  } else {
    panel = renderContentList(longVideos, perf.avg, 'Nenhum vídeo longo encontrado neste período.');
  }

  const sortValue = normalizeContentSort(state.contentSort);
  const searchValue = state.contentSearch || '';
  return `
    <div class="${CARD} p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">${t('analysis.heading')}</h4>
        <div class="flex flex-wrap items-center gap-2">
          <input id="genfy-content-search" type="search" placeholder="Buscar por título..." value="${escapeHtml(searchValue)}" class="${UI.input}" />
          <select id="genfy-content-sort" class="${UI.input} text-xs">
            <option value="newest" ${sortValue === 'newest' ? 'selected' : ''}>Mais recente</option>
            <option value="oldest" ${sortValue === 'oldest' ? 'selected' : ''}>Mais antigo</option>
            <option value="best" ${sortValue === 'best' ? 'selected' : ''}>Melhor audiência</option>
            <option value="worst" ${sortValue === 'worst' ? 'selected' : ''}>Pior audiência</option>
          </select>
        </div>
      </div>
      <div class="flex items-center justify-between mb-4 border-b ${UI.divider}">
        <div class="flex gap-1 -mb-px">
          ${tabBtn('videos', 'Vídeos', longVideos.length)}
          ${tabBtn('shorts', 'Shorts', shorts.length)}
          ${tabBtn('comments', 'Comentários', groupCommentsByVideo(state.comments).length)}
        </div>
        <span class="text-xs ${MUTED}">${videos.length} item(ns) analisado(s)</span>
      </div>
      <div id="genfy-content-panel">${panel}</div>
    </div>
  `;
}

export function renderChannelModalBody() {
  const report = state.channelGemini || {};
  if (report.status === 'loading') {
    return `<div class="flex items-center gap-2 text-sm ${MUTED}"><span class="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>Analisando o canal com o Gemini... pode levar alguns segundos.</div>`;
  }
  if (report.status === 'error') {
    return `<p class="text-sm ${UI.danger} whitespace-pre-line">${escapeHtml(report.error || 'Falha ao analisar o canal com Gemini.')}</p>`;
  }
  if (report.status === 'ready' && report.text) {
    return `<div class="text-sm ${TEXT_BODY} whitespace-pre-line leading-relaxed">${escapeHtml(report.text)}</div>`;
  }
  return `<p class="text-sm ${MUTED}">Use o botão abaixo para gerar uma visão geral do canal: insights técnicos, melhores dias e horários, melhores vídeos, assuntos a seguir e ideias de conteúdo.</p>`;
}

function renderChannelModal() {
  const report = state.channelGemini || {};
  const disabled = report.status === 'ready' && report.text ? '' : 'disabled opacity-50 cursor-not-allowed';
  const xlsDisabled = disabled || planExportDisabled('xls');
  const pdfDisabled = disabled || planExportDisabled('pdf');
  return `
    <div id="genfy-channel-ai-modal" class="fixed inset-0 z-50 ${report.open ? 'flex' : 'hidden'} items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="genfy-channel-ai-title">
      <div id="genfy-channel-ai-backdrop" class="absolute inset-0 bg-black/60"></div>
      <div class="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl border ${UI.border}">
        <div class="sticky top-0 flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-gray-800 border-b ${UI.divider}">
          <div>
            <h3 id="genfy-channel-ai-title" class="text-base font-bold text-gray-900 dark:text-white">${t('analysis.channelModal')}</h3>
            <p class="text-[11px] ${MUTED}">Análise sob demanda, feita com os dados já carregados no dashboard.</p>
          </div>
          <button type="button" id="genfy-channel-ai-close" class="${UI.buttonGhost} text-xs">Fechar</button>
        </div>
        <div id="genfy-channel-ai-body" class="p-5">${renderChannelModalBody()}</div>
        <div class="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 px-5 py-3 bg-white dark:bg-gray-800 border-t ${UI.divider}">
          <button type="button" id="btn-reanalyze-channel" class="${UI.buttonGhost} text-xs">Reanalisar</button>
          <button type="button" id="btn-export-channel-xls" title="Disponível no plano Pro" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs ${xlsDisabled}">Exportar XLS</button>
          <button type="button" id="btn-export-channel-pdf" title="Disponível no plano Pro" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs ${pdfDisabled}">Exportar PDF</button>
        </div>
      </div>
    </div>
  `;
}

export function renderTechAnalysis(videos, perf) {
  const readyCount = videos.filter((v) => {
    const entry = state.videoGemini && state.videoGemini[v.id];
    return entry && entry.status === 'ready' && entry.text;
  }).length;
  const disabled = readyCount ? '' : 'disabled opacity-50 cursor-not-allowed';

  return section('techAnalysis', t('section.techAnalysis'), 'Análises Gemini e dados brutos do YouTube lado a lado, com exportação em CSV, XLS e PDF.', `
    <div class="space-y-4">
      <div id="genfy-entitlement-banner-host">${renderEntitlementBanner(state.entitlement)}</div>
      <div class="${CARD} p-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs ${MUTED}">${readyCount} de ${videos.length} vídeo(s) com análise pronta nesta sessão. ${t('analysis.rawData')}: YouTube Data API.</p>
        ${renderPeriodSwitcher({ showLabel: true })}
      </div>
      ${videos.length
        ? renderAiAnalysisCard(videos, perf)
        : `<p class="text-sm ${MUTED}">Nenhum vídeo disponível para este período.</p>`}
      <div class="${CARD} p-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" id="btn-analyze-channel" class="${UI.buttonBase} ${UI.buttonPrimary} text-xs">${t('analysis.channelButton')}</button>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="btn-export-analyses-csv" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs ${disabled}">Exportar CSV</button>
          <button type="button" id="btn-export-analyses-xls" title="Disponível no plano Pro" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs ${disabled || planExportDisabled('xls')}">Exportar XLS</button>
          <button type="button" id="btn-export-analyses-pdf" title="Disponível no plano Pro" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs ${disabled || planExportDisabled('pdf')}">Exportar PDF</button>
        </div>
      </div>
    </div>
    ${renderChannelModal()}
  `);
}

export function renderTopContent(videos, perf) {
  if (videos.length === 0) return '';
  const top5 = videos.slice().sort((a, b) => safeViews(b) - safeViews(a)).slice(0, 5);
  const maxViews = Math.max(...top5.map(safeViews), 1);

  const items = top5.map((v, idx) => {
    const pct = Math.max(4, Math.round((safeViews(v) / maxViews) * 100));
    const label = performanceLabel(safeViews(v), perf.avg);
    return `
      <div class="flex items-center gap-4 py-3 border-b ${UI.divider} last:border-0">
        <span class="text-sm font-bold w-6 text-center ${MUTED}">${idx + 1}</span>
        <img src="${escapeHtml(v.thumbnail)}" alt="" class="w-24 h-14 rounded-lg object-cover bg-gray-100 dark:bg-gray-700 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(v.title)}</p>
          <p class="text-xs ${MUTED} mt-1 mb-2">${v.publishedAt ? formatDate(v.publishedAt) : ''} • ${formatNumber(safeViews(v))} views • ${escapeHtml(label.text)}</p>
          <div class="${PROGRESS_TRACK}">
            <div class="${PROGRESS_FILL}" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return section('comparisons', t('section.comparisons'), 'Os 5 vídeos com mais visualizações entre os analisados.', `<div class="${CARD} p-6">${items}</div>`);
}

export function renderContentOpportunities(topics) {
  if (topics.length === 0) {
    return `<div class="${CARD} p-6 text-sm ${MUTED}">Oportunidades: precisamos de mais vídeos para identificar temas recorrentes.</div>`;
  }

  const cards = topics.map((topic) => `
    <div class="${CARD} p-5 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-semibold text-gray-900 dark:text-white">"${escapeHtml(topic.word)}"</h4>
        ${CALC_BADGE}
      </div>
      <p class="text-sm ${TEXT_BODY}">${topic.count} vídeo(s) • média de ${formatNumber(topic.avgViews)} visualizações</p>
      <p class="text-xs ${MUTED} mt-2 truncate">Melhor vídeo: ${escapeHtml(truncate(topic.bestVideo.title, 50))}</p>
    </div>
  `).join('');

  return `
    <div class="space-y-3">
      <div>
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Oportunidades de conteúdo</h4>
        <p class="text-[11px] ${MUTED} mt-0.5">Análise heurística baseada nos títulos dos vídeos.</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${cards}</div>
    </div>
  `;
}

const AUDIENCE_MSG = {
  loading: 'Carregando dados do YouTube Analytics...',
  needsAuth: 'Conecte o YouTube Analytics para visualizar os dados de público.',
  empty: 'Não há dados suficientes para esta análise.',
  error: 'Não foi possível carregar os dados do YouTube Analytics.'
};

export function audienceNote(text, tone = 'muted') {
  const color = tone === 'error' ? UI.danger : MUTED;
  return `<p class="text-xs ${color}">${escapeHtml(text)}</p>`;
}

function audienceBars(items) {
  return `<div class="space-y-3.5">${items.map((i) => `
    <div>
      <div class="flex items-center justify-between text-xs gap-2">
        <span class="text-gray-700 dark:text-gray-200 font-medium truncate">${escapeHtml(i.label)}</span>
        <span class="${MUTED} whitespace-nowrap font-medium">${escapeHtml(i.text)}</span>
      </div>
      <div class="${PROGRESS_TRACK} mt-1.5">
        <div class="${PROGRESS_FILL}" style="width:${Math.max(2, Math.min(100, i.percent || 0)).toFixed(1)}%"></div>
      </div>
    </div>
  `).join('')}</div>`;
}

function audienceCard(title, sec, renderOk) {
  let body;
  if (!sec) body = audienceNote(AUDIENCE_MSG.empty);
  else if (sec.status === AUDIENCE_STATUS.OK) body = renderOk(sec);
  else if (sec.status === AUDIENCE_STATUS.UNAVAILABLE) body = audienceNote(sec.message);
  else if (sec.status === AUDIENCE_STATUS.ERROR) body = audienceNote(sec.message || AUDIENCE_MSG.error, 'error');
  else body = audienceNote(sec.message || AUDIENCE_MSG.empty);

  return `<div class="${CARD} p-5 space-y-3"><p class="text-sm font-semibold text-gray-900 dark:text-white">${escapeHtml(title)}</p>${body}</div>`;
}

function renderAudienceBestDay(sec) {
  let body;
  if (!sec || sec.status !== AUDIENCE_STATUS.OK) {
    const isError = sec && sec.status === AUDIENCE_STATUS.ERROR;
    body = audienceNote((sec && sec.message) || (isError ? AUDIENCE_MSG.error : AUDIENCE_MSG.empty), isError ? 'error' : 'muted');
  } else {
    const max = Math.max(...sec.items.map((i) => i.avgViews), 1);
    body = `
      <p class="text-sm ${TEXT_BODY}">Dia da semana com mais visualizações: <strong class="text-gray-900 dark:text-white">${escapeHtml(sec.best.label)}</strong> (média de ${formatNumber(sec.best.avgViews)} views).</p>
      ${audienceBars(sec.items.map((i) => ({ label: i.index === sec.best.index ? `${i.label} ★` : i.label, text: `${formatNumber(i.avgViews)} views/dia`, percent: (i.avgViews / max) * 100 })))}
      <p class="text-[11px] ${MUTED} mt-2">Análise estatística baseada no histórico do período (${sec.totalDays} dias).</p>`;
  }
  return `<div class="${CARD} p-5 space-y-3"><div class="flex items-center justify-between"><p class="text-sm font-semibold text-gray-900 dark:text-white">Quando seu público assiste</p>${CALC_BADGE}</div>${body}</div>`;
}

function renderEngagementCard() {
  const analytics = state.analytics;
  const isCurrent = analytics.period === state.period && analytics.status === 'ready' && analytics.result;
  const sec = isCurrent ? analytics.result.engagement : null;
  const granularity = state.engagementGranularity;
  const buttons = ENGAGEMENT_GRANULARITIES.map((g) => `
    <button type="button" data-engagement-granularity="${g.key}" aria-pressed="${granularity === g.key}"
      class="${UI.buttonPill} ${granularity === g.key ? UI.buttonPillActive : UI.buttonPillIdle}">${g.label}</button>
  `).join('');

  let body;
  if (!isCurrent) {
    body = audienceNote(AUDIENCE_MSG.loading);
  } else if (!sec || sec.status === AUDIENCE_STATUS.EMPTY) {
    body = audienceNote((sec && sec.message) || 'Sem interações registradas no período.');
  } else if (sec.status === AUDIENCE_STATUS.ERROR) {
    body = audienceNote(sec.message || AUDIENCE_MSG.error, 'error');
  } else if (sec.status !== AUDIENCE_STATUS.OK) {
    body = audienceNote(sec.message || AUDIENCE_MSG.empty);
  } else {
    const buckets = aggregateEngagement(sec, granularity);
    if (buckets.length === 0) {
      body = audienceNote('Sem dados diários de engajamento para este período.');
    } else {
      const totals = sec.totals;
      const max = Math.max(...buckets.map((b) => b.interactions), 1);
      const metric = (label, value) => `
        <div class="${CARD} p-3">
          <p class="text-[10px] ${MUTED} font-medium">${label}</p>
          <p class="text-base font-bold text-gray-900 dark:text-white mt-1">${value}</p>
        </div>
      `;
      body = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${metric('Curtidas', formatNumber(totals.likes))}
          ${metric('Comentários', formatNumber(totals.comments))}
          ${metric('Compartilhamentos', formatNumber(totals.shares))}
          ${metric('Taxa de engajamento', formatPercent(totals.rate))}
        </div>
        <p class="text-xs ${TEXT_BODY}">${formatNumber(totals.interactions)} interações em ${formatNumber(totals.views)} views no período (${sec.days} dias com dados).</p>
        ${audienceBars(buckets.map((b) => ({
          label: b.label,
          text: `${formatNumber(b.interactions)} interações • ${formatPercent(b.rate)}`,
          percent: (b.interactions / max) * 100
        })))}
        <p class="text-[11px] ${MUTED}">Interações = curtidas + comentários + compartilhamentos. Dados do Analytics com atraso de 48–72h.</p>
      `;
    }
  }

  return `
    <div class="${CARD} p-6 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Engajamento por período</h4>
          <p class="text-[11px] ${MUTED} mt-1">Curtidas, comentários e compartilhamentos do canal, agrupados por dia, semana ou mês.</p>
        </div>
        <div class="flex flex-wrap rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs bg-white dark:bg-gray-800" role="group" aria-label="Granularidade do engajamento">
          ${buttons}
        </div>
      </div>
      ${body}
    </div>
  `;
}

export function renderAudience() {
  const a = state.analytics;
  const isCurrent = a.period === state.period && a.status === 'ready' && a.result;
  const subtitleDefault = 'Dados reais do YouTube Analytics do canal conectado.';

  if (!isCurrent) {
    return section('audience', t('section.audience'), subtitleDefault, `
      <div class="${CARD} p-6 flex items-center gap-3" aria-busy="true">
        <span class="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
        <span class="text-sm ${TEXT_BODY} font-medium">${AUDIENCE_MSG.loading}</span>
      </div>
    `);
  }

  const r = a.result;
  if (r.status === AUDIENCE_STATUS.NEEDS_AUTH) {
    return section('audience', t('section.audience'), subtitleDefault, `
      <div class="${CARD} p-8 text-center space-y-4">
        <p class="text-sm ${TEXT_BODY}">${AUDIENCE_MSG.needsAuth}</p>
        <button type="button" id="btn-authorize-analytics" class="${UI.buttonBase} ${UI.buttonPrimary}">Conectar YouTube Analytics</button>
      </div>
    `);
  }

  if (r.status === AUDIENCE_STATUS.ERROR) {
    return section('audience', t('section.audience'), subtitleDefault, `
      <div class="${CARD} p-8 text-center space-y-4">
        <p class="text-sm ${UI.danger} font-medium">${escapeHtml(r.message || AUDIENCE_MSG.error)}</p>
        <button type="button" id="btn-analytics-retry" class="${UI.buttonBase} ${UI.buttonGhost}">Tentar novamente</button>
      </div>
    `);
  }

  const subtitle = `Dados do YouTube Analytics de ${formatIsoDate(r.range.startDate)} a ${formatIsoDate(r.range.endDate)}.`;

  const ageCard = audienceCard('Idade', r.age, (sec) => audienceBars(sec.items.map((i) => ({ label: i.label, text: formatPercent(i.percent), percent: i.percent }))));
  const genderCard = audienceCard('Gênero', r.gender, (sec) => audienceBars(sec.items.map((i) => ({ label: i.label, text: formatPercent(i.percent), percent: i.percent }))));
  const countriesCard = audienceCard('Localização', r.countries, (sec) => audienceBars(sec.items.slice(0, 8).map((i) => ({ label: i.label, text: `${formatPercent(i.percent)} • ${formatNumber(i.views)} views`, percent: i.percent }))));
  const devicesCard = audienceCard('Dispositivos', r.devices, (sec) => audienceBars(sec.items.map((i) => ({ label: i.label, text: `${formatPercent(i.percent)} • ${formatNumber(i.views)} views`, percent: i.percent }))));

  return section('audience', t('section.audience'), subtitle, `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${ageCard}${genderCard}${countriesCard}${devicesCard}
    </div>
    ${renderAudienceBestDay(r.bestDay)}
    ${renderEngagementCard()}
  `);
}

export function renderBestTimes(bestDay, bestTime, bestCombo, sampleSize) {
  if (!bestDay || !bestTime || !bestCombo) {
    return section('times', t('section.times'), null, `<div class="${CARD} p-6 text-sm ${MUTED}">Precisamos de mais vídeos para gerar uma recomendação confiável (mínimo de ${MIN_FOR_TIME_ANALYSIS}, temos ${sampleSize}).</div>`);
  }

  const heatmapRows = WEEKDAY_SHORT.map((dayLabel, dayIdx) => {
    const cells = HOUR_BLOCKS.map((block) => {
      const combo = bestCombo.all.find((c) => c.day === dayIdx && c.block === block.key);
      const intensity = combo ? Math.min(1, combo.avg / (bestCombo.best.avg || 1)) : 0;
      const bg = combo ? `rgba(16, 185, 129, ${0.1 + intensity * 0.7})` : 'transparent';
      return `<td class="w-16 h-10 text-center align-middle border ${UI.divider} rounded-sm" style="background:${bg}" title="${combo ? formatNumber(combo.avg) + ' views médias' : 'Sem dados'}">
        <span class="text-[10px] font-semibold ${combo && intensity > 0.5 ? 'text-white' : MUTED}">${combo ? formatNumber(combo.avg) : '—'}</span>
      </td>`;
    }).join('');
    return `<tr><td class="text-xs font-semibold ${MUTED} pr-3 text-right">${dayLabel}</td>${cells}</tr>`;
  }).join('');

  return section('times', t('section.times'), 'Baseado na data e hora de publicação dos vídeos analisados.', `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="${CARD} p-5"><p class="text-xs ${MUTED} font-medium mb-1">Melhor dia da semana</p><p class="text-xl font-bold text-gray-900 dark:text-white">${escapeHtml(bestDay.best.label)}</p><p class="text-xs ${MUTED} mt-1">Média: ${formatNumber(bestDay.best.avg)} views</p></div>
      <div class="${CARD} p-5"><p class="text-xs ${MUTED} font-medium mb-1">Melhor horário</p><p class="text-xl font-bold text-gray-900 dark:text-white">${escapeHtml(bestTime.best.label)} (${escapeHtml(bestTime.best.range)})</p><p class="text-xs ${MUTED} mt-1">Média: ${formatNumber(bestTime.best.avg)} views</p></div>
      <div class="${CARD} p-5"><p class="text-xs ${MUTED} font-medium mb-1">Pior combinação</p><p class="text-xl font-bold text-gray-900 dark:text-white">${escapeHtml(bestCombo.worst.dayLabel)} • ${escapeHtml(bestCombo.worst.blockLabel)}</p><p class="text-xs ${MUTED} mt-1">Média: ${formatNumber(bestCombo.worst.avg)} views</p></div>
    </div>
    <div class="${CARD} p-6 overflow-x-auto">
      <div class="flex items-center justify-between mb-4"><h4 class="text-sm font-semibold text-gray-900 dark:text-white">Heatmap de horários</h4>${CALC_BADGE}</div>
      <table class="border-collapse"><thead><tr><td></td>${HOUR_BLOCKS.map((b) => `<td class="text-[10px] ${MUTED} font-semibold text-center px-1 pb-2">${escapeHtml(b.label)}</td>`).join('')}</tr></thead><tbody>${heatmapRows}</tbody></table>
    </div>
  `);
}

export function renderRecommendedSchedule(calendar) {
  if (!calendar) {
    return `<div class="${CARD} p-6 text-sm ${MUTED}">Calendário recomendado: coletando dados para gerar recomendações.</div>`;
  }

  const confColor = {
    Alta: 'text-emerald-600 dark:text-emerald-400 font-semibold',
    Média: 'text-amber-600 dark:text-amber-400 font-medium',
    Baixa: MUTED
  };

  const cards = calendar.map((day) => `
    <div class="${CARD} p-4 hover:shadow-md transition-shadow">
      <p class="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">${escapeHtml(day.weekdayLabel)}</p>
      <p class="text-xs ${MUTED} mt-0.5">${day.date.toLocaleDateString('pt-BR')}</p>
      <p class="text-sm font-semibold ${UI.primary} mt-3">${escapeHtml(day.suggestedTime)}</p>
      ${day.theme ? `<p class="text-xs ${TEXT_BODY} mt-1.5">Tema: "<span class="font-medium">${escapeHtml(day.theme)}</span>"</p>` : ''}
      <p class="text-[11px] mt-3 ${confColor[day.confidence] || MUTED}">Confiança: ${escapeHtml(day.confidence)}</p>
    </div>
  `).join('');

  return `<div class="space-y-3"><div class="flex items-center justify-between"><h4 class="text-sm font-semibold text-gray-900 dark:text-white">Calendário recomendado</h4>${CALC_BADGE}</div><div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">${cards}</div></div>`;
}

export function renderScheduler() {
  return section('schedule', 'Publicação no YouTube', 'Envie e agende vídeos diretamente do navegador para o YouTube.', `
    <div id="genfy-publication-root"></div>
  `);
}

export function renderIdeaGenerator(topics) {
  const ideas = generateVideoIdeas(topics);
  const ideaCards = ideas.map((idea) => `
    <div class="${CARD} p-4 border-l-4 border-indigo-500 hover:shadow-md transition-shadow">
      <h4 class="text-sm font-bold text-gray-900 dark:text-white leading-snug mb-2">${escapeHtml(idea.title)}</h4>
      <p class="text-xs ${MUTED}">Baseado no tema de alto desempenho: <strong class="text-gray-700 dark:text-gray-300">"${escapeHtml(idea.basedOn)}"</strong></p>
    </div>
  `).join('');

  return section('ideas', t('section.ideas'), 'Sugestões de títulos baseadas nos temas que mais funcionam no seu canal.', `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${ideaCards}</div>
    <p class="text-[11px] ${MUTED} mt-4">Clique em "+ Agendar" para enviar esta ideia diretamente para o seu Agendador de Conteúdo.</p>
  `);
}

export function renderChecklist() {
  const checklistHtml = CHECKLIST_ITEMS.map((item) => `
    <label class="flex items-start gap-3 p-3.5 rounded-xl border ${UI.border} hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
      <input type="checkbox" class="genfy-checklist-item w-5 h-5 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600" data-key="${item.key}" ${state.checklist[item.key] ? 'checked' : ''} />
      <span class="text-sm ${TEXT_BODY} leading-snug">${escapeHtml(item.label)}</span>
    </label>
  `).join('');

  const completedCount = Object.values(state.checklist).filter(Boolean).length;
  const progress = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  return section('checklist', t('section.checklist'), 'Garanta que nenhum detalhe importante seja esquecido antes de publicar.', `
    <div class="${CARD} p-6">
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Progresso do Vídeo Atual</h4>
        <span id="checklist-progress-label" class="text-sm font-bold ${progress === 100 ? UI.success : UI.primary}">${progress}% Completo</span>
      </div>
      <div class="${PROGRESS_TRACK} mb-6">
        <div id="checklist-progress-fill" class="${PROGRESS_FILL}" style="width:${progress}%"></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${checklistHtml}</div>
      <button id="btn-reset-checklist" class="${UI.buttonBase} ${UI.buttonGhost} text-xs mt-6">Reiniciar Checklist</button>
    </div>
  `);
}

export function renderInsights(insights, recommendations) {
  const insightsBlock = insights.length > 0
    ? `<div class="space-y-3">${insights.map((text) => `
        <div class="${CARD} p-4 flex items-start gap-3.5">
          <span class="mt-0.5 ${UI.primary} flex-shrink-0" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zm0 8v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <p class="text-sm ${TEXT_BODY} leading-relaxed">${escapeHtml(text)}</p>
        </div>
      `).join('')}</div>`
    : `<div class="${CARD} p-6 text-sm ${MUTED}">Ainda não há vídeos suficientes na amostra para gerar insights.</div>`;

  const recsBlock = recommendations.length > 0
    ? `<div class="space-y-3 mt-6">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">O que publicar agora?</h4>
        ${recommendations.map((text) => `<div class="${CARD} p-4 border-l-4 border-emerald-500"><p class="text-sm ${TEXT_BODY} leading-relaxed">${escapeHtml(text)}</p></div>`).join('')}
      </div>`
    : '';

  return section('insights', t('section.insights'), 'Gerados automaticamente a partir dos dados disponíveis.', `${insightsBlock}${recsBlock}`);
}

export function renderTrends(trend, videos) {
  if (!trend) {
    return section('trends', t('section.trends'), null, `<div class="${CARD} p-6 text-sm ${MUTED}">Histórico insuficiente para determinar tendência.</div>`);
  }

  const diffText = trend.diffPct != null ? `${trend.diffPct >= 0 ? '+' : ''}${formatDecimal(trend.diffPct)}%` : '—';
  const diffColor = trend.diffPct != null ? (trend.diffPct >= 0 ? UI.success : UI.danger) : MUTED;

  const sortedByDate = videos.filter(isValidVideo).slice().sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const maxViews = Math.max(...sortedByDate.map(safeViews), 1);

  const line = sortedByDate.map((v) => {
    const pct = Math.max(2, Math.round((safeViews(v) / maxViews) * 100));
    return `<div class="flex-1 flex items-end group relative" title="${escapeHtml(v.title)}: ${formatNumber(safeViews(v))} views">
      <div class="w-full bg-emerald-500 dark:bg-emerald-400 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-300" style="height:${pct}%; min-height:4px;"></div>
    </div>`;
  }).join('');

  return section('trends', t('section.trends'), null, `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="${CARD} p-5"><p class="text-xs ${MUTED} font-medium">Média — vídeos mais antigos (${trend.olderCount})</p><p class="text-xl font-bold text-gray-900 dark:text-white mt-1">${formatNumber(trend.avgOld)}</p></div>
      <div class="${CARD} p-5"><p class="text-xs ${MUTED} font-medium">Média — vídeos mais recentes (${trend.newerCount})</p><p class="text-xl font-bold text-gray-900 dark:text-white mt-1">${formatNumber(trend.avgNew)}</p></div>
      <div class="${CARD} p-5"><p class="text-xs ${MUTED} font-medium">Variação</p><p class="text-xl font-bold ${diffColor} mt-1">${diffText}</p></div>
    </div>
    <div class="${CARD} p-6">
      <div class="flex items-center justify-between mb-4"><h4 class="text-sm font-semibold text-gray-900 dark:text-white">Evolução das visualizações</h4>${CALC_BADGE}</div>
      <div class="flex items-end gap-1 h-32 pt-4 border-b ${UI.divider}">${line}</div>
    </div>
  `);
}

function trendingPublishedLabel(iso) {
  const days = daysSince(iso);
  if (days == null) return '';
  if (days <= 0) return 'Publicado hoje';
  if (days === 1) return 'Publicado ontem';
  return `Publicado há ${days} dias`;
}

function trendingCard(video) {
  const url = escapeHtml(video.url || `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`);
  const thumbnail = escapeHtml(video.thumbnail);
  return `
    <article class="${CARD} overflow-hidden flex flex-col">
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="block bg-gray-100 dark:bg-gray-700">
        <img src="${thumbnail}" alt="" loading="lazy" class="w-full aspect-video object-cover" />
      </a>
      <div class="p-4 flex-1 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-gray-900 dark:text-white hover:underline line-clamp-2">${escapeHtml(video.title)}</a>
          <span class="flex-shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 ${UI.primary}" title="Score heurístico GENFY (velocidade + engajamento)">★ ${video.score}</span>
        </div>
        <p class="text-xs ${MUTED}">${escapeHtml(video.channelTitle)}</p>
        <div class="grid grid-cols-3 gap-2">
          <div><p class="text-[10px] ${MUTED} font-medium">Views</p><p class="text-xs font-semibold text-gray-900 dark:text-white">${formatNumber(video.viewCount)}</p></div>
          <div><p class="text-[10px] ${MUTED} font-medium">Views/hora</p><p class="text-xs font-semibold text-gray-900 dark:text-white">${formatDecimal(video.viewsPerHour, 0)}</p></div>
          <div><p class="text-[10px] ${MUTED} font-medium">Engajamento</p><p class="text-xs font-semibold text-gray-900 dark:text-white">${formatPercent(video.engagementRate)}</p></div>
        </div>
        <p class="text-[11px] ${MUTED} mt-auto">${escapeHtml(trendingPublishedLabel(video.publishedAt))}</p>
      </div>
    </article>
  `;
}

function renderTrendingBody() {
  const tr = state.trending;
  if (tr.status === 'idle' || tr.status === 'loading') {
    return `
      <div class="${CARD} p-6 flex items-center gap-3" aria-busy="true">
        <span class="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
        <span class="text-sm ${TEXT_BODY} font-medium">Buscando vídeos em alta...</span>
      </div>
    `;
  }

  if (tr.status === 'error') {
    return `
      <div class="${CARD} p-8 text-center space-y-3">
        <p class="text-sm ${UI.danger} font-medium">${escapeHtml(tr.error || 'Não foi possível carregar os vídeos em alta.')}</p>
        <button type="button" id="btn-trending-retry" class="${UI.buttonBase} ${UI.buttonGhost}">Tentar novamente</button>
      </div>
    `;
  }

  const result = tr.result;
  const items = result && Array.isArray(result.items) ? result.items : [];
  if (items.length === 0) {
    return `<div class="${CARD} p-8 text-center text-sm ${MUTED}">Nenhum vídeo encontrado para esses filtros. Tente outra região, categoria ou termo.</div>`;
  }

  return `
    ${result.stale || result.warning ? `<p class="text-xs ${UI.warning} bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">${escapeHtml(result.warning || 'Exibindo resultados salvos anteriormente.')}</p>` : ''}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs ${MUTED}">${items.length} vídeo(s) • Score GENFY é uma estimativa heurística, não um dado oficial do YouTube.</p>
      ${result.fetchedAt ? `<p class="text-[11px] ${MUTED}">${escapeHtml(formatRelativeTime(new Date(result.fetchedAt)))}</p>` : ''}
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">${items.map(trendingCard).join('')}</div>
  `;
}

export function renderTrending() {
  const p = state.trendingPrefs;
  const categories = state.trending.categories && state.trending.categories.length
    ? state.trending.categories
    : FALLBACK_CATEGORIES;
  const isRising = p.mode === TRENDING_MODES.rising;
  const categoryOptions = ['<option value="">Todas as categorias</option>']
    .concat(categories.map((c) => `<option value="${escapeHtml(c.id)}" ${p.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`))
    .join('');
  const regionOptions = TRENDING_REGIONS.map((r) => `<option value="${r.code}" ${p.regionCode === r.code ? 'selected' : ''}>${escapeHtml(r.label)} (${r.code})</option>`).join('');

  return section('viral', t('section.viral'), 'Descubra o que está bombando no YouTube e transforme isso em pauta para seu canal.', `
    <div class="${CARD} p-5 space-y-4">
      <div class="flex flex-wrap gap-2">
        <button type="button" data-trending-mode="charts" aria-pressed="${!isRising}" class="${UI.buttonPill} ${!isRising ? UI.buttonPillActive : UI.buttonPillIdle}">Ranking oficial</button>
        <button type="button" data-trending-mode="rising" aria-pressed="${isRising}" class="${UI.buttonPill} ${isRising ? UI.buttonPillActive : UI.buttonPillIdle}">Em alta (busca recente)</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <label class="text-xs ${TEXT_BODY}">
          <span class="block mb-1 ${MUTED}">Região</span>
          <select id="genfy-trending-region" class="${UI.input}">${regionOptions}</select>
        </label>
        <label class="text-xs ${TEXT_BODY}">
          <span class="block mb-1 ${MUTED}">Categoria</span>
          <select id="genfy-trending-category" class="${UI.input}">${categoryOptions}</select>
        </label>
        ${isRising ? `
          <label class="text-xs ${TEXT_BODY}">
            <span class="block mb-1 ${MUTED}">Tema (opcional)</span>
            <input id="genfy-trending-query" type="search" maxlength="100" placeholder="Ex: inteligência artificial" value="${escapeHtml(p.query)}" class="${UI.input}" />
          </label>
        ` : ''}
        <button type="button" id="btn-trending-search" class="${UI.buttonBase} ${UI.buttonPrimary}">Buscar vídeos</button>
      </div>
      <p class="text-[11px] ${MUTED} leading-relaxed">
        ${isRising
          ? 'Busca vídeos publicados nos últimos 7 dias ordenados por views. Usa o bucket de consultas da API (100 buscas/dia) e atualiza o cache a cada 6 horas.'
          : 'Ranking mostPopular da YouTube API (1 unidade de cota). Desde jul/2025 ele cobre principalmente música, filmes e games; para outros nichos use o modo Em alta.'}
      </p>
      ${renderTrendingBody()}
    </div>
  `);
}

export function sortVideos(videos, perf) {
  const list = videos.slice();
  if (state.videoSort === 'views') return list.sort((a, b) => safeViews(b) - safeViews(a));
  if (state.videoSort === 'performance') {
    return list.sort((a, b) => (safeViews(b) / (perf.avg || 1)) - (safeViews(a) / (perf.avg || 1)));
  }
  return list.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

export function renderRecentVideos(videos, perf) {
  if (videos.length === 0) {
    return `<div class="${CARD} p-6 text-sm ${MUTED}">Nenhum vídeo encontrado para este período.</div>`;
  }

  const topicsByVideo = new Map();
  analyzeTopics(videos).forEach((topic) => {
    topic.videos.forEach((v) => {
      if (!topicsByVideo.has(v.id)) topicsByVideo.set(v.id, topic.word);
    });
  });

  const rows = sortVideos(videos, perf).map((v) => {
    const label = performanceLabel(safeViews(v), perf.avg);
    const badgeColor = performanceBadgeClass(label.key);
    const age = daysSince(v.publishedAt);
    return `
      <a href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener noreferrer"
        data-video-row data-search="${escapeHtml(String(v.title || '').toLowerCase())}"
        class="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors border border-transparent hover:${UI.border}">
        <img src="${escapeHtml(v.thumbnail)}" alt="" class="w-28 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-700" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(v.title)}</p>
          <p class="text-sm ${MUTED} mt-1">
            ${formatNumber(safeViews(v))} visualizações
            ${v.publishedAt ? ' • ' + formatDate(v.publishedAt) : ''}
            ${age != null ? ` • há ${age} dia(s)` : ''}
            ${topicsByVideo.has(v.id) ? ` • tema: "<span class="font-medium text-gray-600 dark:text-gray-300">${escapeHtml(topicsByVideo.get(v.id))}</span>"` : ''}
          </p>
        </div>
        <span class="${UI.badgeBase} ${badgeColor} whitespace-nowrap flex-shrink-0">${escapeHtml(label.text)}</span>
      </a>
    `;
  }).join('');

  const sortOption = (value, text) => `<option value="${value}" ${state.videoSort === value ? 'selected' : ''}>${text}</option>`;

  return `
    <div class="${CARD} p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h4 class="font-semibold text-gray-900 dark:text-white">Vídeos recentes</h4>
        <div class="flex flex-wrap items-center gap-2">
          <input id="genfy-video-search" type="search" placeholder="Buscar por título..." class="${UI.input}" />
          <select id="genfy-video-sort" class="${UI.input}">
            ${sortOption('date', 'Mais recentes')}
            ${sortOption('views', 'Mais vistos')}
            ${sortOption('performance', 'Melhor desempenho')}
          </select>
        </div>
      </div>
      <div class="space-y-1.5" id="genfy-video-list">${rows}</div>
      <p id="genfy-video-empty" class="hidden text-sm ${MUTED} py-6 text-center">Nenhum vídeo encontrado para essa busca.</p>
    </div>
  `;
}

export function renderSettings(c, totalSampleCount, filteredCount) {
  const gemini = state.gemini || { apiKey: '', model: DEFAULT_MODEL, models: [] };
  const modelSource = Array.isArray(gemini.models) && gemini.models.length ? gemini.models : AVAILABLE_MODELS;
  const selectedModel = (state.gemini && state.gemini.model) || DEFAULT_MODEL;
  const modelOptions = modelSource.map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === selectedModel ? 'selected' : ''}>${escapeHtml(m.label || m.id)} (${escapeHtml(m.id)})</option>`).join('');

  return section('settings', t('section.settings'), null, `
    <div class="${CARD} p-6 space-y-5">
      <div>
        <p class="text-xs font-medium ${MUTED} mb-1">ID do canal</p>
        <p class="text-sm font-mono break-all ${TEXT_BODY} bg-gray-50 dark:bg-gray-900 p-2 rounded-lg border ${UI.divider}">${escapeHtml(c.id)}</p>
      </div>
      <div>
        <p class="text-xs font-medium ${MUTED} mb-1">Amostra de vídeos disponível</p>
        <p class="text-sm ${TEXT_BODY}">${totalSampleCount} vídeo(s) recente(s) recebido(s) da API • ${filteredCount} no período selecionado</p>
      </div>
      <div>
        <p class="text-xs font-medium ${MUTED} mb-1">Versão da extensão</p>
        <p class="text-sm ${TEXT_BODY}">v${escapeHtml(APP_VERSION)}</p>
      </div>
      <div>
        <p class="text-xs font-medium ${MUTED} mb-1">Atalhos de teclado</p>
        <p class="text-sm ${TEXT_BODY}"><kbd class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 border ${UI.divider} text-xs font-mono">1–4</kbd> trocam o período • <kbd class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 border ${UI.divider} text-xs font-mono">R</kbd> atualiza • <kbd class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 border ${UI.divider} text-xs font-mono">T</kbd> alterna o tema</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <button type="button" id="btn-export-videos" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Exportar vídeos (CSV)</button>
        <button type="button" id="btn-export-json" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Exportar dados (JSON)</button>
      </div>

      <div class="${CARD} p-4 space-y-3">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">GEMINI — ANÁLISE INDIVIDUAL DE VÍDEOS</h4>
        <p class="text-[11px] ${MUTED}">Cole sua chave da API Gemini (Google AI Studio). Ela fica salva apenas neste navegador. A análise é feita sob demanda, pelo botão "Analisar com Gemini" em cada vídeo da seção Conteúdo.</p>
        <div class="flex flex-wrap items-center gap-2">
          <input id="genfy-gemini-key" type="password" placeholder="Cole sua chave da API Gemini" class="${UI.input} flex-1 min-w-[220px]" autocomplete="off" />
          <button type="button" id="btn-save-gemini-key" class="${UI.buttonBase} ${UI.buttonPrimary} text-xs">Salvar chave</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-xs ${TEXT_BODY}">
            <span class="block mb-1 ${MUTED}">Modelo</span>
            <select id="genfy-gemini-model" class="${UI.input}">${modelOptions}</select>
          </label>
          <button type="button" id="btn-detect-gemini-models" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Detectar modelos</button>
          <button type="button" id="btn-test-gemini" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Testar conexão</button>
        </div>
        <p id="genfy-gemini-status" class="text-[11px] ${MUTED}">${gemini.apiKey ? `Chave salva neste navegador. Modelo: ${escapeHtml(selectedModel)}.` : 'Nenhuma chave salva. Gere uma gratuitamente no Google AI Studio.'}</p>
      </div>

      <div id="genfy-mock-backend-host">${renderMockBackendPanel(state.entitlement)}</div>

      <button type="button" id="btn-settings-signout" class="${UI.buttonBase} ${UI.buttonGhost} text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20">Sair da conta conectada</button>
    </div>
  `);
}
