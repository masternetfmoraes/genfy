import { getGeminiApiKey, loadGeminiSettings } from './geminiConfig.js';
import { generateGeminiText, listGeminiModels } from './geminiClient.js';
import { noApiKeyFailure } from './geminiErrors.js';
import { getSeoSignals, truncateSeoText } from '../../core/seo.js';

export function buildVideoAnalysisPrompt({ video = {}, channel = {}, avgViews = 0 } = {}) {
  const views = Number(video.viewCount || 0) || 0;
  const avg = Number(avgViews || 0) || 0;
  const ratio = avg > 0 ? `${(views / avg).toFixed(2)}x a média do período` : 'média do período indisponível';
  const duration = Number(video.durationSeconds || 0) || 0;
  const kind = duration > 0 && duration <= 60 ? 'Short' : 'Vídeo longo';
  const published = video.publishedAt ? String(video.publishedAt).slice(0, 10) : 'data indisponível';
  const durationLine = duration > 0 ? `Duração: ${Math.round(duration)} segundos.` : '';
  const seo = getSeoSignals(video);
  const seoDescription = seo.descriptionLength
    ? `${seo.descriptionLength} caracteres; trecho: ${truncateSeoText(seo.description, 300)}`
    : 'indisponível';
  const seoTagsLine = seo.tagsCount
    ? `Tags (${seo.tagsCount}): ${seo.tags.slice(0, 10).join(', ')}.`
    : 'Tags: indisponível.';

  return [
    'Você é um consultor de crescimento de canais do YouTube.',
    'Analise apenas este vídeo com os dados abaixo e responda em português do Brasil, em texto simples (sem markdown).',
    'Use exatamente estas seções, nesta ordem, com 2 a 4 frases curtas cada uma:',
    'RESUMO:',
    'DESEMPENHO:',
    'SEO:',
    'PONTOS FORTES:',
    'RISCOS:',
    'PRÓXIMOS PASSOS:',
    '',
    `Canal: ${channel.title || 'canal conectado'}.`,
    `Vídeo: ${seo.title || 'sem título'}.`,
    `Tipo: ${kind}.`,
    `Publicação: ${published}.`,
    `Visualizações: ${views} (${ratio}; média arredondada: ${Math.round(avg)}).`,
    durationLine,
    `Título: ${seo.titleLength} caracteres.`,
    `Descrição: ${seoDescription}`,
    seoTagsLine,
    `Categoria: ${seo.categoryId || 'indisponível'}.`,
    'Na seção SEO, avalie apenas título, descrição, tags e categoria acima; não afirme nada sobre a miniatura, cujo conteúdo não foi fornecido.',
    'Não invente dados que não estejam aqui.'
  ].filter(Boolean).join('\n');
}

function displayNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('pt-BR');
}

export function buildChannelAnalysisPrompt(ctx = {}) {
  const {
    channel = {},
    periodLabel = 'período selecionado',
    videos = [],
    perf = {},
    bestDay = null,
    bestTime = null,
    bestCombo = null,
    topics = [],
    consistency = null,
    health = null,
    trend = null,
    insights = [],
    recommendations = [],
    ideas = []
  } = ctx;

  const topVideos = videos.slice()
    .sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
    .slice(0, 3);
  const best = topVideos[0];
  const topTopics = topics.slice(0, 5)
    .map((topic) => `${topic.word} (${topic.count} vídeos, média ${displayNumber(topic.avgViews)})`)
    .join('; ') || 'não identificado';
  const topVideoList = topVideos
    .map((video) => `"${video.title || 'sem título'}" (${displayNumber(video.viewCount)} visualizações)`)
    .join('; ') || 'sem dados';
  const trendText = trend && trend.diffPct != null
    ? `${displayNumber(Math.abs(trend.diffPct))}% de ${trend.diffPct >= 0 ? 'crescimento' : 'queda'}`
    : 'dados insuficientes';

  return [
    'Você é um consultor de crescimento de canais do YouTube.',
    'Analise o canal com os dados abaixo e responda em português do Brasil, em texto simples (sem markdown).',
    'Use exatamente estas seções, nesta ordem, com 2 a 4 frases curtas cada:',
    'RESUMO GERAL DO CANAL:',
    'ANÁLISE TÉCNICA:',
    'MELHORES DIAS E HORÁRIOS:',
    'MELHORES VÍDEOS E ANÁLISE DO MELHOR VÍDEO:',
    'ASSUNTOS A SEGUIR:',
    'SUGESTÕES DE VÍDEOS E IDEIAS:',
    'PRÓXIMOS PASSOS:',
    '',
    `Canal: ${channel.title || 'canal conectado'}.`,
    `Período analisado: ${periodLabel}.`,
    `Amostra: ${videos.length} vídeo(s)/short(s); média de ${displayNumber(perf.avg)} visualizações; mediana de ${displayNumber(perf.median)}; maior vídeo com ${displayNumber(perf.max)}.`,
    `Regularidade: ${consistency ? `índice ${consistency.score}/100, intervalo médio de ${Number(consistency.avgGapDays || 0).toFixed(1)} dia(s)` : 'dados insuficientes'}.`,
    `Saúde do canal: ${health ? `${health.score}/100` : 'dados insuficientes'}.`,
    `Tendência da amostra: ${trendText}.`,
    `Melhor dia: ${bestDay ? bestDay.best.label : 'dados insuficientes'}; melhor horário: ${bestTime ? `${bestTime.best.label} (${bestTime.best.range})` : 'dados insuficientes'}; melhor combinação: ${bestCombo ? `${bestCombo.best.dayLabel} ${bestCombo.best.blockLabel}` : 'dados insuficientes'}.`,
    `Assuntos recorrentes: ${topTopics}.`,
    `Vídeos de maior desempenho: ${topVideoList}.`,
    `Melhor vídeo do canal: "${best ? best.title || 'sem título' : 'sem dados'}" com ${displayNumber(best ? best.viewCount : 0)} visualizações, publicado em ${best && best.publishedAt ? String(best.publishedAt).slice(0, 10) : 'data indisponível'}.`,
    `Insights calculados pelo sistema: ${insights.join(' ') || 'sem dados'}`,
    `Recomendações calculadas pelo sistema: ${recommendations.join(' ') || 'sem dados'}`,
    `Ideias calculadas pelo sistema: ${ideas.map((idea) => idea.title).join('; ') || 'sem dados'}.`,
    'Não invente números, datas ou fatos que não estejam aqui.'
  ].join('\n');
}

export async function analyzeChannel(ctx = {}) {
  const apiKey = (await getGeminiApiKey()).trim();
  if (!apiKey) return { ok: false, error: noApiKeyFailure() };
  const { model } = await loadGeminiSettings();
  return generateGeminiText({ apiKey, model, prompt: buildChannelAnalysisPrompt(ctx) });
}

export async function analyzeVideo({ video, channel, avgViews } = {}) {
  const apiKey = (await getGeminiApiKey()).trim();
  if (!apiKey) return { ok: false, error: noApiKeyFailure() };
  if (!video || !video.id) {
    return { ok: false, error: { code: 'NO_VIDEO', userMessage: 'Vídeo inválido para análise.', retryable: false } };
  }
  const { model } = await loadGeminiSettings();
  const prompt = buildVideoAnalysisPrompt({ video, channel, avgViews });
  return generateGeminiText({ apiKey, model, prompt });
}

export async function testGeminiConnection({ apiKey, model } = {}) {
  const key = String(apiKey != null ? apiKey : await getGeminiApiKey()).trim();
  if (!key) {
    const error = noApiKeyFailure();
    return { ok: false, error, message: error.userMessage };
  }
  const selectedModel = model || (await loadGeminiSettings()).model;
  const result = await generateGeminiText({ apiKey: key, model: selectedModel, prompt: 'Responda apenas com: OK' });
  if (!result.ok) return { ok: false, error: result.error, message: result.error.userMessage };
  return { ok: true, message: `Conexão bem-sucedida com ${result.model}.`, model: result.model };
}

export async function detectGeminiModels({ apiKey } = {}) {
  const key = String(apiKey != null ? apiKey : await getGeminiApiKey()).trim();
  if (!key) return { ok: false, error: noApiKeyFailure() };
  return listGeminiModels({ apiKey: key });
}
