import { storageGet, storageSet } from '../../services/storage.js';
import { normalizeCommentsSort } from '../../core/comments.js';
import {
  PREFS_KEY,
  SCHEDULER_KEY,
  CHECKLIST_KEY,
  PUBLICATIONS_KEY,
  DEFAULT_CHECKLIST,
  DEFAULT_REGION_CODE,
  DEFAULT_TRENDING_MODE,
  FALLBACK_CATEGORIES,
  PERIOD_DAYS
} from '../../constants.js';

export const CONTENT_SORTS = ['newest', 'oldest', 'best', 'worst'];

export function normalizeContentSort(value) {
  if (value === 'date') return 'newest';
  if (value === 'audience') return 'best';
  return CONTENT_SORTS.includes(value) ? value : 'best';
}

export const state = {
  status: 'signed-out',
  channel: null,
  errorMessage: '',
  period: 'all',
  engagementGranularity: 'week',
  activeSection: 'overview',
  lastUpdated: null,
  theme: 'system',
  videoSort: 'date',
  contentTab: 'videos',
  contentSort: 'best',
  contentPage: 1,
  contentSearch: '',
  comments: [],
  commentsStatus: 'idle',
  commentsSort: 'newest',
  commentsError: '',
  commentsPage: 1,
  commentsModal: { open: false, videoId: '', page: 1 },
  commentsLoadedAt: null,
  analytics: { period: null, status: 'idle', result: null },
  trendingPrefs: { mode: DEFAULT_TRENDING_MODE, regionCode: DEFAULT_REGION_CODE, categoryId: '', query: '' },
  trending: { key: '', status: 'idle', result: null, categories: FALLBACK_CATEGORIES, error: '' },
  publications: [],
  checklist: { ...DEFAULT_CHECKLIST },
  gemini: { apiKey: '', model: 'gemini-2.5-flash', models: [] },
  videoGemini: {},
  channelGemini: { open: false, status: 'idle', text: '', error: '', model: '', analyzedAt: '' },
  entitlement: { status: 'idle', data: null, error: '' }
};

export function savePrefs() {
  return storageSet(PREFS_KEY, {
    period: state.period,
    engagementGranularity: state.engagementGranularity,
    activeSection: state.activeSection,
    theme: state.theme,
    videoSort: state.videoSort,
    contentTab: state.contentTab,
    contentSort: state.contentSort,
    contentPage: state.contentPage,
    commentsSort: state.commentsSort,
    trendingPrefs: state.trendingPrefs
  });
}

export function savePublications() {
  return storageSet(PUBLICATIONS_KEY, state.publications);
}

export function saveChecklist() {
  return storageSet(CHECKLIST_KEY, state.checklist);
}

export async function loadPersistedState() {
  const prefs = await storageGet(PREFS_KEY, {});
  if (prefs.period && prefs.period in PERIOD_DAYS) state.period = prefs.period;
  if (['day', 'week', 'month', 'total'].includes(prefs.engagementGranularity)) {
    state.engagementGranularity = prefs.engagementGranularity;
  }
  if (prefs.activeSection) state.activeSection = prefs.activeSection;
  if (prefs.theme) state.theme = prefs.theme;
  if (prefs.videoSort) state.videoSort = prefs.videoSort;
  if (prefs.contentTab) state.contentTab = prefs.contentTab;
  state.contentSort = normalizeContentSort(prefs.contentSort);
  if (prefs.contentPage) state.contentPage = prefs.contentPage;
  state.commentsSort = normalizeCommentsSort(prefs.commentsSort);
  if (prefs.trendingPrefs && typeof prefs.trendingPrefs === 'object') {
    const tp = prefs.trendingPrefs;
    state.trendingPrefs = {
      mode: tp.mode === 'rising' ? 'rising' : DEFAULT_TRENDING_MODE,
      regionCode: /^[a-z]{2}$/i.test(tp.regionCode || '') ? String(tp.regionCode).toUpperCase() : DEFAULT_REGION_CODE,
      categoryId: tp.categoryId ? String(tp.categoryId) : '',
      query: String(tp.query || '').slice(0, 100)
    };
  }

  const publicationData = await storageGet(PUBLICATIONS_KEY, []);
  state.publications = Array.isArray(publicationData) ? publicationData : [];

  const checklistData = await storageGet(CHECKLIST_KEY, {});
  state.checklist = checklistData && typeof checklistData === 'object'
    ? { ...DEFAULT_CHECKLIST, ...checklistData }
    : { ...DEFAULT_CHECKLIST };
}

export function resetChecklist() {
  Object.keys(state.checklist).forEach((key) => {
    state.checklist[key] = false;
  });
}

export function resetSessionState() {
  state.channel = null;
  state.lastUpdated = null;
  state.analytics = { period: null, status: 'idle', result: null };
  state.trending = { key: '', status: 'idle', result: null, categories: FALLBACK_CATEGORIES, error: '' };
  state.publications = [];
  state.contentTab = 'videos';
  state.contentSort = 'best';
  state.contentPage = 1;
  state.contentSearch = '';
  state.comments = [];
  state.commentsStatus = 'idle';
  state.commentsError = '';
  state.commentsPage = 1;
  state.commentsModal = { open: false, videoId: '', page: 1 };
  state.commentsLoadedAt = null;
  state.videoGemini = {};
  state.channelGemini = { open: false, status: 'idle', text: '', error: '', model: '', analyzedAt: '' };
  state.entitlement = { status: 'idle', data: null, error: '' };
  state.status = 'signed-out';
}
