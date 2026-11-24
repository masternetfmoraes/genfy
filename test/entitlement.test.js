import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEntitlement,
  consumeAnalysis,
  setMockPlan,
  resetMockUsage,
  simulateRefund,
  isMockBackend,
  canExport,
  buildEntitlement,
  PLAN_FREE,
  PLAN_PRO
} from '../src/scripts/services/entitlement/entitlementClient.js';
import { MOCK_ENTITLEMENT_KEY } from '../src/scripts/constants.js';

const originalStorage = globalThis.localStorage;
let values;

function installStorage() {
  values = new Map();
  globalThis.localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index],
    get length() {
      return values.size;
    }
  };
}

test.beforeEach(() => {
  installStorage();
});

test.after(() => {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

test('o modo simulado está ativo por padrão', () => {
  assert.equal(isMockBackend(), true);
});

test('buildEntitlement define 5 análises e apenas CSV no plano gratuito', () => {
  const ent = buildEntitlement({ plan: PLAN_FREE, used: 0, source: 'mock' });
  assert.equal(ent.limit, 5);
  assert.equal(ent.remaining, 5);
  assert.deepEqual(ent.features.exports, ['csv']);
  assert.equal(ent.features.history, false);
  assert.equal(ent.source, 'mock');
});

test('buildEntitlement marca o plano Pro como ilimitado com XLS e PDF', () => {
  const ent = buildEntitlement({ plan: PLAN_PRO, used: 12, source: 'http' });
  assert.equal(ent.limit, null);
  assert.equal(ent.remaining, null);
  assert.deepEqual(ent.features.exports, ['csv', 'xls', 'pdf']);
  assert.equal(ent.features.sampleLimit, 100);
  assert.equal(canExport(ent, 'pdf'), true);
});

test('getEntitlement devolve o plano gratuito quando não há registro', async () => {
  const ent = await getEntitlement('token-teste');
  assert.equal(ent.plan, PLAN_FREE);
  assert.equal(ent.used, 0);
  assert.equal(ent.remaining, 5);
  assert.equal(ent.month.length, 7);
});

test('consumeAnalysis decrementa a cota e bloqueia na sexta análise', async () => {
  for (let i = 0; i < 5; i += 1) {
    const ent = await consumeAnalysis('token-teste');
    assert.equal(ent.used, i + 1);
    assert.equal(ent.remaining, 4 - i);
  }

  await assert.rejects(() => consumeAnalysis('token-teste'), (err) => {
    assert.equal(err.code, 'QUOTA_EXHAUSTED');
    assert.match(err.message, /Limite de 5 análises/);
    return true;
  });
});

test('o plano Pro libera análises ilimitadas e exportações', async () => {
  const pro = await setMockPlan('token-teste', PLAN_PRO);
  assert.equal(pro.plan, PLAN_PRO);
  assert.equal(pro.remaining, null);
  assert.equal(canExport(pro, 'xls'), true);

  for (let i = 0; i < 7; i += 1) {
    const ent = await consumeAnalysis('token-teste');
    assert.equal(ent.remaining, null);
  }
  assert.equal((await getEntitlement('token-teste')).used, 7);
});

test('simular reembolso volta ao gratuito e manter o uso registrado', async () => {
  await setMockPlan('token-teste', PLAN_PRO);
  await consumeAnalysis('token-teste');
  await consumeAnalysis('token-teste');

  const reverted = await simulateRefund('token-teste');
  assert.equal(reverted.plan, PLAN_FREE);
  assert.equal(reverted.used, 2);
  assert.equal(reverted.remaining, 3);
  assert.equal(canExport(reverted, 'pdf'), false);
});

test('zerar contador devolve as 5 análises do mês', async () => {
  for (let i = 0; i < 5; i += 1) await consumeAnalysis('token-teste');
  const reset = await resetMockUsage('token-teste');
  assert.equal(reset.used, 0);
  assert.equal(reset.remaining, 5);
});

test('o uso zera quando o mês salvo é diferente do atual', async () => {
  await consumeAnalysis('token-teste');
  await consumeAnalysis('token-teste');
  const all = JSON.parse(values.get(MOCK_ENTITLEMENT_KEY));
  const sub = Object.keys(all)[0];
  all[sub].month = '2020-01';
  values.set(MOCK_ENTITLEMENT_KEY, JSON.stringify(all));

  const ent = await getEntitlement('token-teste');
  assert.equal(ent.used, 0);
  assert.equal(ent.remaining, 5);
});

test('contas Google diferentes têm cotas separadas', async () => {
  for (let i = 0; i < 5; i += 1) await consumeAnalysis('token-a');
  await assert.rejects(() => consumeAnalysis('token-a'), (err) => err.code === 'QUOTA_EXHAUSTED');

  const other = await getEntitlement('token-b');
  assert.equal(other.used, 0);
  assert.equal(other.remaining, 5);
});
