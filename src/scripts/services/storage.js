// src/scripts/services/storage.js
// Persistência simples: chrome.storage.local quando rodando como extensão,
// localStorage como fallback (útil para testar a página fora da extensão).

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const hasLocalStorage = () => typeof localStorage !== 'undefined';

export async function storageGet(key, fallback = null) {
  try {
    if (hasChromeStorage()) {
      const res = await chrome.storage.local.get(key);
      return res[key] !== undefined ? res[key] : fallback;
    }
    if (!hasLocalStorage()) return fallback;
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('storageGet falhou:', key, err);
    return fallback;
  }
}

export async function storageSet(key, value) {
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [key]: value });
    } else if (hasLocalStorage()) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    console.warn('storageSet falhou:', key, err);
  }
}

export async function storageRemove(key) {
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.remove(key);
    } else if (hasLocalStorage()) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('storageRemove falhou:', key, err);
  }
}

export async function storageKeys() {
  try {
    if (hasChromeStorage()) {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all || {});
    }
    return hasLocalStorage() ? Object.keys(localStorage) : [];
  } catch (err) {
    console.warn('storageKeys falhou:', err);
    return [];
  }
}