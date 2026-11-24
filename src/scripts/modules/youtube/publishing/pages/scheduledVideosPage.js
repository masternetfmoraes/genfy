import { UI } from '../../../../ui/designSystem.js';
import { escapeHtml, formatNumber } from '../../../../core/format.js';
import {
  PUBLICATION_STATUS,
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_PRIVACY_LABELS,
  VIDEO_UPLOAD_COST
} from '../../../../constants.js';

function badgeClass(status) {
  if (status === PUBLICATION_STATUS.PUBLISHED) return UI.badgeStatusActive;
  if (status === PUBLICATION_STATUS.SCHEDULED) return UI.badgeStatusOnHold;
  if (status === PUBLICATION_STATUS.UPLOADING) return UI.badgeStatusPlanning;
  if (status === PUBLICATION_STATUS.FAILED) return UI.badgePriorityHigh;
  return UI.badgeStatusCompleted;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function toLocalInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderQuota(quota) {
  if (!quota) {
    return `<div class="${UI.card} p-4 text-xs ${UI.muted}">Calculando cota diária...</div>`;
  }
  const pct = Math.max(0, Math.min(100, (quota.used / quota.limit) * 100));
  const maxUploads = Math.max(1, Math.floor(quota.limit / VIDEO_UPLOAD_COST));
  const tone = quota.remaining < VIDEO_UPLOAD_COST ? 'danger' : quota.used / quota.limit > 0.8 ? 'warning' : 'success';

  return `
    <div class="${UI.card} p-4 cursor-default">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-gray-900 dark:text-white">Cota estimada da YouTube API</p>
          <p class="text-[11px] ${UI.muted} mt-0.5">${formatNumber(quota.used)} de ${formatNumber(quota.limit)} unidades • restam ~${quota.estimatedUploads} uploads hoje (máx. ~${maxUploads})</p>
        </div>
        <span class="text-xs font-semibold ${UI[tone]}">${Math.round(pct)}% usada</span>
      </div>
      <div class="${UI.progressTrack} mt-3">
        <div class="h-full ${tone === 'danger' ? 'bg-rose-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full transition-all duration-500" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="text-[11px] ${UI.muted} mt-2">Estimativa local por navegador. A cota real é compartilhada pelo projeto do Google Cloud e reinicia à meia-noite no horário do Pacífico.</p>
    </div>
  `;
}

function renderPublication(item, { canPublish, editingId, busy }) {
  const status = item.status || PUBLICATION_STATUS.PRIVATE;
  const schedule = item.publishAt || item.scheduledAt;
  const isEditing = editingId === item.id;
  const canReschedule = canPublish && status === PUBLICATION_STATUS.SCHEDULED && !busy;
  const canCancel = canReschedule;
  const canDeleteRemote = canPublish && !busy && !item.remoteDeleted && status !== PUBLICATION_STATUS.SCHEDULED;
  const canRemoveLocal = !busy && [
    PUBLICATION_STATUS.CANCELED,
    PUBLICATION_STATUS.FAILED,
    PUBLICATION_STATUS.PRIVATE
  ].includes(status);

  return `
    <div class="rounded-xl border ${UI.border} p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(item.title || item.videoId)}</p>
          <p class="text-[11px] ${UI.muted} mt-0.5 font-mono break-all">${escapeHtml(item.videoId || '')}</p>
        </div>
        <span class="${UI.badgeBase} ${badgeClass(status)} whitespace-nowrap">${escapeHtml(PUBLICATION_STATUS_LABELS[status] || status)}</span>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${UI.muted}">
        <span>${escapeHtml(PUBLICATION_PRIVACY_LABELS[item.privacyStatus] || item.privacyStatus || '—')}</span>
        <span>${schedule ? `Agendado: ${escapeHtml(formatDateTime(schedule))}` : `Enviado: ${escapeHtml(formatDateTime(item.uploadedAt))}`}</span>
        ${item.hasThumbnail ? '<span>Thumbnail enviada</span>' : ''}
      </div>

      ${item.failureReason ? `<p class="text-[11px] ${UI.danger}">${escapeHtml(item.failureReason)}</p>` : ''}
      ${item.thumbnailWarning ? `<p class="text-[11px] ${UI.warning}">${escapeHtml(item.thumbnailWarning)}</p>` : ''}

      ${isEditing ? `
        <div class="rounded-lg border ${UI.border} p-3 flex flex-wrap items-end gap-2">
          <div class="flex-1 min-w-[220px]">
            <label class="text-[11px] font-medium ${UI.muted} block mb-1">Nova data e hora</label>
            <input type="datetime-local" data-pub-reschedule-input="${escapeHtml(item.id)}" value="${escapeHtml(toLocalInput(schedule))}" class="${UI.input} w-full" />
          </div>
          <button type="button" data-pub-action="save-reschedule" data-id="${escapeHtml(item.id)}" class="${UI.buttonBase} ${UI.buttonPrimary} text-xs">Salvar</button>
          <button type="button" data-pub-action="cancel-edit" data-id="${escapeHtml(item.id)}" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Voltar</button>
        </div>
      ` : ''}

      <div class="flex flex-wrap items-center gap-2">
        ${item.videoId ? `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}" target="_blank" rel="noopener noreferrer" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs">Abrir no YouTube ↗</a>` : ''}
        ${canReschedule ? `<button type="button" data-pub-action="reschedule" data-id="${escapeHtml(item.id)}" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Remarcar</button>` : ''}
        ${canCancel ? `<button type="button" data-pub-action="cancel" data-id="${escapeHtml(item.id)}" class="${UI.buttonBase} ${UI.buttonGhost} text-xs text-amber-700 dark:text-amber-300">Cancelar agendamento</button>` : ''}
        ${canDeleteRemote ? `<button type="button" data-pub-action="delete-remote" data-id="${escapeHtml(item.id)}" class="${UI.buttonBase} ${UI.buttonGhost} text-xs text-rose-600 dark:text-rose-400">Excluir do YouTube</button>` : ''}
        ${canRemoveLocal ? `<button type="button" data-pub-action="remove-local" data-id="${escapeHtml(item.id)}" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Remover do histórico</button>` : ''}
      </div>
    </div>
  `;
}

export function renderScheduledVideos({
  publications,
  quota,
  canPublish,
  authBusy,
  refreshing,
  editingId,
  listError,
  busy
}) {
  const list = Array.isArray(publications) ? publications : [];

  return `
    <div class="space-y-4">
      ${renderQuota(quota)}
      <div class="${UI.card} p-5 cursor-default">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Publicações no YouTube</h4>
            <p class="text-xs ${UI.muted} mt-1">Acompanhe envios, agendamentos e o status real retornado pela API.</p>
          </div>
          <div class="flex items-center gap-2">
            ${!canPublish ? `
              <button type="button" id="genfy-publish-auth-inline" class="${UI.buttonBase} ${UI.buttonPrimary} text-xs" ${authBusy ? 'disabled' : ''}>
                ${authBusy ? 'Autorizando...' : 'Conectar publicação'}
              </button>
            ` : `
              <button type="button" id="btn-refresh-publications" class="${UI.buttonBase} ${UI.buttonSecondary} text-xs" ${refreshing || busy ? 'disabled' : ''}>
                ${refreshing ? 'Atualizando...' : 'Atualizar status'}
              </button>
            `}
          </div>
        </div>

        <div id="pub-list-error" class="mb-3 ${listError ? '' : 'hidden'} rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 p-2.5 text-xs text-rose-700 dark:text-rose-300 whitespace-pre-line">${escapeHtml(listError || '')}</div>

        ${list.length === 0
          ? `<div class="text-center py-8"><p class="text-sm ${UI.muted}">Nenhum vídeo enviado pelo GENFY ainda.</p><p class="text-xs ${UI.muted} mt-1">Use o formulário acima para enviar ou agendar o primeiro vídeo.</p></div>`
          : `<div class="space-y-3">${list.map((item) => renderPublication(item, { canPublish, editingId, busy })).join('')}</div>`}
      </div>
    </div>
  `;
}
