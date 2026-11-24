export function noApiKeyFailure() {
  return {
    code: 'NO_KEY',
    userMessage: 'Chave da API Gemini não configurada. Abra Configurações e cole sua chave.',
    retryable: false
  };
}

export function classifyGeminiFailure({ status = 0, code = '', message = '', aborted = false, network = false } = {}) {
  const text = `${code || ''} ${message || ''}`;

  if (network) {
    return { code: 'NETWORK', userMessage: 'Não foi possível conectar à API do Gemini. Verifique sua conexão e tente novamente.', retryable: true };
  }
  if (aborted) {
    return { code: 'TIMEOUT', userMessage: 'A análise demorou muito e foi cancelada. Tente novamente.', retryable: true };
  }
  if (status === 400 || status === 401 || status === 403) {
    if (/api[ _-]?key|api_key_invalid|invalid.*key|key.*invalid|unauthenticated|permission denied/i.test(text)) {
      return { code: 'INVALID_KEY', userMessage: 'Chave da API inválida. Confira a chave colada em Configurações (Google AI Studio).', retryable: false };
    }
    if (/not enabled|service_disabled|enable.*api|api.*disabled/i.test(text)) {
      return { code: 'API_DISABLED', userMessage: 'A API Gemini não está habilitada para esta chave/projeto. Ative-a no Google AI Studio.', retryable: false };
    }
    return { code: 'AUTH', userMessage: `A API Gemini recusou a requisição (HTTP ${status}). Confira a chave e as permissões do projeto.`, retryable: false };
  }
  if (status === 404) {
    return { code: 'MODEL_UNAVAILABLE', userMessage: 'Modelo indisponível para esta chave. Use "Detectar modelos" em Configurações e salve outro modelo.', retryable: false };
  }
  if (status === 429) {
    if (/per day|daily|day limit|quota.*day|resource exhausted.*day/i.test(text)) {
      return { code: 'DAILY_QUOTA', userMessage: 'Cota diária da API Gemini esgotada. Tente novamente amanhã ou use outra chave/projeto.', retryable: false };
    }
    if (/rate limit|requests per minute|too many requests|per minute/i.test(text)) {
      return { code: 'RATE_LIMIT', userMessage: 'Limite de requisições por minuto atingido. Aguarde alguns segundos e tente novamente.', retryable: true };
    }
    return { code: 'QUOTA', userMessage: 'Limite/cota da API Gemini atingido. Aguarde e tente novamente; se for cota diária, use outra chave ou espere o próximo dia.', retryable: false };
  }
  if (status === 503) {
    return {
      code: 'OVERLOADED',
      userMessage: 'O modelo Gemini está com alta demanda. Foram feitas tentativas automáticas; se persistir, escolha "Gemini 3.5 Flash-Lite" em Configurações.',
      retryable: true
    };
  }
  if (status >= 500) {
    return { code: 'SERVICE_ERROR', userMessage: 'O serviço Gemini está temporariamente indisponível. Tente novamente em instantes.', retryable: true };
  }
  return { code: 'HTTP_ERROR', userMessage: `Falha ao analisar com Gemini (HTTP ${status || 'desconhecido'}).`, retryable: true };
}
