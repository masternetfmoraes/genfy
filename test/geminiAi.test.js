import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiFailure, noApiKeyFailure } from '../src/scripts/services/ai/geminiErrors.js';
import { buildVideoAnalysisPrompt, buildChannelAnalysisPrompt } from '../src/scripts/services/ai/geminiService.js';
import { generateGeminiText } from '../src/scripts/services/ai/geminiClient.js';
import { DEFAULT_MODEL, isLegacyGeminiModel, normalizeGeminiModel } from '../src/scripts/services/ai/geminiConfig.js';

test('chave inválida recebe mensagem específica', () => {
  const error = classifyGeminiFailure({ status: 400, code: 'API_KEY_INVALID', message: 'API key not valid' });
  assert.equal(error.code, 'INVALID_KEY');
  assert.match(error.userMessage, /chave da API inválida/i);
});

test('cota diária e limite por minuto são diferenciados', () => {
  const daily = classifyGeminiFailure({ status: 429, message: 'quota per day exceeded' });
  const rate = classifyGeminiFailure({ status: 429, message: 'too many requests per minute' });
  assert.equal(daily.code, 'DAILY_QUOTA');
  assert.equal(rate.code, 'RATE_LIMIT');
});

test('modelo indisponível orienta a detectar modelos', () => {
  const error = classifyGeminiFailure({ status: 404, message: 'model not found' });
  assert.equal(error.code, 'MODEL_UNAVAILABLE');
  assert.match(error.userMessage, /Detectar modelos/);
});

test('falhas de rede e timeout têm mensagens próprias', () => {
  assert.equal(classifyGeminiFailure({ network: true }).code, 'NETWORK');
  assert.equal(classifyGeminiFailure({ aborted: true }).code, 'TIMEOUT');
});

test('sem chave configurada retorna NO_KEY', () => {
  assert.equal(noApiKeyFailure().code, 'NO_KEY');
});

test('prompt da análise individual traz seções, dados do vídeo e sinais de SEO', () => {
  const description = 'Descrição com palavra-chave, links e chamada para ação.';
  const prompt = buildVideoAnalysisPrompt({
    video: {
      title: 'Meu vídeo',
      viewCount: 320,
      durationSeconds: 900,
      publishedAt: '2025-08-14T00:00:00Z',
      description,
      tags: ['youtube', 'seo'],
      categoryId: '22'
    },
    channel: { title: 'Canal Teste' },
    avgViews: 160
  });
  assert.match(prompt, /RESUMO:/);
  assert.match(prompt, /DESEMPENHO:\nSEO:\nPONTOS FORTES:/);
  assert.match(prompt, /PRÓXIMOS PASSOS:/);
  assert.match(prompt, /Meu vídeo/);
  assert.match(prompt, /2\.00x a média/);
  assert.match(prompt, new RegExp(`Descrição: ${description.length} caracteres`));
  assert.match(prompt, /Tags \(2\): youtube, seo/);
  assert.match(prompt, /Categoria: 22/);
  assert.match(prompt, /não afirme nada sobre a miniatura/);
});

test('prompt da análise individual marca SEO indisponível quando a API não retorna campos', () => {
  const prompt = buildVideoAnalysisPrompt({ video: { title: 'Sem metadados' } });
  assert.match(prompt, /Descrição: indisponível/);
  assert.match(prompt, /Tags: indisponível/);
  assert.match(prompt, /Categoria: indisponível/);
});

test('prompt da análise geral do canal traz seções e contexto agregado', () => {
  const prompt = buildChannelAnalysisPrompt({
    channel: { title: 'Canal Teste' },
    periodLabel: '28 dias',
    videos: [
      { title: 'Vídeo campeão', viewCount: 1000, publishedAt: '2025-08-14T00:00:00Z' },
      { title: 'Outro vídeo', viewCount: 200 }
    ],
    perf: { avg: 600, median: 600, max: 1000 },
    bestDay: { best: { label: 'sábado' } },
    bestTime: { best: { label: 'noite', range: '18h-21h' } },
    bestCombo: { best: { dayLabel: 'sábado', blockLabel: 'noite' } },
    topics: [{ word: 'ia', count: 4, avgViews: 750 }],
    consistency: { score: 82, avgGapDays: 6 },
    health: { score: 77 },
    trend: { diffPct: 15 },
    insights: ['Insight A'],
    recommendations: ['Recomendação A'],
    ideas: [{ title: 'Ideia A' }]
  });

  for (const section of [
    'RESUMO GERAL DO CANAL:',
    'ANÁLISE TÉCNICA:',
    'MELHORES DIAS E HORÁRIOS:',
    'MELHORES VÍDEOS E ANÁLISE DO MELHOR VÍDEO:',
    'ASSUNTOS A SEGUIR:',
    'SUGESTÕES DE VÍDEOS E IDEIAS:',
    'PRÓXIMOS PASSOS:'
  ]) {
    assert.ok(prompt.includes(section), `seção ausente: ${section}`);
  }
  assert.match(prompt, /Canal Teste/);
  assert.match(prompt, /28 dias/);
  assert.match(prompt, /Vídeo campeão/);
  assert.match(prompt, /1\.000 visualizações/);
  assert.match(prompt, /sábado noite/);
  assert.match(prompt, /Ideia A/);
});

test('modelos antigos e o alias latest são migrados para o padrão atual', () => {
  assert.equal(normalizeGeminiModel('gemini-flash-latest'), DEFAULT_MODEL);
  assert.equal(normalizeGeminiModel('gemini-2.5-flash'), DEFAULT_MODEL);
  assert.equal(normalizeGeminiModel('gemini-2.0-flash-lite'), DEFAULT_MODEL);
  assert.equal(normalizeGeminiModel('gemini-3.8-flash'), 'gemini-3.8-flash');
  assert.equal(isLegacyGeminiModel('gemini-flash-latest'), true);
  assert.equal(isLegacyGeminiModel('gemini-3.5-flash-lite'), false);
});

test('503 orienta a trocar para um modelo menos demandado', () => {
  const error = classifyGeminiFailure({ status: 503, code: 'UNAVAILABLE', message: 'high demand' });
  assert.equal(error.code, 'OVERLOADED');
  assert.equal(error.retryable, true);
  assert.match(error.userMessage, /Flash-Lite/);
});

test('503 transitório é retentado e a chave viaja no header', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (calls.length < 3) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Análise de teste.' }] } }]
    }), { status: 200 });
  };

  try {
    const result = await generateGeminiText({
      apiKey: 'chave-teste',
      model: 'gemini-3.5-flash-lite',
      prompt: 'Analise este vídeo.'
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, 'Análise de teste.');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].init.headers['x-goog-api-key'], 'chave-teste');
    assert.equal(calls[0].url.includes('chave-teste'), false);
    assert.equal(calls[0].init.body.includes('generationConfig'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
