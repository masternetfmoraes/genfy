import test from 'node:test';
import assert from 'node:assert/strict';

function stubElement() {
  return {
    textContent: '',
    addEventListener() {},
    querySelectorAll() {
      return [];
    }
  };
}

test('módulos do dashboard carregam com exports consistentes', async () => {
  globalThis.document = { getElementById: () => null };
  try {
    const app = await import('../src/scripts/pages/dashboard/app.js');
    const render = await import('../src/scripts/pages/dashboard/render.js');
    assert.equal(typeof app.boot, 'function');
    assert.equal(typeof render.renderOverview, 'function');
    assert.equal(typeof render.renderAudience, 'function');
  } finally {
    delete globalThis.document;
  }
});

test('normaliza ordenação legada do conteúdo', async () => {
  const { normalizeContentSort, CONTENT_SORTS } = await import('../src/scripts/pages/dashboard/state.js');
  assert.equal(normalizeContentSort('audience'), 'best');
  assert.equal(normalizeContentSort('date'), 'newest');
  assert.equal(normalizeContentSort('oldest'), 'oldest');
  assert.equal(normalizeContentSort('worst'), 'worst');
  assert.equal(normalizeContentSort('invalido'), 'best');
  assert.deepEqual(CONTENT_SORTS, ['newest', 'oldest', 'best', 'worst']);
});

test('service worker registra listeners no carregamento', async () => {
  let installed = 0;
  let messages = 0;
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: '1.0.0' }),
      getURL: (path) => path,
      onInstalled: { addListener: () => { installed++; } },
      onMessage: { addListener: () => { messages++; } }
    },
    tabs: { create() {} }
  };
  try {
    await import('../src/scripts/background.js');
    assert.equal(installed, 1);
    assert.equal(messages, 1);
  } finally {
    delete globalThis.chrome;
  }
});

test('popup carrega e liga o botão de abrir dashboard', async () => {
  const elements = {
    'genfy-version': stubElement(),
    'genfy-status': stubElement(),
    'open-dashboard': stubElement()
  };
  globalThis.document = { getElementById: (id) => elements[id] || null };
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: '1.2.3' }),
      getURL: (path) => `chrome-extension://abc/${path}`
    },
    tabs: { create() {} }
  };
  try {
    await import('../src/scripts/popup.js');
    assert.equal(elements['genfy-version'].textContent, 'v1.2.3');
  } finally {
    delete globalThis.document;
    delete globalThis.chrome;
  }
});
