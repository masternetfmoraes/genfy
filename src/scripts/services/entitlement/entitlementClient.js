import { BACKEND_MODE } from '../../config.js';
import * as mock from './mockAdapter.js';
import * as http from './httpAdapter.js';
import { EntitlementError } from './errors.js';

const adapter = BACKEND_MODE === 'http' ? http : mock;

export function isMockBackend() {
  return BACKEND_MODE !== 'http';
}

export function backendMode() {
  return isMockBackend() ? 'mock' : 'http';
}

export function getEntitlement(token) {
  return adapter.getEntitlement(token);
}

export function consumeAnalysis(token) {
  return adapter.consumeAnalysis(token);
}

export function setMockPlan(token, plan) {
  return adapter.setPlan(token, plan);
}

export function resetMockUsage(token) {
  return adapter.resetUsage(token);
}

export function simulateRefund(token) {
  return adapter.revoke(token);
}

export { EntitlementError };
export { PLAN_FREE, PLAN_PRO, UNLIMITED, buildEntitlement, canExport, currentMonth } from './plans.js';
