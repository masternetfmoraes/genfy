import { ENTITLEMENT_API_URL, ENTITLEMENT_TIMEOUT_MS } from '../../config.js';
import { buildEntitlement } from './plans.js';
import { EntitlementError } from './errors.js';

function endpoint(path) {
  if (!ENTITLEMENT_API_URL) {
    throw new EntitlementError('NOT_CONFIGURED', 'Configure ENTITLEMENT_API_URL em src/scripts/config.js.');
  }
  return `${String(ENTITLEMENT_API_URL).replace(/\/$/, '')}${path}`;
}

async function post(token, path) {
  const url = endpoint(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENTITLEMENT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: '{}',
      signal: controller.signal
    });
    if (response.status === 401) {
      throw new EntitlementError('UNAUTHORIZED', 'Sessão inválida. Entre novamente com sua conta Google.');
    }
    if (response.status === 402 || response.status === 403) {
      throw new EntitlementError(
        'QUOTA_EXHAUSTED',
        'Limite de análises IA atingido neste mês. Assine o Pro para continuar.'
      );
    }
    if (!response.ok) {
      throw new EntitlementError('REQUEST_FAILED', `Falha ao consultar o plano (${response.status}).`);
    }
    return await response.json();
  } catch (err) {
    if (err instanceof EntitlementError) throw err;
    if (err && err.name === 'AbortError') {
      throw new EntitlementError('TIMEOUT', 'O servidor de assinaturas não respondeu a tempo.');
    }
    throw new EntitlementError('NETWORK', (err && err.message) || 'Falha de rede ao consultar o plano.');
  } finally {
    clearTimeout(timer);
  }
}

export async function getEntitlement(token) {
  const data = await post(token, '/api/entitlement');
  return buildEntitlement({ ...data, source: 'http' });
}

export async function consumeAnalysis(token) {
  const data = await post(token, '/api/usage/consume');
  return buildEntitlement({ ...data, source: 'http' });
}

export async function setPlan() {
  throw new EntitlementError('DEV_ONLY', 'Troca de plano simulada não está disponível no backend real.');
}

export async function resetUsage() {
  throw new EntitlementError('DEV_ONLY', 'Zerar contador não está disponível no backend real.');
}

export async function revoke() {
  throw new EntitlementError('DEV_ONLY', 'Reembolso simulado não está disponível no backend real.');
}
