import test from 'node:test';
import assert from 'node:assert/strict';
import {
  t,
  setLocale,
  getLocale,
  availableLocales
} from '../src/scripts/core/i18n.js';

test('t traduz chaves conhecidas e interpola variáveis', () => {
  setLocale('pt-BR');
  assert.equal(t('app.name'), 'GENFY');
  assert.equal(t('sidebar.theme', { theme: 'Escuro' }), 'Tema: Escuro');
});

test('t devolve a própria chave quando não existe tradução', () => {
  assert.equal(t('chave.inexistente'), 'chave.inexistente');
});

test('setLocale ignora locales não suportados', () => {
  assert.equal(setLocale('en-US'), 'pt-BR');
  assert.equal(getLocale(), 'pt-BR');
  assert.deepEqual(availableLocales(), ['pt-BR']);
});
