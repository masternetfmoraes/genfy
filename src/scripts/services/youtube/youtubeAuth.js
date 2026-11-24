// src/scripts/services/youtube/youtubeAuth.js
//
// Autenticação OAuth 2.0 com o Google via chrome.identity.getAuthToken.
// Usa um OAuth Client do tipo "Chrome Extension" (não requer client_secret).
//
// O Client ID também precisa estar declarado no manifest.json,
// dentro do bloco "oauth2". O manifest também precisa das permissões
// "identity" e "storage".
//
// ESCOPOS (autorização incremental):
//  - Login normal: somente youtube.readonly (comportamento original).
//  - Analytics: yt-analytics.readonly é pedido à parte, quando o usuário clica em
//    "Conectar YouTube Analytics" (authorizeAnalytics). Não existe segundo login:
//    é o mesmo chrome.identity, apenas com a lista de escopos ampliada.
//  - Publicação: youtube (leitura/escrita) é pedido à parte, no primeiro envio ou
//    agendamento (authorizePublish). Esse escopo permite videos.insert,
//    videos.update, videos.delete e thumbnails.set.
//
// PERSISTÊNCIA: o Chrome já guarda o consentimento do usuário. Aqui lembramos
// (em chrome.storage.local) que o usuário estava logado e se o Analytics foi
// autorizado, para restaurar a sessão em modo silencioso (interactive: false).

import { storageGet, storageSet, storageRemove } from '../storage.js';

// O Client ID vive apenas no manifest.json (bloco "oauth2"), evitando duplicação.

export const SCOPE_YOUTUBE = 'https://www.googleapis.com/auth/youtube.readonly';
export const SCOPE_ANALYTICS = 'https://www.googleapis.com/auth/yt-analytics.readonly';
export const SCOPE_PUBLISH = 'https://www.googleapis.com/auth/youtube';
export const SCOPE_COMMENTS = 'https://www.googleapis.com/auth/youtube.force-ssl';

const SESSION_KEY = 'genfy_session';

let cachedToken = null;
let analyticsGranted = false;
let publishGranted = false;
let commentsGranted = false;
// Todos os tokens emitidos nesta sessão (o Chrome guarda um por conjunto de escopos).
const issuedTokens = new Set();

function hasIdentity() {
  return (
    typeof chrome !== 'undefined' &&
    chrome.identity &&
    chrome.identity.getAuthToken
  );
}

function scopesFor(withAnalytics, withPublish, withComments) {
  const scopes = [SCOPE_YOUTUBE];
  if (withAnalytics) scopes.push(SCOPE_ANALYTICS);
  if (withPublish) scopes.push(SCOPE_PUBLISH);
  if (withComments) scopes.push(SCOPE_COMMENTS);
  return scopes;
}

// Chrome retorna { token, grantedScopes, ... } em versões MV3 recentes,
// mas versões antigas retornam a string direto. Aceitamos os dois.
function parseResult(result) {
  if (typeof result === 'string') return { token: result, grantedScopes: null };
  return {
    token: (result && result.token) || null,
    grantedScopes: result && Array.isArray(result.grantedScopes) ? result.grantedScopes : null
  };
}

function applyToken(parsed, requestedAnalytics, requestedPublish, requestedComments) {
  cachedToken = parsed.token;
  issuedTokens.add(parsed.token);
  // Se o Chrome informa os escopos concedidos, confiamos nele (o usuário pode
  // desmarcar permissões na tela de consentimento). Senão, assumimos o pedido.
  if (parsed.grantedScopes) {
    analyticsGranted = parsed.grantedScopes.includes(SCOPE_ANALYTICS);
    publishGranted = parsed.grantedScopes.includes(SCOPE_PUBLISH);
    commentsGranted = parsed.grantedScopes.includes(SCOPE_COMMENTS);
  } else {
    analyticsGranted = requestedAnalytics;
    publishGranted = requestedPublish;
    commentsGranted = requestedComments;
  }
}

async function persistSession() {
  await storageSet(SESSION_KEY, {
    signedIn: true,
    analytics: analyticsGranted,
    publish: publishGranted,
    comments: commentsGranted,
    at: Date.now()
  });
}

export function getCachedToken() {
  return cachedToken;
}

// O token atual cobre o escopo do YouTube Analytics?
export function hasAnalyticsScope() {
  return !!cachedToken && analyticsGranted;
}

// O token atual permite publicar/editar vídeos no YouTube?
export function hasPublishScope() {
  return !!cachedToken && publishGranted;
}

export function hasCommentsScope() {
  return !!cachedToken && commentsGranted;
}

// O usuário já fez login antes neste navegador (e não clicou em "Sair")?
export async function wasSignedIn() {
  const session = await storageGet(SESSION_KEY, null);
  return !!(session && session.signedIn);
}

export function clearToken() {
  const tokens = Array.from(issuedTokens);
  if (cachedToken) tokens.push(cachedToken);
  cachedToken = null;
  analyticsGranted = false;
  publishGranted = false;
  commentsGranted = false;
  issuedTokens.clear();

  // Esquece a sessão persistida: a próxima abertura volta para o login.
  storageRemove(SESSION_KEY);

  // Best-effort: pede ao Chrome para esquecer os tokens em cache,
  // para que o próximo login mostre a tela de consentimento de novo.
  if (
    typeof chrome !== 'undefined' &&
    chrome.identity &&
    chrome.identity.removeCachedAuthToken
  ) {
    new Set(tokens).forEach((token) => {
      chrome.identity
        .removeCachedAuthToken({ token })
        .catch((err) => console.warn('Falha ao remover token em cache:', err));
    });
  }
}

// Tenta obter um token SEM interação. Retorna null se não for possível.
async function silentToken(withAnalytics, withPublish, withComments) {
  if (!hasIdentity()) return null;
  try {
    const result = await chrome.identity.getAuthToken({
      interactive: false,
      scopes: scopesFor(withAnalytics, withPublish, withComments)
    });
    const parsed = parseResult(result);
    return parsed.token ? parsed : null;
  } catch (err) {
    console.info('Login silencioso indisponível:', err && err.message);
    return null;
  }
}

// Chamada no boot da página: restaura a sessão sem mostrar tela de login.
export async function restoreSession() {
  const session = await storageGet(SESSION_KEY, null);
  if (!session || !session.signedIn) return null;

  // Tenta restaurar o maior conjunto de escopos já autorizado. Se uma permissão
  // foi revogada, cai progressivamente para Analytics e depois só leitura.
  if (session.comments) {
    const all = await silentToken(!!session.analytics, !!session.publish, true);
    if (all) {
      applyToken(all, !!session.analytics, !!session.publish, true);
      await persistSession();
      return cachedToken;
    }
  }

  if (session.publish) {
    const both = await silentToken(!!session.analytics, true, false);
    if (both) {
      applyToken(both, !!session.analytics, true, false);
      await persistSession();
      return cachedToken;
    }
  }

  if (session.analytics) {
    const withAnalytics = await silentToken(true, false, false);
    if (withAnalytics) {
      applyToken(withAnalytics, true, false, false);
      await persistSession();
      return cachedToken;
    }
  }

  // Sem Analytics/Publicação/Comentários (nunca autorizado, ou revogado): só leitura.
  const base = await silentToken(false, false, false);
  if (base) {
    applyToken(base, false, false, false);
    await persistSession();
    return cachedToken;
  }

  // Consentimento revogado ou conta deslogada do Chrome: encerra a sessão salva.
  await storageRemove(SESSION_KEY);
  return null;
}

// Chamada quando a API responde 401/403: descarta o token vencido e pega outro.
export async function refreshToken() {
  const old = cachedToken;
  const hadAnalytics = analyticsGranted;
  const hadPublish = publishGranted;
  const hadComments = commentsGranted;
  cachedToken = null;
  if (old && chrome.identity.removeCachedAuthToken) {
    try {
      await chrome.identity.removeCachedAuthToken({ token: old });
    } catch (err) {
      console.warn('Falha ao remover token vencido:', err);
    }
  }
  const fresh = await silentToken(hadAnalytics, hadPublish, hadComments);
  if (fresh) applyToken(fresh, hadAnalytics, hadPublish, hadComments);
  return cachedToken;
}

export async function signIn() {
  if (!hasIdentity()) {
    throw new Error(
      'chrome.identity.getAuthToken indisponível. Rode esta página como extensão do Chrome.'
    );
  }

  let result;
  try {
    result = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: scopesFor(false, false, false)
    });
  } catch (err) {
    console.error('Falha no getAuthToken:', err);
    throw new Error('Não foi possível autenticar com o Google.');
  }

  const parsed = parseResult(result);

  if (!parsed.token) {
    throw new Error('O Google não retornou um token de acesso.');
  }

  applyToken(parsed, false, false, false);
  await persistSession();
  return cachedToken;
}

// Autorização incremental do YouTube Analytics (somente leitura).
// DEVE ser chamada a partir de um clique do usuário (abre a tela de consentimento).
export async function authorizeAnalytics() {
  if (!hasIdentity()) {
    throw new Error('Autorização indisponível fora da extensão do Chrome.');
  }

  let result;
  try {
    result = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: scopesFor(true, publishGranted, commentsGranted)
    });
  } catch (err) {
    console.warn('Autorização do Analytics não concluída:', err);
    throw new Error('A autorização do YouTube Analytics foi cancelada ou não pôde ser concluída.');
  }

  const parsed = parseResult(result);
  if (!parsed.token) {
    throw new Error('O Google não retornou um token de acesso.');
  }

  applyToken(parsed, true, publishGranted, commentsGranted);
  await persistSession();

  if (!analyticsGranted) {
    throw new Error('A permissão de leitura do YouTube Analytics não foi concedida.');
  }
  return cachedToken;
}

// Autorização incremental para publicar/editar vídeos.
// DEVE ser chamada a partir de um clique do usuário (abre a tela de consentimento).
export async function authorizePublish() {
  if (!hasIdentity()) {
    throw new Error('Autorização de publicação indisponível fora da extensão do Chrome.');
  }

  let result;
  try {
    result = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: scopesFor(analyticsGranted, true, commentsGranted)
    });
  } catch (err) {
    console.warn('Autorização de publicação não concluída:', err);
    throw new Error('A autorização para publicar no YouTube foi cancelada ou não pôde ser concluída.');
  }

  const parsed = parseResult(result);
  if (!parsed.token) {
    throw new Error('O Google não retornou um token de acesso.');
  }

  applyToken(parsed, analyticsGranted, true, commentsGranted);
  await persistSession();

  if (!publishGranted) {
    throw new Error('A permissão para publicar e editar vídeos no YouTube não foi concedida.');
  }
  return cachedToken;
}

// A API respondeu 403 de permissão: registra que o escopo não está valendo.
export function markAnalyticsNotGranted() {
  analyticsGranted = false;
  if (cachedToken) persistSession();
}

export function markPublishNotGranted() {
  publishGranted = false;
  if (cachedToken) persistSession();
}

export async function authorizeComments() {
  if (!hasIdentity()) {
    throw new Error('Autorização de comentários indisponível fora da extensão do Chrome.');
  }

  let result;
  try {
    result = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: scopesFor(analyticsGranted, publishGranted, true)
    });
  } catch (err) {
    console.warn('Autorização de comentários não concluída:', err);
    throw new Error('A autorização para ler comentários foi cancelada ou não pôde ser concluída.');
  }

  const parsed = parseResult(result);
  if (!parsed.token) {
    throw new Error('O Google não retornou um token de acesso.');
  }

  applyToken(parsed, analyticsGranted, publishGranted, true);
  await persistSession();

  if (!commentsGranted) {
    throw new Error('A permissão para ler comentários não foi concedida.');
  }
  return cachedToken;
}

export function markCommentsNotGranted() {
  commentsGranted = false;
  if (cachedToken) persistSession();
}