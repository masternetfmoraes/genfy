import { renderSidebar as renderSidebarUI } from '../../components/sidebar.js';
import {
  signIn,
  clearToken,
  getCachedToken,
  restoreSession,
  refreshToken,
  wasSignedIn,
  authorizeAnalytics,
  authorizeComments,
  hasCommentsScope,
  markCommentsNotGranted
} from '../../services/youtube/youtubeAuth.js';
import { loadChannelDashboard } from '../../services/youtube/youtubeService.js';
import { clearTrendingCache, loadTrendingVideos } from '../../services/youtube/youtubeTrendingService.js';
import { loadVideoCategories } from '../../modules/youtube/publishing/services/youtubeMetadataService.js';
import { getCommentThreads } from '../../services/youtube/youtubeApi.js';
import {
  loadAudienceAnalytics,
  clearAnalyticsCache,
  ENGAGEMENT_GRANULARITIES,
  STATUS as ANALYTICS_STATUS
} from '../../services/youtube/youtubeAnalyticsService.js';
import { storageGet, storageSet, storageRemove } from '../../services/storage.js';
import {
  getGeminiApiKey,
  saveGeminiApiKey,
  loadGeminiSettings,
  saveGeminiSettings,
  isLegacyGeminiModel
} from '../../services/ai/geminiConfig.js';
import { analyzeVideo, analyzeChannel, testGeminiConnection, detectGeminiModels } from '../../services/ai/geminiService.js';
import {
  getEntitlement,
  consumeAnalysis,
  setMockPlan,
  resetMockUsage,
  simulateRefund,
  canExport,
  PLAN_FREE,
  PLAN_PRO
} from '../../services/entitlement/entitlementClient.js';
import { applyTheme, nextTheme, THEME_LABEL, watchSystemTheme } from '../../ui/theme.js';
import { UI } from '../../ui/designSystem.js';
import {
  animateCounters,
  skeletonHtml,
  initScrollSpy,
  exportVideosCsv,
  exportAnalysisCsv,
  exportAnalysesCsv,
  exportAnalysisXls,
  exportAnalysisPdf,
  exportAnalysesXls,
  exportAnalysesPdf,
  exportChannelXls,
  exportChannelPdf,
  exportJson
} from './enhancements.js';
import { t } from '../../core/i18n.js';
import { escapeHtml, formatRelativeTime } from '../../core/format.js';
import {
  COMMENT_SORTS,
  COMMENTS_MAX_PAGES_PER_VIDEO,
  COMMENTS_MODAL_PAGE_SIZE,
  groupCommentsByVideo,
  normalizeCommentSnippet
} from '../../core/comments.js';
import {
  CACHE_KEY,
  PREFS_KEY,
  CHECKLIST_KEY,
  PUBLICATIONS_KEY,
  PERIOD_LABELS,
  DEFAULT_CHECKLIST,
  CHECKLIST_ITEMS,
  DEFAULT_REGION_CODE,
  TRENDING_MODES
} from '../../constants.js';
import {
  filterVideosByPeriod,
  calculatePerformance,
  analyzeTopics,
  calculateBestPostingDay,
  calculateBestPostingTime,
  calculateBestCombo,
  calculateConsistency,
  calculateChannelHealth,
  calculateTrend,
  generateInsights,
  generateRecommendations,
  generateVideoIdeas,
  buildRecommendedCalendar
} from '../../core/analysis.js';
import {
  state,
  savePrefs,
  saveChecklist,
  savePublications,
  loadPersistedState,
  resetChecklist,
  normalizeContentSort
} from './state.js';
import { mountPublishing } from '../../modules/youtube/publishing/controller/publishingController.js';
import * as view from './render.js';

const sidebarEl = document.getElementById('sidebar');
const headerEl = document.getElementById('header');
const dashboardRootEl = document.getElementById('dashboard-root');

let lastUpdatedIntervalId = null;
let analyticsRequestId = 0;
let forceAnalytics = false;
let trendingRequestId = 0;
let forceTrending = false;
let entitlementRequestId = 0;
let publishingController = null;

function openMobileSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('-translate-x-full');
  if (ov) ov.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.add('-translate-x-full');
  if (ov) ov.classList.add('hidden');
}

function ensureMainRoot() {
  return dashboardRootEl;
}

function cycleTheme() {
  state.theme = nextTheme(state.theme);
  applyTheme(state.theme);
  savePrefs();
  renderSidebar();
}

function renderSidebar() {
  if (!sidebarEl) return;
  renderSidebarUI(sidebarEl, {
    activeSection: state.activeSection,
    theme: state.theme,
    themeLabel: THEME_LABEL,
    isConnected: state.status === 'connected',
    onNavigate: (id) => {
      state.activeSection = id;
      savePrefs();
      renderSidebar();
      closeMobileSidebar();
      const target = document.getElementById(`genfy-section-${id}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    onToggleTheme: cycleTheme,
    onSignOut: handleSignOut,
    onSignIn: handleSignIn
  });
}

function setPeriod(period) {
  if (state.period === period) return;
  state.period = period;
  state.comments = [];
  state.commentsStatus = 'idle';
  state.commentsError = '';
  state.commentsPage = 1;
  state.commentsModal = { open: false, videoId: '', page: 1 };
  state.commentsLoadedAt = null;
  state.videoGemini = {};
  state.channelGemini = { open: false, status: 'idle', text: '', error: '', model: '', analyzedAt: '' };
  state.contentPage = 1;
  state.contentSearch = '';
  savePrefs();
  renderHeader();
  if (state.status === 'connected') renderConnected();
}

function renderHeader() {
  if (!headerEl) return;
  const c = state.channel;
  const isConnected = state.status === 'connected' && c;

  headerEl.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <button type="button" id="btn-mobile-menu" class="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0" aria-label="Menu">☰</button>
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white truncate">
            ${isConnected ? escapeHtml(c.title) : t('app.dashboardTitle')}
          </h2>
          <p class="text-xs ${UI.muted}" id="genfy-last-updated">
            ${state.lastUpdated ? escapeHtml(formatRelativeTime(state.lastUpdated)) : t('app.intelligence')}
          </p>
        </div>
      </div>

      ${isConnected ? `
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-1.5 text-xs">
            <span class="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true"></span>
            <span class="${UI.textBody} font-medium">${t('header.connected')}</span>
          </div>
          ${view.renderPeriodSwitcher()}
          <button type="button" id="btn-refresh" class="${UI.buttonSecondary}" title="Atalho: R">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-4.9M20 14a8 8 0 01-14 4.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            ${t('header.refresh')}
          </button>
        </div>
      ` : ''}
    </div>
  `;

  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', handleRefresh);
}

function clearMain() {
  if (publishingController) {
    publishingController.destroy();
    publishingController = null;
  }
  const root = ensureMainRoot();
  if (root) root.innerHTML = '';
  if (lastUpdatedIntervalId) {
    clearInterval(lastUpdatedIntervalId);
    lastUpdatedIntervalId = null;
  }
}

function renderSignedOut() {
  clearMain();
  const root = ensureMainRoot();
  if (!root) return;
  const wrapper = document.createElement('div');
  wrapper.className = `${UI.font} ${UI.card} p-10 text-center`;
  wrapper.innerHTML = `
    <h3 class="text-xl font-semibold mb-2 text-gray-900 dark:text-white">${t('auth.title')}</h3>
    <p class="${UI.textBody} mb-6 max-w-md mx-auto">${t('auth.description')}</p>
    <button type="button" id="btn-signin" class="${UI.buttonBase} ${UI.buttonPrimary}">${t('auth.signIn')}</button>
  `;
  root.appendChild(wrapper);
  document.getElementById('btn-signin').addEventListener('click', handleSignIn);
}

function buildStatusBlock(message) {
  const el = document.createElement('div');
  el.className = `${UI.font} ${UI.card} p-10 flex items-center justify-center gap-3`;
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `
    <span class="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
    <span class="text-gray-600 dark:text-gray-300 font-medium">${escapeHtml(message)}</span>
  `;
  return el;
}

function renderAuthenticating() {
  clearMain();
  const root = ensureMainRoot();
  if (!root) return;
  root.appendChild(buildStatusBlock(t('auth.connecting')));
}

function renderLoading() {
  clearMain();
  const root = ensureMainRoot();
  if (!root) return;
  root.innerHTML = `<div class="${UI.font}">${skeletonHtml()}</div>`;
}

function renderError() {
  clearMain();
  const root = ensureMainRoot();
  if (!root) return;
  const wrapper = document.createElement('div');
  wrapper.className = `${UI.font} ${UI.card} p-10 text-center`;
  wrapper.innerHTML = `
    <h3 class="text-xl font-semibold mb-2 text-rose-600 dark:text-rose-400">${t('error.title')}</h3>
    <p class="${UI.textBody} mb-6">${escapeHtml(state.errorMessage)}</p>
    <button type="button" id="btn-retry" class="${UI.buttonBase} ${UI.buttonDanger}">${t('error.retry')}</button>
  `;
  root.appendChild(wrapper);
  document.getElementById('btn-retry').addEventListener('click', handleRetry);
}

function renderConnected() {
  clearMain();
  const root = ensureMainRoot();
  if (!root) return;

  const c = state.channel;
  const allVideos = (c.recentVideos || []).filter((v) => v && v.id);
  const videos = filterVideosByPeriod(allVideos, state.period);

  const perf = calculatePerformance(videos);
  const topics = analyzeTopics(videos);
  const bestDay = calculateBestPostingDay(videos);
  const bestTime = calculateBestPostingTime(videos);
  const bestCombo = calculateBestCombo(videos);
  const consistency = calculateConsistency(videos);
  const health = calculateChannelHealth(videos, consistency);
  const trend = calculateTrend(videos);
  const insights = generateInsights({ videos, topics, bestDay, bestTime, perf, trend });
  const recommendations = generateRecommendations(topics);
  const calendar = buildRecommendedCalendar(bestCombo, topics);

  root.innerHTML = `
    <div class="${UI.font} space-y-8">
      ${view.renderOverview({ c, videos, perf, health, trend })}
      ${view.renderTechAnalysis(videos, perf)}
      ${view.renderTrending()}
      ${view.renderTopContent(videos, perf)}
      ${view.renderContentOpportunities(topics)}
      ${view.renderAudience()}
      ${view.renderBestTimes(bestDay, bestTime, bestCombo, videos.length)}
      ${view.renderRecommendedSchedule(calendar)}
      ${view.renderScheduler()}
      ${view.renderIdeaGenerator(topics)}
      ${view.renderChecklist()}
      ${view.renderInsights(insights, recommendations)}
      ${view.renderTrends(trend, videos)}
      ${view.renderSettings(c, allVideos.length, videos.length)}
    </div>
  `;

  wireConnectedListeners();
  mountPublishingSection();
  startLastUpdatedTicker();
  animateCounters(root);
  startScrollSpy();
  ensureAnalytics();
  ensureTrending();
}

function mountPublishingSection() {
  const el = document.getElementById('genfy-publication-root');
  if (!el) return;
  publishingController = mountPublishing(el, { getToken: getCachedToken });
}

function startScrollSpy() {
  initScrollSpy((id) => {
    if (state.activeSection !== id) {
      state.activeSection = id;
      renderSidebar();
    }
  });
}

function refreshAudienceSection() {
  const el = document.getElementById('genfy-section-audience');
  if (!el) return;
  el.outerHTML = view.renderAudience();
  wireAudienceListeners();
  startScrollSpy();
}

function resetAnalyticsState() {
  analyticsRequestId++;
  state.analytics = { period: null, status: 'idle', result: null };
}

function ensureAnalytics() {
  if (state.status !== 'connected' || !state.channel || !getCachedToken()) return;
  const a = state.analytics;
  if (!forceAnalytics && a.period === state.period && (a.status === 'loading' || a.status === 'ready')) return;

  const period = state.period;
  const force = forceAnalytics;
  forceAnalytics = false;
  const requestId = ++analyticsRequestId;
  state.analytics = { period, status: 'loading', result: null };

  loadAudienceAnalytics({
    period,
    channelId: state.channel.id,
    channelPublishedAt: state.channel.publishedAt,
    force
  })
    .then((result) => {
      if (requestId !== analyticsRequestId) return;
      state.analytics = { period, status: 'ready', result };
      refreshAudienceSection();
    })
    .catch((err) => {
      console.error('[GENFY] Falha inesperada no Analytics:', err && err.message);
      if (requestId !== analyticsRequestId) return;
      state.analytics = {
        period,
        status: 'ready',
        result: { status: ANALYTICS_STATUS.ERROR, message: 'Não foi possível carregar os dados do YouTube Analytics.' }
      };
      refreshAudienceSection();
    });
}

async function handleAuthorizeAnalytics() {
  const btn = document.getElementById('btn-authorize-analytics');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Aguardando autorização...';
  }
  try {
    await authorizeAnalytics();
    resetAnalyticsState();
    forceAnalytics = true;
    ensureAnalytics();
  } catch (err) {
    console.warn('[GENFY] Autorização do Analytics:', err && err.message);
    analyticsRequestId++;
    state.analytics = {
      period: state.period,
      status: 'ready',
      result: { status: ANALYTICS_STATUS.NEEDS_AUTH, message: err.message }
    };
    refreshAudienceSection();
  }
}

function handleAnalyticsRetry() {
  resetAnalyticsState();
  forceAnalytics = true;
  ensureAnalytics();
  refreshAudienceSection();
}

function wireAudienceListeners() {
  const authBtn = document.getElementById('btn-authorize-analytics');
  if (authBtn) authBtn.addEventListener('click', handleAuthorizeAnalytics);
  const retryBtn = document.getElementById('btn-analytics-retry');
  if (retryBtn) retryBtn.addEventListener('click', handleAnalyticsRetry);

  document.querySelectorAll('[data-engagement-granularity]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const granularity = btn.getAttribute('data-engagement-granularity');
      if (!ENGAGEMENT_GRANULARITIES.some((g) => g.key === granularity)) return;
      if (state.engagementGranularity === granularity) return;
      state.engagementGranularity = granularity;
      savePrefs();
      refreshAudienceSection();
    });
  });
}

function resetTrendingState() {
  trendingRequestId++;
  state.trending = {
    key: '',
    status: 'idle',
    result: null,
    categories: state.trending.categories,
    error: ''
  };
}

function refreshTrendingSection() {
  const el = document.getElementById('genfy-section-viral');
  if (!el) return;
  el.outerHTML = view.renderTrending();
  wireTrendingListeners();
  startScrollSpy();
}

async function ensureTrending() {
  if (state.status !== 'connected') return;
  const token = getCachedToken();
  if (!token) return;

  const prefs = state.trendingPrefs;
  const key = [
    prefs.mode,
    prefs.regionCode,
    prefs.categoryId,
    prefs.query.trim().toLowerCase()
  ].join('|');
  const current = state.trending;
  if (!forceTrending && current.key === key && (current.status === 'loading' || current.status === 'ready')) return;

  const force = forceTrending;
  forceTrending = false;
  const requestId = ++trendingRequestId;
  state.trending = { ...current, key, status: 'loading', error: '' };
  refreshTrendingSection();

  try {
    const [result, categories] = await Promise.all([
      loadTrendingVideos(token, { ...prefs, force }),
      loadVideoCategories(token, { regionCode: prefs.regionCode })
    ]);
    if (requestId !== trendingRequestId) return;
    state.trending = { key, status: 'ready', result, categories, error: '' };
  } catch (err) {
    console.warn('[GENFY] Falha ao carregar vídeos em alta:', err && err.message);
    if (requestId !== trendingRequestId) return;
    state.trending = {
      key,
      status: 'error',
      result: null,
      categories: current.categories,
      error: err && err.message ? err.message : 'Não foi possível carregar os vídeos em alta.'
    };
  }
  refreshTrendingSection();
}

function handleTrendingSearch() {
  const regionEl = document.getElementById('genfy-trending-region');
  const categoryEl = document.getElementById('genfy-trending-category');
  const queryEl = document.getElementById('genfy-trending-query');
  if (regionEl && regionEl.value) state.trendingPrefs.regionCode = regionEl.value;
  if (categoryEl) state.trendingPrefs.categoryId = categoryEl.value || '';
  if (queryEl) state.trendingPrefs.query = queryEl.value.trim().slice(0, 100);
  savePrefs();
  forceTrending = true;
  ensureTrending();
}

function wireTrendingListeners() {
  document.querySelectorAll('[data-trending-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-trending-mode');
      if ((mode !== TRENDING_MODES.charts && mode !== TRENDING_MODES.rising) || state.trendingPrefs.mode === mode) return;
      state.trendingPrefs.mode = mode;
      savePrefs();
      refreshTrendingSection();
      ensureTrending();
    });
  });

  const regionEl = document.getElementById('genfy-trending-region');
  if (regionEl) {
    regionEl.addEventListener('change', () => {
      state.trendingPrefs.regionCode = regionEl.value || DEFAULT_REGION_CODE;
      state.trendingPrefs.categoryId = '';
      savePrefs();
      ensureTrending();
    });
  }

  const categoryEl = document.getElementById('genfy-trending-category');
  if (categoryEl) {
    categoryEl.addEventListener('change', () => {
      state.trendingPrefs.categoryId = categoryEl.value || '';
      savePrefs();
      ensureTrending();
    });
  }

  const searchBtn = document.getElementById('btn-trending-search');
  if (searchBtn) searchBtn.addEventListener('click', handleTrendingSearch);

  const queryEl = document.getElementById('genfy-trending-query');
  if (queryEl) {
    queryEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      handleTrendingSearch();
    });
  }

  const retryBtn = document.getElementById('btn-trending-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      forceTrending = true;
      ensureTrending();
    });
  }
}

function exportAllowed(format) {
  return canExport(state.entitlement && state.entitlement.data, format);
}

function setEntitlement(entry) {
  state.entitlement = entry;
  if (state.status === 'connected') updateEntitlementUi();
}

function hasAnalysisQuota() {
  const data = state.entitlement.data;
  return !data || data.remaining === null || data.remaining > 0;
}

async function chargeAnalysis() {
  try {
    const data = await consumeAnalysis(getCachedToken());
    setEntitlement({ status: 'ready', data, error: '' });
    return true;
  } catch (err) {
    setEntitlement({
      status: 'error',
      data: state.entitlement.data,
      error: (err && err.message) || 'Falha ao registrar o uso da análise.'
    });
    return false;
  }
}

async function ensureEntitlement(token) {
  const requestId = ++entitlementRequestId;
  const previous = state.entitlement.data;
  setEntitlement({ status: 'loading', data: previous, error: '' });
  try {
    const data = await getEntitlement(token);
    if (requestId !== entitlementRequestId) return;
    setEntitlement({ status: 'ready', data, error: '' });
  } catch (err) {
    if (requestId !== entitlementRequestId) return;
    setEntitlement({
      status: 'error',
      data: previous || null,
      error: (err && err.message) || 'Falha ao consultar o plano.'
    });
  }
}

function updateExportButtons() {
  const channelReady = state.channelGemini && state.channelGemini.status === 'ready' && !!state.channelGemini.text;
  const analysesReady = getAnalysisEntries().length > 0;
  const targets = [
    ['btn-export-analyses-xls', 'xls', analysesReady],
    ['btn-export-analyses-pdf', 'pdf', analysesReady],
    ['btn-export-channel-xls', 'xls', channelReady],
    ['btn-export-channel-pdf', 'pdf', channelReady]
  ];
  targets.forEach(([id, format, baseReady]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const enabled = baseReady && exportAllowed(format);
    btn.disabled = !enabled;
    btn.classList.toggle('opacity-50', !enabled);
    btn.classList.toggle('cursor-not-allowed', !enabled);
  });
  ['xls', 'pdf'].forEach((format) => {
    const enabled = exportAllowed(format);
    document.querySelectorAll(`[data-export-analysis-${format}]`).forEach((btn) => {
      btn.disabled = !enabled;
      btn.classList.toggle('opacity-50', !enabled);
      btn.classList.toggle('cursor-not-allowed', !enabled);
    });
  });
}

function updateEntitlementUi() {
  const bannerHost = document.getElementById('genfy-entitlement-banner-host');
  if (bannerHost) bannerHost.innerHTML = view.renderEntitlementBanner(state.entitlement);
  const mockHost = document.getElementById('genfy-mock-backend-host');
  if (mockHost) mockHost.innerHTML = view.renderMockBackendPanel(state.entitlement);
  updateExportButtons();
  wireEntitlementListeners();
}

function wireEntitlementListeners() {
  const actions = [
    ['btn-mock-plan-pro', () => setMockPlan(getCachedToken(), PLAN_PRO)],
    ['btn-mock-plan-free', () => setMockPlan(getCachedToken(), PLAN_FREE)],
    ['btn-mock-reset-usage', () => resetMockUsage(getCachedToken())],
    ['btn-mock-refund', () => simulateRefund(getCachedToken())]
  ];
  actions.forEach(([id, action]) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.entitlementWired === '1') return;
    btn.dataset.entitlementWired = '1';
    btn.addEventListener('click', async () => {
      try {
        const data = await action();
        setEntitlement({ status: 'ready', data, error: '' });
        const status = document.getElementById('genfy-mock-status');
        if (status) status.textContent = 'Plano simulado atualizado.';
      } catch (err) {
        const status = document.getElementById('genfy-mock-status');
        if (status) status.textContent = (err && err.message) || 'Falha ao atualizar o plano simulado.';
      }
    });
  });
}

function isShortVideo(video) {
  const d = video && video.durationSeconds;
  return typeof d === 'number' && d > 0 && d <= 60;
}

function setGeminiStatus(message, isError = false) {
  const el = document.getElementById('genfy-gemini-status');
  if (!el) return;
  el.textContent = message;
  el.className = `text-[11px] ${isError ? UI.danger : UI.muted}`;
}

function setGeminiEntry(videoId, patch) {
  const current = (state.videoGemini && state.videoGemini[videoId]) || {};
  state.videoGemini = { ...(state.videoGemini || {}), [videoId]: { ...current, ...patch } };
}

async function handleGeminiVideoAnalysis(videoId, { force = false } = {}) {
  const videos = (state.channel && state.channel.recentVideos) || [];
  const video = videos.find((v) => v && v.id === videoId);
  if (!video) return;
  const current = (state.videoGemini && state.videoGemini[videoId]) || {};
  if (!force && current.status === 'ready' && current.text) {
    setGeminiEntry(videoId, { open: true });
    renderConnected();
    return;
  }

  if (!hasAnalysisQuota()) {
    setGeminiEntry(videoId, {
      open: true,
      status: 'error',
      text: '',
      error: 'Limite de 5 análises IA atingido neste mês. Assine o Pro para continuar.'
    });
    renderConnected();
    return;
  }

  setGeminiEntry(videoId, { open: true, status: 'loading', text: '', error: '' });
  renderConnected();
  try {
    const avgViews = (calculatePerformance(filterVideosByPeriod(videos, state.period)) || {}).avg || 0;
    const result = await analyzeVideo({ video, channel: state.channel, avgViews });
    if (result.ok) {
      const charged = await chargeAnalysis();
      if (!charged) {
        setGeminiEntry(videoId, {
          open: true,
          status: 'error',
          text: '',
          error: 'Não foi possível registrar o uso desta análise. Verifique seu plano.'
        });
        renderConnected();
        return;
      }
      setGeminiEntry(videoId, {
        open: true,
        status: 'ready',
        text: result.text,
        error: '',
        model: result.model || '',
        analyzedAt: new Date().toISOString()
      });
    } else {
      setGeminiEntry(videoId, {
        open: true,
        status: 'error',
        text: '',
        error: (result.error && result.error.userMessage) || 'Falha ao analisar com Gemini.'
      });
    }
  } catch (err) {
    setGeminiEntry(videoId, {
      open: true,
      status: 'error',
      text: '',
      error: (err && err.message) || 'Falha ao analisar com Gemini.'
    });
  }
  renderConnected();
}

function getAnalysisEntries() {
  const videos = (state.channel && state.channel.recentVideos) || [];
  return filterVideosByPeriod(videos, state.period)
    .filter((video) => {
      const entry = state.videoGemini && state.videoGemini[video.id];
      return entry && entry.status === 'ready' && entry.text;
    })
    .map((video) => ({ video, analysis: state.videoGemini[video.id] }));
}

function getChannelAnalysisContext() {
  const allVideos = (state.channel && state.channel.recentVideos) || [];
  const videos = filterVideosByPeriod(allVideos, state.period);
  const perf = calculatePerformance(videos);
  const topics = analyzeTopics(videos);
  const bestDay = calculateBestPostingDay(videos);
  const bestTime = calculateBestPostingTime(videos);
  const bestCombo = calculateBestCombo(videos);
  const consistency = calculateConsistency(videos);
  const health = calculateChannelHealth(videos, consistency);
  const trend = calculateTrend(videos);
  const insights = generateInsights({ videos, topics, bestDay, bestTime, perf, trend });
  const recommendations = generateRecommendations(topics);

  return {
    channel: state.channel || {},
    periodLabel: PERIOD_LABELS[state.period] || state.period,
    videos,
    perf,
    topics,
    bestDay,
    bestTime,
    bestCombo,
    consistency,
    health,
    trend,
    insights,
    recommendations,
    ideas: generateVideoIdeas(topics)
  };
}

function setChannelGemini(patch) {
  state.channelGemini = { ...(state.channelGemini || {}), ...patch };
}

function getChannelReport() {
  const report = state.channelGemini || {};
  return {
    channelTitle: (state.channel && state.channel.title) || '',
    periodLabel: PERIOD_LABELS[state.period] || state.period,
    model: report.model || '',
    analyzedAt: report.analyzedAt || '',
    text: report.text || ''
  };
}

function updateChannelModal() {
  const modal = document.getElementById('genfy-channel-ai-modal');
  if (!modal) return;
  const body = document.getElementById('genfy-channel-ai-body');
  if (body) body.innerHTML = view.renderChannelModalBody();

  const report = state.channelGemini || {};
  const hasText = report.status === 'ready' && !!report.text;
  ['btn-export-channel-xls', 'btn-export-channel-pdf'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const enabled = hasText && exportAllowed(id.endsWith('xls') ? 'xls' : 'pdf');
    btn.disabled = !enabled;
    btn.classList.toggle('opacity-50', !enabled);
    btn.classList.toggle('cursor-not-allowed', !enabled);
  });
}

function openChannelModal() {
  setChannelGemini({ open: true });
  const modal = document.getElementById('genfy-channel-ai-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  updateChannelModal();
}

function closeChannelModal() {
  setChannelGemini({ open: false });
  const modal = document.getElementById('genfy-channel-ai-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function closeCommentsModal() {
  state.commentsModal = { open: false, videoId: '', page: 1 };
  renderConnected();
}

async function handleChannelAnalysis() {
  const ctx = getChannelAnalysisContext();
  if (!ctx.videos.length) return;

  if (!hasAnalysisQuota()) {
    setChannelGemini({
      open: true,
      status: 'error',
      text: '',
      error: 'Limite de 5 análises IA atingido neste mês. Assine o Pro para continuar.',
      model: '',
      analyzedAt: ''
    });
    openChannelModal();
    return;
  }

  setChannelGemini({ open: true, status: 'loading', text: '', error: '', model: '', analyzedAt: '' });
  openChannelModal();
  try {
    const result = await analyzeChannel(ctx);
    if (result.ok) {
      const charged = await chargeAnalysis();
      if (!charged) {
        setChannelGemini({
          open: true,
          status: 'error',
          text: '',
          error: 'Não foi possível registrar o uso desta análise. Verifique seu plano.',
          model: '',
          analyzedAt: ''
        });
        updateChannelModal();
        return;
      }
      setChannelGemini({
        open: true,
        status: 'ready',
        text: result.text,
        error: '',
        model: result.model || '',
        analyzedAt: new Date().toISOString()
      });
    } else {
      setChannelGemini({
        open: true,
        status: 'error',
        text: '',
        error: (result.error && result.error.userMessage) || 'Falha ao analisar o canal com Gemini.'
      });
    }
  } catch (err) {
    setChannelGemini({
      open: true,
      status: 'error',
      text: '',
      error: (err && err.message) || 'Falha ao analisar o canal com Gemini.'
    });
  }
  updateChannelModal();
}

function fillGeminiModelSelect(models, selected) {
  const select = document.getElementById('genfy-gemini-model');
  if (!select || !Array.isArray(models) || !models.length) return;
  select.innerHTML = models.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label || m.id)} (${escapeHtml(m.id)})</option>`).join('');
  const target = models.some((m) => m.id === selected) ? selected : models[0].id;
  select.value = target;
  state.gemini.model = target;
  saveGeminiSettings({ model: target }).catch(() => {});
}

async function populateGeminiSettings() {
  try {
    const [apiKey, settings] = await Promise.all([getGeminiApiKey(), loadGeminiSettings()]);
    state.gemini.apiKey = apiKey;
    state.gemini.model = settings.model;
    const input = document.getElementById('genfy-gemini-key');
    if (input && !input.value && apiKey) input.value = apiKey;
    const select = document.getElementById('genfy-gemini-model');
    if (select) {
      if (![...select.options].some((option) => option.value === settings.model)) {
        const option = document.createElement('option');
        option.value = settings.model;
        option.textContent = `${settings.model} (salvo)`;
        select.appendChild(option);
      }
      select.value = settings.model;
    }
    setGeminiStatus(apiKey
      ? `Chave salva neste navegador. Modelo: ${settings.model}.`
      : 'Nenhuma chave salva. Gere uma gratuitamente no Google AI Studio.');
  } catch {}
}

async function handleSaveGeminiKey() {
  const input = document.getElementById('genfy-gemini-key');
  const key = (input && input.value ? input.value : '').trim();
  await saveGeminiApiKey(key);
  state.gemini.apiKey = key;
  setGeminiStatus(key ? 'Chave salva localmente neste navegador.' : 'Chave removida.');
}

async function handleDetectGeminiModels(btn) {
  const input = document.getElementById('genfy-gemini-key');
  const apiKeyOverride = input && input.value ? input.value.trim() : undefined;
  if (btn) btn.disabled = true;
  setGeminiStatus('Detectando modelos disponíveis para esta chave...');
  try {
    const res = await detectGeminiModels({ apiKey: apiKeyOverride });
    if (!res.ok) {
      setGeminiStatus((res.error && res.error.userMessage) || 'Não foi possível listar modelos.', true);
      return;
    }
    const models = (res.models || []).filter((m) => m && m.id && !isLegacyGeminiModel(m.id));
    if (!models.length) {
      setGeminiStatus('Nenhum modelo compatível encontrado para esta chave.', true);
      return;
    }
    state.gemini.models = models;
    const preferred = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];
    const chosen = preferred.find((id) => models.some((m) => m.id === id)) || models[0].id;
    fillGeminiModelSelect(models, chosen);
    setGeminiStatus(`${models.length} modelo(s) detectado(s). Modelo selecionado: ${chosen}.`);
  } catch (err) {
    setGeminiStatus((err && err.message) || 'Falha ao detectar modelos.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleTestGeminiConnection(btn) {
  const input = document.getElementById('genfy-gemini-key');
  const select = document.getElementById('genfy-gemini-model');
  if (btn) btn.disabled = true;
  setGeminiStatus('Testando conexão com o Gemini...');
  try {
    const res = await testGeminiConnection({
      apiKey: input && input.value ? input.value.trim() : undefined,
      model: select && select.value ? select.value : undefined
    });
    setGeminiStatus(res.message || (res.ok ? 'Conexão bem-sucedida.' : 'Falha no teste.'), !res.ok);
  } catch (err) {
    setGeminiStatus((err && err.message) || 'Falha no teste de conexão.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function fetchAllVideoComments(accessToken, video) {
  const items = [];
  const seen = new Set();
  const videoIsShort = isShortVideo(video);
  let pageToken = '';
  let truncated = false;

  for (let page = 0; page < COMMENTS_MAX_PAGES_PER_VIDEO; page++) {
    const res = await getCommentThreads(accessToken, {
      videoId: video.id,
      order: 'time',
      maxResults: 100,
      pageToken: pageToken || undefined,
      withReplies: true
    });
    const threads = (res && res.items) || [];

    threads.forEach((thread) => {
      const snippet = thread.snippet || {};
      const top = snippet.topLevelComment || {};
      const topId = top.id || '';
      const comment = normalizeCommentSnippet(top.snippet, video, {
        id: topId,
        videoIsShort,
        replyCount: snippet.totalReplyCount || 0
      });
      if (comment && !seen.has(comment.id)) {
        items.push(comment);
        seen.add(comment.id);
      }
      const replies = (thread.replies && thread.replies.comments) || [];
      replies.forEach((reply) => {
        const item = normalizeCommentSnippet(reply.snippet, video, {
          id: reply.id || '',
          videoIsShort,
          isReply: true,
          parentId: topId
        });
        if (item && !seen.has(item.id)) {
          items.push(item);
          seen.add(item.id);
        }
      });
    });

    pageToken = (res && res.nextPageToken) || '';
    if (!pageToken || !threads.length) break;
    if (page === COMMENTS_MAX_PAGES_PER_VIDEO - 1) truncated = true;
  }

  return { items, truncated };
}

async function loadContentComments() {
  let token = getCachedToken();
  if (!state.channel || !token) return;
  const videos = filterVideosByPeriod(
    (state.channel.recentVideos || []).filter((v) => v && v.id),
    state.period
  );
  if (!videos.length) return;

  state.commentsStatus = 'loading';
  state.commentsError = '';
  state.comments = [];
  state.commentsPage = 1;
  state.commentsModal = { open: false, videoId: '', page: 1 };
  state.commentsLoadedAt = null;
  renderConnected();

  if (!hasCommentsScope()) {
    try {
      await authorizeComments();
      token = getCachedToken();
    } catch (err) {
      state.commentsStatus = 'error';
      state.commentsError = (err && err.message) || 'Não foi possível autorizar a leitura de comentários.';
      renderConnected();
      return;
    }
  }

  const collected = [];
  const failed = [];
  let truncated = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await fetchAllVideoComments(token, video);
        break;
      } catch (err) {
        lastError = err;
        if (err && err.status === 401 && attempt === 0) {
          const fresh = await refreshToken();
          if (fresh && fresh !== token) {
            token = fresh;
            continue;
          }
        }
        break;
      }
    }

    if (result) {
      collected.push(...result.items);
      if (result.truncated) truncated++;
    } else {
      if (lastError && lastError.status === 403 && /insufficientPermissions/i.test(lastError.reason || '')) {
        markCommentsNotGranted();
        state.commentsStatus = 'error';
        state.commentsError = 'Permissão para ler comentários não concedida. Clique em "Carregar comentários" para autorizar.';
        renderConnected();
        return;
      }
      if (lastError && /quota|dailyLimit/i.test(lastError.reason || '')) {
        state.commentsStatus = 'error';
        state.commentsError = lastError.message || 'Cota da YouTube API excedida.';
        renderConnected();
        return;
      }
      failed.push({
        title: video.title || video.id,
        message: (lastError && lastError.message) || 'Falha na chamada.'
      });
    }
  }

  state.comments = collected;
  state.commentsLoadedAt = new Date();
  state.commentsStatus = collected.length ? 'ready' : 'error';
  const notes = [];
  if (failed.length) notes.push(`${failed.length} vídeo(s) falharam: ${failed[0].message}`);
  if (truncated) notes.push(`${truncated} vídeo(s) atingiram o limite de páginas da API.`);
  state.commentsError = notes.join(' ') || (!collected.length ? 'Nenhum comentário pôde ser carregado.' : '');
  renderConnected();
}

function updateChecklistProgress() {
  const completed = Object.values(state.checklist).filter(Boolean).length;
  const pct = Math.round((completed / CHECKLIST_ITEMS.length) * 100);
  const fill = document.getElementById('checklist-progress-fill');
  const label = document.getElementById('checklist-progress-label');
  if (fill) fill.style.width = `${pct}%`;
  if (label) {
    label.textContent = `${pct}% Completo`;
    label.className = `text-sm font-bold ${pct === 100 ? UI.success : UI.primary}`;
  }
}

function wireConnectedListeners() {
  wireAudienceListeners();
  wireTrendingListeners();

  const signOutBtn = document.getElementById('btn-settings-signout');
  if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);

  document.querySelectorAll('[data-content-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-content-tab');
      if (!tab || state.contentTab === tab) return;
       state.contentTab = tab;
       state.videoGemini = {};
       state.channelGemini = { open: false, status: 'idle', text: '', error: '', model: '', analyzedAt: '' };
       state.contentPage = 1;
       state.contentSearch = '';
       savePrefs();
       renderConnected();
    });
  });

  document.querySelectorAll('[data-comments-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sort = btn.getAttribute('data-comments-sort');
      if (!sort || !COMMENT_SORTS.includes(sort) || state.commentsSort === sort) return;
      state.commentsSort = sort;
      state.commentsPage = 1;
      state.commentsModal = { open: false, videoId: '', page: 1 };
      savePrefs();
      renderConnected();
    });
  });

  const loadCommentsBtn = document.getElementById('btn-load-comments');
  if (loadCommentsBtn) loadCommentsBtn.addEventListener('click', loadContentComments);

  document.querySelectorAll('[data-comments-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.getAttribute('data-comments-page'), 10);
      if (!Number.isFinite(page)) return;
      state.commentsPage = page;
      state.commentsModal = { open: false, videoId: '', page: 1 };
      renderConnected();
    });
  });

  document.querySelectorAll('[data-comments-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const videoId = btn.getAttribute('data-comments-modal');
      if (!videoId) return;
      state.commentsModal = { open: true, videoId, page: 1 };
      renderConnected();
    });
  });

  const closeCommentsBtn = document.getElementById('genfy-comments-modal-close');
  if (closeCommentsBtn) closeCommentsBtn.addEventListener('click', closeCommentsModal);

  const commentsBackdrop = document.getElementById('genfy-comments-modal-backdrop');
  if (commentsBackdrop) commentsBackdrop.addEventListener('click', closeCommentsModal);

  document.querySelectorAll('[data-comments-modal-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const direction = btn.getAttribute('data-comments-modal-page');
      if (direction !== 'prev' && direction !== 'next') return;
      const modal = state.commentsModal || {};
      const group = groupCommentsByVideo(state.comments).find((g) => g.videoId === modal.videoId);
      if (!group) return;
      const totalPages = Math.max(1, Math.ceil(group.comments.length / COMMENTS_MODAL_PAGE_SIZE));
      const page = Math.min(
        Math.max((Number(modal.page) || 1) + (direction === 'next' ? 1 : -1), 1),
        totalPages
      );
      state.commentsModal = { ...modal, page };
      renderConnected();
    });
  });

  const contentSortEl = document.getElementById('genfy-content-sort');
  if (contentSortEl) {
    contentSortEl.value = normalizeContentSort(state.contentSort);
    contentSortEl.addEventListener('change', () => {
      state.contentSort = normalizeContentSort(contentSortEl.value);
      state.contentPage = 1;
      savePrefs();
      renderConnected();
    });
  }

  document.querySelectorAll('[data-content-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.getAttribute('data-content-page'), 10);
      if (!Number.isFinite(p)) return;
      state.contentPage = p;
      savePrefs();
      renderConnected();
    });
  });

  const contentSearchEl = document.getElementById('genfy-content-search');
  if (contentSearchEl) {
    contentSearchEl.addEventListener('input', () => {
      const pos = contentSearchEl.selectionStart;
      const scrollY = window.scrollY;
      state.contentSearch = contentSearchEl.value;
      state.contentPage = 1;
      savePrefs();
      renderConnected();
      const next = document.getElementById('genfy-content-search');
      if (next) {
        next.focus();
        if (typeof pos === 'number') next.setSelectionRange(pos, pos);
      }
      window.scrollTo(0, scrollY);
    });
  }

  document.querySelectorAll('[data-gemini-video-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const videoId = btn.getAttribute('data-gemini-video-toggle');
      if (!videoId) return;
      const current = (state.videoGemini && state.videoGemini[videoId]) || {};
      if (current.open) {
        setGeminiEntry(videoId, { open: false });
        renderConnected();
        return;
      }
      handleGeminiVideoAnalysis(videoId);
    });
  });

  document.querySelectorAll('[data-gemini-video-refresh]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const videoId = btn.getAttribute('data-gemini-video-refresh');
      if (videoId) handleGeminiVideoAnalysis(videoId, { force: true });
    });
  });

  document.querySelectorAll('[data-export-analysis]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const videoId = btn.getAttribute('data-export-analysis');
      const videos = (state.channel && state.channel.recentVideos) || [];
      const video = videos.find((v) => v && v.id === videoId);
      const analysis = videoId && state.videoGemini && state.videoGemini[videoId];
      if (video && analysis && analysis.status === 'ready') exportAnalysisCsv(video, analysis);
    });
  });

  const exportByFormat = {
    'data-export-analysis-xls': exportAnalysisXls,
    'data-export-analysis-pdf': exportAnalysisPdf
  };
  Object.entries(exportByFormat).forEach(([attribute, exporter]) => {
    document.querySelectorAll(`[${attribute}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!exportAllowed(attribute.endsWith('xls') ? 'xls' : 'pdf')) return;
        const videoId = btn.getAttribute(attribute);
        const entry = getAnalysisEntries().find(({ video }) => video.id === videoId);
        if (entry) exporter([entry], videoId);
      });
    });
  });

  const exportAnalysesBtn = document.getElementById('btn-export-analyses-csv');
  if (exportAnalysesBtn) {
    exportAnalysesBtn.addEventListener('click', () => {
      const entries = getAnalysisEntries();
      if (entries.length) exportAnalysesCsv(entries, state.period);
    });
  }

  const exportAnalysesByFormat = [
    ['btn-export-analyses-xls', exportAnalysesXls],
    ['btn-export-analyses-pdf', exportAnalysesPdf]
  ];
  exportAnalysesByFormat.forEach(([id, exporter]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!exportAllowed(id.endsWith('xls') ? 'xls' : 'pdf')) return;
      const entries = getAnalysisEntries();
      if (entries.length) exporter(entries, state.period);
    });
  });

  const analyzeChannelBtn = document.getElementById('btn-analyze-channel');
  if (analyzeChannelBtn) analyzeChannelBtn.addEventListener('click', () => handleChannelAnalysis());

  const reanalyzeChannelBtn = document.getElementById('btn-reanalyze-channel');
  if (reanalyzeChannelBtn) reanalyzeChannelBtn.addEventListener('click', () => handleChannelAnalysis());

  const closeChannelBtn = document.getElementById('genfy-channel-ai-close');
  if (closeChannelBtn) closeChannelBtn.addEventListener('click', closeChannelModal);

  const channelBackdrop = document.getElementById('genfy-channel-ai-backdrop');
  if (channelBackdrop) channelBackdrop.addEventListener('click', closeChannelModal);

  const exportChannelXlsBtn = document.getElementById('btn-export-channel-xls');
  if (exportChannelXlsBtn) {
    exportChannelXlsBtn.addEventListener('click', () => {
      if (exportAllowed('xls')) exportChannelXls(getChannelReport(), state.period);
    });
  }

  const exportChannelPdfBtn = document.getElementById('btn-export-channel-pdf');
  if (exportChannelPdfBtn) {
    exportChannelPdfBtn.addEventListener('click', () => {
      if (exportAllowed('pdf')) exportChannelPdf(getChannelReport(), state.period);
    });
  }

  const saveGeminiKeyBtn = document.getElementById('btn-save-gemini-key');
  if (saveGeminiKeyBtn) saveGeminiKeyBtn.addEventListener('click', handleSaveGeminiKey);

  const detectGeminiBtn = document.getElementById('btn-detect-gemini-models');
  if (detectGeminiBtn) {
    detectGeminiBtn.addEventListener('click', () => handleDetectGeminiModels(detectGeminiBtn));
  }

  const testGeminiBtn = document.getElementById('btn-test-gemini');
  if (testGeminiBtn) {
    testGeminiBtn.addEventListener('click', () => handleTestGeminiConnection(testGeminiBtn));
  }

  const geminiModelSel = document.getElementById('genfy-gemini-model');
  if (geminiModelSel) {
    geminiModelSel.addEventListener('change', async () => {
      state.gemini.model = geminiModelSel.value;
      await saveGeminiSettings({ model: geminiModelSel.value });
      setGeminiStatus(`Modelo salvo: ${geminiModelSel.value}.`);
    });
  }

  populateGeminiSettings();

  const sortEl = document.getElementById('genfy-video-sort');
  if (sortEl) {
    sortEl.addEventListener('change', () => {
      state.videoSort = sortEl.value;
      savePrefs();
      renderConnected();
    });
  }

  const searchEl = document.getElementById('genfy-video-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      const rows = document.querySelectorAll('#genfy-video-list [data-video-row]');
      let visible = 0;
      rows.forEach((row) => {
        const match = !q || (row.dataset.search || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      const empty = document.getElementById('genfy-video-empty');
      if (empty) empty.classList.toggle('hidden', visible > 0);
    });
  }

  const exportVideosBtn = document.getElementById('btn-export-videos');
  if (exportVideosBtn) {
    exportVideosBtn.addEventListener('click', () => {
      const videos = filterVideosByPeriod(state.channel.recentVideos || [], state.period);
      exportVideosCsv(videos);
    });
  }

  const exportJsonBtn = document.getElementById('btn-export-json');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      exportJson({
        exportedAt: new Date().toISOString(),
        channel: state.channel,
        publications: state.publications,
        checklist: state.checklist
      });
    });
  }

  document.querySelectorAll('.genfy-checklist-item').forEach((cb) => {
    cb.addEventListener('change', () => {
      state.checklist[cb.dataset.key] = cb.checked;
      saveChecklist();
      updateChecklistProgress();
    });
  });

  const resetChecklistBtn = document.getElementById('btn-reset-checklist');
  if (resetChecklistBtn) {
    resetChecklistBtn.addEventListener('click', () => {
      resetChecklist();
      saveChecklist();
      document.querySelectorAll('.genfy-checklist-item').forEach((cb) => {
        cb.checked = false;
      });
      updateChecklistProgress();
    });
  }

  wireEntitlementListeners();
  updateExportButtons();
}

function startLastUpdatedTicker() {
  if (lastUpdatedIntervalId) clearInterval(lastUpdatedIntervalId);
  lastUpdatedIntervalId = setInterval(() => {
    const el = document.getElementById('genfy-last-updated');
    if (el && state.lastUpdated) el.textContent = formatRelativeTime(state.lastUpdated);
  }, 60000);
}

function isAuthError(err) {
  return /401|403|unauthor|credential|invalid/i.test(`${err && err.status} ${err && err.message}`);
}

async function handleSignIn() {
  state.status = 'authenticating';
  state.errorMessage = '';
  render();
  try {
    const token = await signIn();
    await loadData(token);
  } catch (err) {
    console.error('[GENFY] Falha no login:', err && err.message);
    state.status = 'error';
    state.errorMessage = err.message || 'Erro ao autenticar.';
    render();
  }
}

async function loadData(token, { silent = false } = {}) {
  if (!silent) {
    state.status = 'loading';
    render();
  }
  try {
    let channel;
    try {
      channel = await loadChannelDashboard(token);
    } catch (err) {
      if (!isAuthError(err)) throw err;
      const fresh = await refreshToken();
      if (!fresh) throw err;
      channel = await loadChannelDashboard(fresh);
    }
    const previousId = state.channel && state.channel.id;
    if (previousId && channel.id !== previousId) {
      resetAnalyticsState();
      resetTrendingState();
      state.publications = state.publications.filter((item) =>
        !item.channelId || item.channelId === channel.id
      );
      savePublications();
    }
    state.channel = channel;
    state.status = 'connected';
    state.lastUpdated = new Date();
    storageSet(CACHE_KEY, { channel, savedAt: Date.now() });
    render();
    ensureEntitlement(token);
  } catch (err) {
    console.error('[GENFY] Falha ao carregar dados:', err && err.message);
    if (silent && state.channel) return;
    state.status = 'error';
    state.errorMessage = err.message || 'Erro ao carregar dados.';
    render();
  }
}

async function handleRefresh() {
  forceAnalytics = true;
  forceTrending = true;
  const token = getCachedToken() || (await restoreSession());
  if (!token) {
    state.status = 'signed-out';
    render();
    return;
  }
  await loadData(token);
}

async function handleSignOut() {
  if (publishingController) {
    publishingController.destroy();
    publishingController = null;
  }
  clearToken();
  state.publications = [];
  state.videoGemini = {};
  state.channelGemini = { open: false, status: 'idle', text: '', error: '', model: '', analyzedAt: '' };
  state.entitlement = { status: 'idle', data: null, error: '' };
  state.checklist = { ...DEFAULT_CHECKLIST };
  resetAnalyticsState();
  resetTrendingState();
  state.channel = null;
  state.lastUpdated = null;
  state.status = 'signed-out';
  await Promise.all([
    storageRemove(CACHE_KEY),
    storageRemove(CHECKLIST_KEY),
    storageRemove(PUBLICATIONS_KEY),
    storageRemove(PREFS_KEY),
    clearAnalyticsCache(),
    clearTrendingCache()
  ]);
  render();
}

async function handleRetry() {
  const token = getCachedToken() || (await restoreSession());
  if (token) {
    loadData(token);
  } else {
    handleSignIn();
  }
}

function render() {
  renderSidebar();
  renderHeader();
  switch (state.status) {
    case 'signed-out': renderSignedOut(); break;
    case 'authenticating': renderAuthenticating(); break;
    case 'loading': renderLoading(); break;
    case 'connected': renderConnected(); break;
    case 'error': renderError(); break;
    default: renderSignedOut();
  }
}

function setupKeyboardShortcuts() {
  const periodByKey = { '1': '7d', '2': '28d', '3': '90d', '4': 'all' };
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && state.commentsModal && state.commentsModal.open) {
      closeCommentsModal();
      return;
    }
    if (e.key === 'Escape' && state.channelGemini && state.channelGemini.open) {
      closeChannelModal();
      return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (key === 't') {
      cycleTheme();
      return;
    }
    if (state.status !== 'connected') return;
    if (periodByKey[key]) setPeriod(periodByKey[key]);
    else if (key === 'r') handleRefresh();
  });
}

export async function boot() {
  await loadPersistedState();
  applyTheme(state.theme);
  watchSystemTheme(() => state.theme);
  setupKeyboardShortcuts();

  document.addEventListener('click', (e) => {
    const periodBtn = e.target && e.target.closest && e.target.closest('.genfy-period-btn');
    if (periodBtn) {
      setPeriod(periodBtn.dataset.period);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('#btn-mobile-menu')) {
      openMobileSidebar();
    } else if (e.target && e.target.closest && e.target.closest('#sidebar-overlay')) {
      closeMobileSidebar();
    }
  });

  if (await wasSignedIn()) {
    const cache = await storageGet(CACHE_KEY, null);
    const hasCache = !!(cache && cache.channel);
    if (hasCache) {
      state.channel = cache.channel;
      state.lastUpdated = new Date(cache.savedAt);
      state.status = 'connected';
    } else {
      state.status = 'loading';
    }
    render();

    const token = await restoreSession();
    if (token) {
      await loadData(token, { silent: hasCache });
    } else {
      state.channel = null;
      state.lastUpdated = null;
      await storageRemove(CACHE_KEY);
      state.status = 'signed-out';
      render();
    }
  } else {
    render();
  }
}
