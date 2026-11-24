import { storageGet, storageSet } from '../storage.js';
import { GEMINI_KEY_STORAGE, GEMINI_SETTINGS_STORAGE } from '../../constants.js';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' }
];

const LEGACY_MODELS = new Set([
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
]);

const isValidModel = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9._-]+$/.test(value);

export function isLegacyGeminiModel(value) {
  return typeof value === 'string' && LEGACY_MODELS.has(value.trim());
}

export function normalizeGeminiModel(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!isValidModel(candidate) || isLegacyGeminiModel(candidate)) return DEFAULT_MODEL;
  return candidate;
}

export async function getGeminiApiKey() {
  return (await storageGet(GEMINI_KEY_STORAGE, '')) || '';
}

export async function saveGeminiApiKey(key) {
  await storageSet(GEMINI_KEY_STORAGE, String(key || '').trim());
}

export async function loadGeminiSettings() {
  const saved = await storageGet(GEMINI_SETTINGS_STORAGE, null);
  const model = normalizeGeminiModel(saved && saved.model);
  if (!saved || saved.model !== model) await storageSet(GEMINI_SETTINGS_STORAGE, { model });
  return { model };
}

export async function saveGeminiSettings(partial) {
  const current = await loadGeminiSettings();
  const candidate = partial && typeof partial.model === 'string' ? partial.model.trim() : current.model;
  const next = { model: normalizeGeminiModel(candidate) };
  await storageSet(GEMINI_SETTINGS_STORAGE, next);
  return next;
}
