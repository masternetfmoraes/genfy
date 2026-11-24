// GENFY — service worker (MV3).
// Responsabilidades: abrir o dashboard na primeira instalação e responder a
// verificações leves de versão usadas pelo popup. A autenticação permanece nas
// páginas de extensão (chrome.identity), onde há contexto de UI para consentimento.

const DASHBOARD_URL = 'src/pages/dashboard.html';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_URL) });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'GENFY_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  return false;
});
