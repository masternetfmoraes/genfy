export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNumber(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (!isFinite(num)) return '—';
  return Math.round(num).toLocaleString('pt-BR');
}

export function formatDecimal(n, digits = 1) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function truncate(value, len) {
  if (!value) return '';
  return value.length > len ? value.slice(0, len) + '…' : value;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export function daysSince(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export function formatRelativeTime(date) {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Atualizado agora';
  if (diffMin === 1) return 'Atualizado há 1 minuto';
  if (diffMin < 60) return `Atualizado há ${diffMin} minutos`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return 'Atualizado há 1 hora';
  if (diffH < 24) return `Atualizado há ${diffH} horas`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? 'Atualizado há 1 dia' : `Atualizado há ${diffD} dias`;
}

export function safeViews(video) {
  const n = Number(video && video.viewCount);
  return isFinite(n) ? n : 0;
}

export function isValidVideo(video) {
  return Boolean(video && video.publishedAt && !isNaN(new Date(video.publishedAt).getTime()));
}

export function formatIsoDate(iso) {
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function formatPercent(p) {
  return p == null ? '—' : `${formatDecimal(p, 1)}%`;
}
