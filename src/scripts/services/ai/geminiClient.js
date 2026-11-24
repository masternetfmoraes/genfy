import { GEMINI_API_BASE } from './geminiConfig.js';
import { classifyGeminiFailure } from './geminiErrors.js';

const REQUEST_TIMEOUT_MS = 20000;
const TOTAL_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 700;
const MAX_RETRY_DELAY_MS = 5000;
const RETRYABLE_CODES = new Set(['OVERLOADED', 'SERVICE_ERROR', 'RATE_LIMIT', 'NETWORK', 'TIMEOUT', 'HTTP_ERROR']);

function extractText(payload) {
  const parts = payload && payload.candidates && payload.candidates[0]
    && payload.candidates[0].content && payload.candidates[0].content.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join('\n').trim();
}

function apiErrorFrom(response, data) {
  const apiError = (data && data.error) || {};
  return classifyGeminiFailure({
    status: response ? response.status : 0,
    code: apiError.status || '',
    message: apiError.message || ''
  });
}

function isRetryable(error) {
  return Boolean(error && error.retryable && RETRYABLE_CODES.has(error.code));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt) {
  const exponential = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return exponential + Math.floor(Math.random() * 250);
}

async function requestJson(url, init) {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remaining));

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) return { ok: true, data };

      lastError = apiErrorFrom(response, data);
      if (!isRetryable(lastError) || attempt === MAX_ATTEMPTS - 1 || deadline - Date.now() <= 0) {
        return { ok: false, error: lastError };
      }
    } catch (err) {
      lastError = err && err.name === 'AbortError'
        ? classifyGeminiFailure({ aborted: true })
        : classifyGeminiFailure({ network: true });
      if (attempt === MAX_ATTEMPTS - 1 || deadline - Date.now() <= 0) {
        return { ok: false, error: lastError };
      }
    } finally {
      clearTimeout(timer);
    }

    await sleep(retryDelay(attempt));
  }

  return { ok: false, error: lastError || classifyGeminiFailure({ aborted: true }) };
}

export async function generateGeminiText({ apiKey, model, prompt } = {}) {
  const result = await requestJson(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
  });
  if (!result.ok) return { ok: false, error: result.error };

  const data = result.data;
  const feedback = data && data.promptFeedback;
  if (feedback && feedback.blockReason) {
    return {
      ok: false,
      error: { code: 'SAFETY', userMessage: 'O Gemini bloqueou esta análise pelo filtro de segurança.', retryable: false }
    };
  }

  const text = extractText(data);
  if (!text) {
    return {
      ok: false,
      error: { code: 'EMPTY_RESPONSE', userMessage: 'O Gemini não retornou uma análise para este vídeo. Tente novamente.', retryable: true }
    };
  }

  return { ok: true, text, model, usageMetadata: (data && data.usageMetadata) || null };
}

export async function listGeminiModels({ apiKey } = {}) {
  const result = await requestJson(GEMINI_API_BASE, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey }
  });
  if (!result.ok) return { ok: false, error: result.error };

  const data = result.data;
  const models = ((data && data.models) || [])
    .filter((model) => model && model.id && Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes('generateContent'))
    .map((model) => ({
      id: String(model.id).replace(/^models\//, ''),
      label: model.displayName || String(model.id).replace(/^models\//, '')
    }));

  return { ok: true, models };
}
