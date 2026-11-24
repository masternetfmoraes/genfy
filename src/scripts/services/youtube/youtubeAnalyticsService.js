// src/scripts/services/youtube/youtubeAnalyticsService.js
// Centraliza as chamadas à YouTube Analytics API (reports.query) e transforma
// as respostas em objetos simples para a UI. Nenhuma manipulação de DOM aqui.
//
// Fonte oficial: https://developers.google.com/youtube/analytics/reference/reports/query
// Dimensões usadas (todas documentadas): ageGroup, gender, country, deviceType, day.
// Métricas usadas: viewerPercentage (demografia), views e, no relatório de engajamento,
// views, likes, comments e shares por dia.
//
// NÃO fornecidos pela API (não simulamos):
//  - idioma do espectador (não existe dimensão);
//  - novos vs. recorrentes (não existe dimensão);
//  - dados por hora do dia (só existem as dimensões day e month).
//
// Observação: as datas da API seguem o horário do Pacífico (America/Los_Angeles).

import {
  getCachedToken,
  refreshToken,
  hasAnalyticsScope,
  markAnalyticsNotGranted
} from './youtubeAuth.js';
import { storageGet, storageSet, storageRemove, storageKeys } from '../storage.js';

const REPORTS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const ANALYTICS_TZ = 'America/Los_Angeles';

const CACHE_PREFIX = 'genfy_analytics_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const PERIOD_DAYS = { '7d': 7, '28d': 28, '90d': 90 };
const MAX_PAGE_ROWS = 1000;
const MAX_PAGES = 200;

// Limite inferior usado no período "Tudo" quando não sabemos a data de criação do canal.
const FALLBACK_START_DATE = '2008-07-01';
const MAX_COUNTRIES = 25;
// Para uma média por dia da semana fazer sentido, cada dia precisa aparecer ao menos 2 vezes.
const MIN_DAYS_FOR_WEEKDAY = 14;

export const STATUS = {
  OK: 'ok',
  NEEDS_AUTH: 'needs-auth',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
};

export const MSG_LANGUAGE_UNAVAILABLE = 'Este dado não está disponível através da YouTube Analytics API.';
export const MSG_RETURNING_UNAVAILABLE = 'Este dado não está disponível diretamente pela API.';

export const ENGAGEMENT_GRANULARITIES = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'total', label: 'Total' }
];

const ENGAGEMENT_BUCKET_LIMITS = { day: 14, week: 12, month: 12, total: 1 };
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const AGE_LABELS = {
  'age13-17': '13–17',
  'age18-24': '18–24',
  'age25-34': '25–34',
  'age35-44': '35–44',
  'age45-54': '45–54',
  'age55-64': '55–64',
  'age65-': '65+'
};
const AGE_ORDER = Object.keys(AGE_LABELS);

const GENDER_LABELS = {
  female: 'Feminino',
  male: 'Masculino',
  user_specified: 'Outro / não especificado'
};

const DEVICE_LABELS = {
  MOBILE: 'Celular',
  DESKTOP: 'Computador',
  TV: 'TV',
  TABLET: 'Tablet',
  GAME_CONSOLE: 'Console',
  AUTOMOTIVE: 'Automotivo',
  WEARABLE: 'Vestível',
  UNKNOWN_PLATFORM: 'Não identificado'
};

// ============================================================
// DATAS
// ============================================================

function pacificToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Única fonte de verdade para converter o filtro da UI em datas da API.
// period: '7d' | '28d' | '90d' | 'all'
export function getDateRange(period, channelPublishedAt) {
  const endDate = pacificToday();
  const days = PERIOD_DAYS[period];
  if (days) return { startDate: addDays(endDate, -(days - 1)), endDate };

  const published = channelPublishedAt ? String(channelPublishedAt).slice(0, 10) : '';
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : FALLBACK_START_DATE;
  return { startDate, endDate };
}

// ============================================================
// CHAMADA HTTP + ERROS
// ============================================================

class AnalyticsApiError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'AnalyticsApiError';
    this.status = status;
    this.reason = reason;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runReportOnce(params) {
  let token = getCachedToken();
  if (!token) {
    throw new AnalyticsApiError('Sessão do YouTube não encontrada.', { status: 401, reason: 'noToken' });
  }

  const url = REPORTS_URL + '?' + new URLSearchParams({ ids: 'channel==MINE', ...params }).toString();
  let refreshed = false;
  let retried = false;

  for (;;) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new AnalyticsApiError('Falha de rede ao consultar o YouTube Analytics.', { status: 0, reason: 'network' });
    }

    if (res.ok) return res.json();

    const body = await res.json().catch(() => null);
    const apiErr = body && body.error;
    const reason =
      (apiErr && apiErr.errors && apiErr.errors[0] && apiErr.errors[0].reason) ||
      (apiErr && apiErr.status) ||
      '';
    const message = (apiErr && apiErr.message) || `HTTP ${res.status}`;
    console.warn('[GENFY][Analytics]', res.status, reason);

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      const fresh = await refreshToken();
      if (fresh) {
        token = fresh;
        continue;
      }
    }
    if (res.status >= 500 && !retried) {
      retried = true;
      await sleep(800);
      continue;
    }
    throw new AnalyticsApiError(message, { status: res.status, reason });
  }
}

async function runReport(params, { paginate = false } = {}) {
  if (!paginate) return runReportOnce(params);

  const columnHeaders = [];
  const rows = [];
  let startIndex = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const report = await runReportOnce({
      ...params,
      maxResults: String(MAX_PAGE_ROWS),
      startIndex: String(startIndex)
    });

    if (page === 0 && Array.isArray(report.columnHeaders)) {
      columnHeaders.push(...report.columnHeaders);
    }

    const batch = Array.isArray(report.rows) ? report.rows : [];
    rows.push(...batch);
    if (batch.length < MAX_PAGE_ROWS) break;
    startIndex += batch.length;
  }

  return { columnHeaders, rows };
}

// Converte um erro em { status, message } amigável (sem stack trace para o usuário).
function classifyError(err) {
  const status = err && err.status;
  const text = `${(err && err.reason) || ''} ${(err && err.message) || ''}`;

  if (status === 401) {
    return { status: STATUS.NEEDS_AUTH, message: 'Sua sessão expirou. Autorize novamente o YouTube Analytics.' };
  }
  if (status === 403) {
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(text)) {
      return { status: STATUS.ERROR, message: 'A YouTube Analytics API não está ativada no projeto Google Cloud deste app.' };
    }
    return { status: STATUS.NEEDS_AUTH, message: 'Sem permissão para ler o YouTube Analytics deste canal.' };
  }
  if (status === 404) {
    return { status: STATUS.ERROR, message: 'Não encontramos dados de Analytics para este canal.' };
  }
  if (status === 429) {
    return { status: STATUS.ERROR, message: 'Muitas requisições ao YouTube Analytics. Tente novamente em alguns minutos.' };
  }
  if (status >= 500) {
    return { status: STATUS.ERROR, message: 'O YouTube Analytics está instável no momento. Tente novamente em instantes.' };
  }
  if (status === 0) {
    return { status: STATUS.ERROR, message: 'Sem conexão com o YouTube Analytics. Verifique sua internet.' };
  }
  return { status: STATUS.ERROR, message: 'Não foi possível carregar os dados do YouTube Analytics.' };
}

function toObjects(report) {
  const headers = ((report && report.columnHeaders) || []).map((h) => h.name);
  return ((report && report.rows) || []).map((row) =>
    Object.fromEntries(row.map((value, i) => [headers[i], value]))
  );
}

// ============================================================
// CONSULTAS (uma por relatório; rodam em paralelo)
// ============================================================

function fetchDemographics({ startDate, endDate }) {
  return runReport({ startDate, endDate, dimensions: 'ageGroup,gender', metrics: 'viewerPercentage' })
    .then(toObjects);
}

function fetchCountries({ startDate, endDate }) {
  return runReport({
    startDate, endDate,
    dimensions: 'country', metrics: 'views',
    sort: '-views', maxResults: String(MAX_COUNTRIES)
  }).then(toObjects);
}

function fetchDevices({ startDate, endDate }) {
  return runReport({ startDate, endDate, dimensions: 'deviceType', metrics: 'views', sort: '-views' })
    .then(toObjects);
}

function fetchDaily({ startDate, endDate }) {
  return runReport(
    { startDate, endDate, dimensions: 'day', metrics: 'views', sort: 'day' },
    { paginate: true }
  ).then(toObjects);
}

function fetchEngagement({ startDate, endDate }) {
  return runReport(
    {
      startDate, endDate,
      dimensions: 'day',
      metrics: 'views,likes,comments,shares',
      sort: 'day'
    },
    { paginate: true }
  ).then(toObjects);
}

// ============================================================
// TRANSFORMAÇÃO (funções puras → objetos simples para a UI)
// ============================================================

function buildAge(rows) {
  if (!rows.length) return { status: STATUS.EMPTY };
  const sums = new Map();
  rows.forEach((r) => sums.set(r.ageGroup, (sums.get(r.ageGroup) || 0) + (Number(r.viewerPercentage) || 0)));
  const items = Array.from(sums.entries())
    .map(([key, percent]) => ({ key, label: AGE_LABELS[key] || key, percent }))
    .sort((a, b) => {
      const ia = AGE_ORDER.indexOf(a.key), ib = AGE_ORDER.indexOf(b.key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  return { status: STATUS.OK, items };
}

function buildGender(rows) {
  if (!rows.length) return { status: STATUS.EMPTY };
  const sums = new Map();
  rows.forEach((r) => sums.set(r.gender, (sums.get(r.gender) || 0) + (Number(r.viewerPercentage) || 0)));
  const items = Array.from(sums.entries())
    .map(([key, percent]) => ({ key, label: GENDER_LABELS[key] || key, percent }))
    .sort((a, b) => b.percent - a.percent);
  return { status: STATUS.OK, items };
}

function regionName(code) {
  if (code === 'ZZ') return 'Não identificado';
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

function buildCountries(rows, totalViews) {
  if (!rows.length) return { status: STATUS.EMPTY };
  // Base do percentual: total de views do período; nunca menor que a soma das linhas
  // (evita passar de 100% se os relatórios divergirem levemente).
  const sumRows = rows.reduce((acc, r) => acc + (Number(r.views) || 0), 0);
  const total = Math.max(totalViews || 0, sumRows);
  const items = rows.map((r) => {
    const views = Number(r.views) || 0;
    return { code: r.country, label: regionName(r.country), views, percent: total > 0 ? (views / total) * 100 : null };
  });
  return { status: STATUS.OK, items };
}

function buildDevices(rows) {
  if (!rows.length) return { status: STATUS.EMPTY };
  // A lista de tipos de dispositivo é completa: a base é a soma das próprias linhas.
  const total = rows.reduce((acc, r) => acc + (Number(r.views) || 0), 0);
  const items = rows.map((r) => {
    const views = Number(r.views) || 0;
    return { key: r.deviceType, label: DEVICE_LABELS[r.deviceType] || r.deviceType, views, percent: total > 0 ? (views / total) * 100 : null };
  });
  return { status: STATUS.OK, items };
}

// Média de views por dia da semana:
//   média(dia) = soma das views dos dias com aquele nome / quantidade desses dias no intervalo.
// O intervalo vai do primeiro ao último dia com dados retornados pela API
// (dias sem linha contam como 0 view). Mede quando o público ASSISTE, não quando publicar.
function buildBestDay(rows) {
  if (!rows.length) return { status: STATUS.EMPTY };

  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  let first = rows[0].day, last = rows[0].day;
  rows.forEach((r) => {
    sums[weekdayOf(r.day)] += Number(r.views) || 0;
    if (r.day < first) first = r.day;
    if (r.day > last) last = r.day;
  });

  let totalDays = 0;
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    counts[weekdayOf(cursor)] += 1;
    totalDays += 1;
  }

  if (totalDays < MIN_DAYS_FOR_WEEKDAY) {
    return {
      status: STATUS.EMPTY,
      message: `Precisamos de pelo menos ${MIN_DAYS_FOR_WEEKDAY} dias de dados para comparar dias da semana (há ${totalDays} no período).`
    };
  }

  const items = WEEKDAYS.map((label, index) => ({
    index, label, days: counts[index],
    avgViews: counts[index] ? sums[index] / counts[index] : 0
  }));
  const best = items.reduce((a, b) => (b.avgViews > a.avgViews ? b : a), items[0]);
  if (best.avgViews <= 0) return { status: STATUS.EMPTY };

  return { status: STATUS.OK, items, best, totalDays };
}

function engagementNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function engagementRate(interactions, views) {
  return views > 0 ? (interactions / views) * 100 : null;
}

function shortDate(date) {
  const [, month, day] = String(date).split('-');
  return `${day}/${month}`;
}

function engagementBucket(date, granularity) {
  if (granularity === 'total') return { key: 'total', label: 'Período inteiro' };
  if (granularity === 'month') {
    const [year, month] = String(date).split('-');
    const monthIndex = Number(month) - 1;
    return { key: String(date).slice(0, 7), label: `${MONTH_NAMES[monthIndex] || month}/${year.slice(2)}` };
  }
  if (granularity === 'week') {
    const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
    return { key: monday, label: `Semana de ${shortDate(monday)}` };
  }
  return { key: date, label: shortDate(date) };
}

export function buildEngagement(rows) {
  const daily = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && /^\d{4}-\d{2}-\d{2}$/.test(row.day || ''))
    .map((row) => {
      const views = engagementNumber(row.views);
      const likes = engagementNumber(row.likes);
      const comments = engagementNumber(row.comments);
      const shares = engagementNumber(row.shares);
      const interactions = likes + comments + shares;
      return {
        date: row.day,
        views,
        likes,
        comments,
        shares,
        interactions,
        rate: engagementRate(interactions, views)
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (daily.length === 0) return { status: STATUS.EMPTY };

  const totals = daily.reduce((acc, row) => {
    acc.views += row.views;
    acc.likes += row.likes;
    acc.comments += row.comments;
    acc.shares += row.shares;
    acc.interactions += row.interactions;
    return acc;
  }, { views: 0, likes: 0, comments: 0, shares: 0, interactions: 0 });

  return {
    status: STATUS.OK,
    daily,
    days: daily.length,
    totals: { ...totals, rate: engagementRate(totals.interactions, totals.views) }
  };
}

export function aggregateEngagement(engagement, granularity = 'week') {
  if (!engagement || engagement.status !== STATUS.OK || !Array.isArray(engagement.daily)) return [];
  const mode = ENGAGEMENT_GRANULARITIES.some((g) => g.key === granularity) ? granularity : 'week';
  const byKey = new Map();

  engagement.daily.forEach((row) => {
    const meta = engagementBucket(row.date, mode);
    const bucket = byKey.get(meta.key) || {
      ...meta,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      interactions: 0,
      days: 0
    };
    bucket.views += row.views || 0;
    bucket.likes += row.likes || 0;
    bucket.comments += row.comments || 0;
    bucket.shares += row.shares || 0;
    bucket.interactions += row.interactions || 0;
    bucket.days += 1;
    byKey.set(meta.key, bucket);
  });

  const buckets = Array.from(byKey.values()).map((bucket) => ({
    ...bucket,
    rate: engagementRate(bucket.interactions, bucket.views)
  }));
  return buckets.slice(-(ENGAGEMENT_BUCKET_LIMITS[mode] || 12));
}

// ============================================================
// API PÚBLICA DO SERVICE
// ============================================================

function settledError(settled) {
  return settled.status === 'rejected' ? classifyError(settled.reason) : null;
}

function analyticsCacheKey(period, channelId) {
  return `${CACHE_PREFIX}${encodeURIComponent(channelId || 'unknown')}_${period}`;
}

export async function loadAudienceAnalytics({ period, channelId, channelPublishedAt, force = false }) {
  const range = getDateRange(period, channelPublishedAt);

  if (!hasAnalyticsScope()) return { status: STATUS.NEEDS_AUTH, range };

  const cacheKey = analyticsCacheKey(period, channelId);
  if (!force) {
    const cached = await storageGet(cacheKey, null);
    if (
      cached && cached.result &&
      Date.now() - cached.savedAt < CACHE_TTL_MS &&
      cached.result.range.startDate === range.startDate &&
      cached.result.range.endDate === range.endDate
    ) {
      return { ...cached.result, fromCache: true };
    }
  }

  const [demo, countries, devices, daily, engagement] = await Promise.allSettled([
    fetchDemographics(range),
    fetchCountries(range),
    fetchDevices(range),
    fetchDaily(range),
    fetchEngagement(range)
  ]);

  const all = [demo, countries, devices, daily, engagement];
  const errors = all.map(settledError);

  if (errors.some((e) => e && e.status === STATUS.NEEDS_AUTH)) {
    markAnalyticsNotGranted();
    return { status: STATUS.NEEDS_AUTH, range, message: errors.find((e) => e && e.status === STATUS.NEEDS_AUTH).message };
  }
  if (errors.every(Boolean)) {
    return { status: STATUS.ERROR, range, message: errors[0].message };
  }

  const section = (settled, err, build) =>
    err ? { status: STATUS.ERROR, message: err.message } : build(settled.value);

  const dailyRows = daily.status === 'fulfilled' ? daily.value : null;
  const totalViews = dailyRows ? dailyRows.reduce((acc, r) => acc + (Number(r.views) || 0), 0) : null;

  const result = {
    status: STATUS.OK,
    range,
    totalViews,
    age: section(demo, errors[0], buildAge),
    gender: section(demo, errors[0], buildGender),
    countries: section(countries, errors[1], (rows) => buildCountries(rows, totalViews)),
    devices: section(devices, errors[2], buildDevices),
    bestDay: section(daily, errors[3], buildBestDay),
    engagement: section(engagement, errors[4], buildEngagement),
    language: { status: STATUS.UNAVAILABLE, message: MSG_LANGUAGE_UNAVAILABLE },
    returning: { status: STATUS.UNAVAILABLE, message: MSG_RETURNING_UNAVAILABLE },
    fetchedAt: Date.now()
  };

  if (!errors.some(Boolean)) {
    storageSet(cacheKey, { savedAt: Date.now(), result });
  }
  return result;
}

export async function clearAnalyticsCache() {
  const keys = await storageKeys();
  await Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => storageRemove(key))
  );
}