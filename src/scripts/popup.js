import { storageGet } from './services/storage.js';

const DASHBOARD_PATH = 'src/pages/dashboard.html';

const versionEl = document.getElementById('genfy-version');
const statusEl = document.getElementById('genfy-status');
const openBtn = document.getElementById('open-dashboard');

if (versionEl && typeof chrome !== 'undefined' && chrome.runtime) {
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
}

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PATH) });
});

storageGet('genfy_session', null)
  .then((session) => {
    if (!statusEl) return;
    statusEl.textContent = session && session.signedIn
      ? 'Sessão do YouTube salva neste navegador.'
      : 'Nenhuma conta conectada ainda.';
  })
  .catch(() => {
    if (statusEl) statusEl.textContent = 'Não foi possível verificar a sessão.';
  });
