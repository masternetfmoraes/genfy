import { storageGet, storageSet } from '../storage.js';
import { MOCK_ENTITLEMENT_KEY } from '../../constants.js';
import { MOCK_LATENCY_MS } from '../../config.js';
import { buildEntitlement, currentMonth, normalizePlan, PLAN_FREE, PLAN_PRO } from './plans.js';
import { EntitlementError } from './errors.js';

function pseudoSub(token) {
  if (!token) return 'mock-local';
  const value = String(token);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mock_${(hash >>> 0).toString(36)}`;
}

async function delay() {
  if (MOCK_LATENCY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  }
}

async function readAll() {
  const data = await storageGet(MOCK_ENTITLEMENT_KEY, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

async function readRecord(token) {
  const all = await readAll();
  const sub = pseudoSub(token);
  const month = currentMonth();
  const raw = all[sub] || {};
  const record = {
    plan: normalizePlan(raw.plan),
    used: Number.isFinite(raw.used) && raw.used > 0 ? Math.floor(raw.used) : 0,
    month
  };
  if (raw.month !== month) record.used = 0;
  return { all, sub, record };
}

async function writeRecord(all, sub, record) {
  await storageSet(MOCK_ENTITLEMENT_KEY, { ...all, [sub]: record });
}

function assertActive(entitlement) {
  if (entitlement.remaining !== null && entitlement.remaining <= 0) {
    throw new EntitlementError(
      'QUOTA_EXHAUSTED',
      'Limite de 5 análises IA atingido neste mês. Assine o Pro para continuar.'
    );
  }
}

export async function getEntitlement(token) {
  await delay();
  const { record } = await readRecord(token);
  return buildEntitlement({ ...record, source: 'mock' });
}

export async function consumeAnalysis(token) {
  await delay();
  const { all, sub, record } = await readRecord(token);
  assertActive(buildEntitlement({ ...record, source: 'mock' }));
  const next = { ...record, used: record.used + 1 };
  await writeRecord(all, sub, next);
  return buildEntitlement({ ...next, source: 'mock' });
}

export async function setPlan(token, plan) {
  await delay();
  const { all, sub, record } = await readRecord(token);
  const next = { ...record, plan: normalizePlan(plan) };
  await writeRecord(all, sub, next);
  return buildEntitlement({ ...next, source: 'mock' });
}

export async function resetUsage(token) {
  await delay();
  const { all, sub, record } = await readRecord(token);
  const next = { ...record, used: 0, month: currentMonth() };
  await writeRecord(all, sub, next);
  return buildEntitlement({ ...next, source: 'mock' });
}

export async function revoke(token) {
  return setPlan(token, PLAN_FREE);
}
