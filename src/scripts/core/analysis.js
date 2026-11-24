import {
  PERIOD_DAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  HOUR_BLOCKS,
  STOPWORDS,
  MIN_FOR_TIME_ANALYSIS,
  MIN_FOR_TOPICS,
  MIN_FOR_TREND,
  MIN_FOR_CONSISTENCY,
  TOPIC_MIN_OCCURRENCES
} from '../constants.js';
import { formatNumber, formatDecimal, isValidVideo, safeViews } from './format.js';

export function filterVideosByPeriod(videos, period) {
  const days = PERIOD_DAYS[period];
  if (!days) return videos.slice();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return videos.filter((v) => isValidVideo(v) && new Date(v.publishedAt).getTime() >= cutoff);
}

export function calculateAverageViews(videos) {
  if (!videos || videos.length === 0) return 0;
  const sum = videos.reduce((acc, v) => acc + safeViews(v), 0);
  return sum / videos.length;
}

export function calculateMedianViews(videos) {
  if (!videos || videos.length === 0) return 0;
  const sorted = videos.map(safeViews).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function calculatePerformance(videos) {
  if (!videos || videos.length === 0) {
    return { avg: 0, median: 0, max: 0, min: 0, count: 0 };
  }
  const viewsArr = videos.map(safeViews);
  return {
    avg: calculateAverageViews(videos),
    median: calculateMedianViews(videos),
    max: Math.max(...viewsArr),
    min: Math.min(...viewsArr),
    count: videos.length
  };
}

export function sortVideosForContent(videos, sort = 'best') {
  const mode = sort === 'date' ? 'newest' : sort === 'audience' ? 'best' : sort;
  const list = Array.isArray(videos) ? videos.slice() : [];
  const publishedTime = (video) => {
    const time = new Date(video && video.publishedAt).getTime();
    return Number.isFinite(time) ? time : 0;
  };
  return list.sort((a, b) => {
    if (mode === 'newest') return publishedTime(b) - publishedTime(a);
    if (mode === 'oldest') return publishedTime(a) - publishedTime(b);
    if (mode === 'worst') return safeViews(a) - safeViews(b);
    return safeViews(b) - safeViews(a);
  });
}

export function performanceLabel(views, avg) {
  if (!avg || avg <= 0) return { key: 'unknown', text: 'Sem base' };
  const ratio = views / avg;
  if (ratio >= 1.1) return { key: 'above', text: 'Acima da média' };
  if (ratio <= 0.9) return { key: 'below', text: 'Abaixo da média' };
  return { key: 'average', text: 'Na média' };
}

export function getHourBlock(hour) {
  return HOUR_BLOCKS.find((b) => hour >= b.start && hour <= b.end) || HOUR_BLOCKS[0];
}

export function calculateBestPostingDay(videos) {
  const valid = videos.filter(isValidVideo);
  if (valid.length < MIN_FOR_TIME_ANALYSIS) return null;

  const buckets = WEEKDAY_LABELS.map((label, idx) => ({ idx, label, short: WEEKDAY_SHORT[idx], total: 0, count: 0 }));
  valid.forEach((v) => {
    const day = new Date(v.publishedAt).getDay();
    buckets[day].total += safeViews(v);
    buckets[day].count += 1;
  });
  const withData = buckets.filter((b) => b.count > 0).map((b) => ({ ...b, avg: b.total / b.count }));
  if (withData.length === 0) return null;
  withData.sort((a, b) => b.avg - a.avg);
  return { best: withData[0], all: withData };
}

export function calculateBestPostingTime(videos) {
  const valid = videos.filter(isValidVideo);
  if (valid.length < MIN_FOR_TIME_ANALYSIS) return null;

  const buckets = HOUR_BLOCKS.map((b) => ({ ...b, total: 0, count: 0 }));
  valid.forEach((v) => {
    const hour = new Date(v.publishedAt).getHours();
    const block = getHourBlock(hour);
    const bucket = buckets.find((b) => b.key === block.key);
    bucket.total += safeViews(v);
    bucket.count += 1;
  });
  const withData = buckets.filter((b) => b.count > 0).map((b) => ({ ...b, avg: b.total / b.count }));
  if (withData.length === 0) return null;
  withData.sort((a, b) => b.avg - a.avg);
  return { best: withData[0], all: withData };
}

export function calculateBestCombo(videos) {
  const valid = videos.filter(isValidVideo);
  if (valid.length < MIN_FOR_TIME_ANALYSIS) return null;

  const map = new Map();
  valid.forEach((v) => {
    const d = new Date(v.publishedAt);
    const day = d.getDay();
    const block = getHourBlock(d.getHours());
    const key = `${day}-${block.key}`;
    if (!map.has(key)) {
      map.set(key, {
        day,
        dayLabel: WEEKDAY_SHORT[day],
        block: block.key,
        blockLabel: block.label,
        blockRange: block.range,
        total: 0,
        count: 0
      });
    }
    const entry = map.get(key);
    entry.total += safeViews(v);
    entry.count += 1;
  });
  const combos = Array.from(map.values()).map((e) => ({ ...e, avg: e.total / e.count }));
  if (combos.length === 0) return null;
  combos.sort((a, b) => b.avg - a.avg);
  return {
    best: combos[0],
    secondBest: combos.length > 1 ? combos[1] : null,
    worst: combos[combos.length - 1],
    all: combos
  };
}

export function tokenizeTitle(title) {
  if (!title) return [];
  return String(title)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export function analyzeTopics(videos) {
  const valid = videos.filter((v) => v && v.title);
  if (valid.length < MIN_FOR_TOPICS) return [];

  const map = new Map();
  valid.forEach((v) => {
    const words = new Set(tokenizeTitle(v.title));
    words.forEach((word) => {
      if (!map.has(word)) map.set(word, { word, count: 0, totalViews: 0, videos: [] });
      const entry = map.get(word);
      entry.count += 1;
      entry.totalViews += safeViews(v);
      entry.videos.push(v);
    });
  });

  return Array.from(map.values())
    .filter((t) => t.count >= TOPIC_MIN_OCCURRENCES)
    .map((t) => ({
      word: t.word,
      count: t.count,
      avgViews: t.totalViews / t.count,
      bestVideo: t.videos.reduce((best, v) => (safeViews(v) > safeViews(best) ? v : best), t.videos[0]),
      videos: t.videos
    }))
    .sort((a, b) => b.count - a.count || b.avgViews - a.avgViews)
    .slice(0, 8);
}

export function calculateConsistency(videos) {
  const valid = videos
    .filter(isValidVideo)
    .slice()
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  if (valid.length < MIN_FOR_CONSISTENCY) return null;

  const gaps = [];
  for (let i = 1; i < valid.length; i++) {
    const diffDays = (new Date(valid[i].publishedAt) - new Date(valid[i - 1].publishedAt)) / (1000 * 60 * 60 * 24);
    gaps.push(diffDays);
  }
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((acc, g) => acc + Math.pow(g - meanGap, 2), 0) / gaps.length;
  const std = Math.sqrt(variance);
  const cv = meanGap > 0 ? std / meanGap : 1;
  const score = Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
  return { score, avgGapDays: meanGap };
}

export function calculateChannelHealth(videos, consistency) {
  const valid = videos.filter(isValidVideo);
  if (valid.length < MIN_FOR_CONSISTENCY) return null;

  const sorted = valid.slice().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const lastVideoDays = Math.max(0, Math.floor((Date.now() - new Date(sorted[0].publishedAt).getTime()) / (1000 * 60 * 60 * 24)));

  const criteria = [];
  const recencyScore = lastVideoDays <= 7 ? 25 : lastVideoDays <= 30 ? 18 : lastVideoDays <= 60 ? 10 : 3;
  criteria.push({ label: 'Atividade recente', short: 'Atividade', detail: `Último vídeo publicado há ${lastVideoDays} dia(s)`, points: recencyScore, max: 25 });

  let frequencyScore = 5;
  if (consistency) {
    const g = consistency.avgGapDays;
    frequencyScore = g <= 3 ? 25 : g <= 7 ? 20 : g <= 14 ? 15 : g <= 30 ? 10 : 5;
  }
  criteria.push({
    label: 'Frequência de publicação',
    short: 'Frequência',
    detail: consistency ? `Intervalo médio de ${formatDecimal(consistency.avgGapDays)} dia(s)` : 'Dados insuficientes',
    points: frequencyScore,
    max: 25
  });

  const consistencyScore = consistency ? Math.round((consistency.score / 100) * 25) : 5;
  criteria.push({
    label: 'Consistência entre publicações',
    short: 'Consistência',
    detail: consistency ? `Índice de regularidade: ${consistency.score}/100` : 'Dados insuficientes',
    points: consistencyScore,
    max: 25
  });

  const sampleScore = Math.round((Math.min(valid.length, 20) / 20) * 25);
  criteria.push({ label: 'Volume de dados analisados', short: 'Volume', detail: `${valid.length} vídeo(s) recente(s) analisado(s)`, points: sampleScore, max: 25 });

  const total = recencyScore + frequencyScore + consistencyScore + sampleScore;
  return { score: Math.max(0, Math.min(100, total)), criteria };
}

export function calculateTrend(videos) {
  const valid = videos
    .filter(isValidVideo)
    .slice()
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  if (valid.length < MIN_FOR_TREND) return null;

  const mid = Math.floor(valid.length / 2);
  const older = valid.slice(0, mid);
  const newer = valid.slice(mid);
  if (older.length < 2 || newer.length < 2) return null;

  const avgOld = calculateAverageViews(older);
  const avgNew = calculateAverageViews(newer);
  const diffPct = avgOld > 0 ? ((avgNew - avgOld) / avgOld) * 100 : null;

  return { avgOld, avgNew, diffPct, olderCount: older.length, newerCount: newer.length };
}

export function generateInsights(ctx) {
  const { videos, topics, bestDay, bestTime, perf, trend } = ctx;
  const insights = [];

  if (topics && topics.length > 0) {
    const top = topics.slice().sort((a, b) => b.avgViews - a.avgViews)[0];
    if (top.avgViews > perf.avg) {
      insights.push(
        `Vídeos com "${top.word}" no título apresentam média de ${formatNumber(top.avgViews)} visualizações, acima da média geral do canal (${formatNumber(perf.avg)}).`
      );
    }
  }

  if (videos.length >= 2) {
    const valid = videos.filter(isValidVideo);
    if (valid.length >= 2) {
      const sorted = valid.slice().sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
      const spanDays = Math.max(
        1,
        Math.round((new Date(sorted[sorted.length - 1].publishedAt) - new Date(sorted[0].publishedAt)) / (1000 * 60 * 60 * 24))
      );
      insights.push(`Você publicou ${valid.length} vídeos nos últimos ${spanDays} dias, considerando os vídeos analisados.`);
    }
  }

  if (bestTime && bestDay) {
    insights.push(
      `Entre os vídeos analisados, o maior desempenho médio ocorreu nas publicações feitas às ${bestTime.best.label} (${bestTime.best.range}), em ${bestDay.best.label}.`
    );
  }

  if (trend && trend.diffPct != null) {
    const direction = trend.diffPct >= 0 ? 'crescimento' : 'queda';
    insights.push(
      `Comparando os vídeos mais antigos com os mais recentes da amostra, há uma tendência de ${direction} de ${formatDecimal(Math.abs(trend.diffPct))}% na média de visualizações.`
    );
  }

  return insights;
}

export function generateRecommendations(topics) {
  const recs = [];
  if (!topics || topics.length === 0) return recs;
  const sortedByAvg = topics.slice().sort((a, b) => b.avgViews - a.avgViews);
  const top = sortedByAvg[0];
  if (top) {
    recs.push(`Seu melhor desempenho recente está relacionado a "${top.word}" — considere criar mais conteúdos sobre esse assunto.`);
  }
  return recs;
}

export function buildRecommendedCalendar(bestCombo, topics) {
  if (!bestCombo) return null;
  const topTheme = topics && topics.length > 0 ? topics[0].word : null;
  const days = [];
  const today = new Date();

  for (let i = 1; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const weekday = date.getDay();
    const combosForDay = bestCombo.all.filter((c) => c.day === weekday).sort((a, b) => b.avg - a.avg);
    const combo = combosForDay[0] || bestCombo.best;
    const confidence = combo.count >= 3 ? 'Alta' : combo.count >= 1 ? 'Média' : 'Baixa';
    days.push({
      date,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      suggestedTime: `${combo.blockLabel} (${combo.blockRange})`,
      theme: topTheme,
      confidence
    });
  }
  return days;
}

export function generateVideoIdeas(topics) {
  if (!topics || topics.length === 0) return [];
  const year = new Date().getFullYear();
  const topWords = topics.slice(0, 3).map((t) => t.word);
  const templates = [
    (w) => `Como dominar ${w} em ${year}: Guia Completo e Atualizado`,
    (w) => `5 Erros comuns ao falar sobre ${w} (e como evitar)`,
    (w) => `O segredo de ${w} que ninguém te conta`,
    (w) => `Minha jornada com ${w}: O que aprendi na prática`,
    (w) => `${w} para iniciantes: Passo a passo definitivo`
  ];

  const ideas = [];
  topWords.forEach((w) => {
    templates.slice(0, 2).forEach((tmpl) => {
      ideas.push({ title: tmpl(w), basedOn: w, status: 'ideia' });
    });
  });

  return [...new Map(ideas.map((item) => [item.title, item])).values()].slice(0, 6);
}
