import {
  authorizePublish,
  getCachedToken,
  hasPublishScope,
  markPublishNotGranted,
  refreshToken
} from '../../../../services/youtube/youtubeAuth.js';
import {
  FALLBACK_CATEGORIES,
  FALLBACK_LANGUAGES,
  PUBLICATION_STATUS,
  QUOTA_COSTS
} from '../../../../constants.js';
import { loadQuota, recordQuotaUsage } from '../../../../core/quota.js';
import { state, savePublications } from '../../../../pages/dashboard/state.js';
import { renderUploadForm } from '../pages/videoUploadPage.js';
import { renderScheduledVideos } from '../pages/scheduledVideosPage.js';
import { loadPublishingMetadata } from '../services/youtubeMetadataService.js';
import { uploadVideo } from '../services/youtubeUploadService.js';
import {
  cancelPublication,
  refreshPublications,
  removeRemoteVideo,
  reschedulePublication
} from '../services/youtubeScheduleService.js';
import { validatePublication, toPublishAt } from '../utils/videoValidation.js';
import { buildVideoMetadata } from '../utils/metadataFormatter.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

function minScheduleValue() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function publicationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusFromUpload(video, scheduledAt) {
  const status = (video && video.status) || {};
  if (status.uploadStatus === 'failed' || status.failureReason) return PUBLICATION_STATUS.FAILED;
  if (scheduledAt) return PUBLICATION_STATUS.SCHEDULED;
  if (status.privacyStatus === 'public' || status.privacyStatus === 'unlisted') {
    return PUBLICATION_STATUS.PUBLISHED;
  }
  if (status.uploadStatus && status.uploadStatus !== 'processed') return PUBLICATION_STATUS.UPLOADING;
  return PUBLICATION_STATUS.PRIVATE;
}

function permissionError(err) {
  return err && err.status === 403 && /permission|forbidden|insufficient/i.test(err.reason || '');
}

export function mountPublishing(root, options = {}) {
  let rootEl = root;
  let destroyed = false;
  let abortController = null;
  let metadata = {
    categories: FALLBACK_CATEGORIES,
    languages: FALLBACK_LANGUAGES
  };
  let quota = null;
  const tokenProvider = typeof options.getToken === 'function' ? options.getToken : getCachedToken;
  const ui = {
    busy: false,
    authBusy: false,
    refreshing: false,
    progress: 0,
    error: '',
    success: '',
    thumbnailWarning: '',
    editingId: null,
    listError: ''
  };

  function warnBeforeUnload(event) {
    event.preventDefault();
    event.returnValue = '';
  }

  function setUploadGuard(active) {
    if (typeof window === 'undefined') return;
    if (active) window.addEventListener('beforeunload', warnBeforeUnload);
    else window.removeEventListener('beforeunload', warnBeforeUnload);
  }

  function destroy() {
    destroyed = true;
    setUploadGuard(false);
    if (abortController) abortController.abort();
    abortController = null;
    rootEl = null;
  }

  function setFormError(message) {
    if (!rootEl) return;
    ui.error = message;
    const el = rootEl.querySelector('#pub-form-error');
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function setListError(message) {
    ui.listError = message;
    if (!rootEl) return;
    const el = rootEl.querySelector('#pub-list-error');
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }

  function updateProgress(value) {
    ui.progress = Math.max(0, Math.min(1, value));
    if (!rootEl) return;
    const pct = Math.round(ui.progress * 100);
    const fill = rootEl.querySelector('#pub-progress-fill');
    const label = rootEl.querySelector('#pub-progress-label');
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `Enviando vídeo... ${pct}%`;
  }

  function visiblePublications() {
    const channelId = state.channel && state.channel.id;
    return state.publications.filter((item) => {
      if (!item.channelId || !channelId) return true;
      return item.channelId === channelId;
    });
  }

  function hasPendingPublications() {
    return visiblePublications().some((item) =>
      item.status === PUBLICATION_STATUS.SCHEDULED ||
      item.status === PUBLICATION_STATUS.UPLOADING
    );
  }

  async function refreshVisiblePublications(token) {
    const visible = visiblePublications().filter((item) => !item.remoteDeleted);
    if (visible.length === 0) return;
    const updated = await refreshPublications(token, visible);
    const byId = new Map(updated.map((item) => [item.id, item]));
    state.publications = state.publications.map((item) => byId.get(item.id) || item);
  }

  function markPermissionError(err) {
    if (!permissionError(err)) return false;
    markPublishNotGranted();
    ui.error = 'A permissão para publicar no YouTube não está disponível. Autorize novamente.';
    return true;
  }

  async function withAuthRetry(fn) {
    let token = tokenProvider();
    if (!token) throw new Error('Sessão do YouTube não encontrada. Entre novamente na conta.');
    try {
      return await fn(token);
    } catch (err) {
      if (err && err.status === 401) {
        const fresh = await refreshToken();
        if (fresh) return fn(fresh);
      }
      markPermissionError(err);
      throw err;
    }
  }

  async function loadMetadataAndRefresh(refreshList) {
    const token = tokenProvider();
    if (!token || !hasPublishScope()) return;

    metadata = await loadPublishingMetadata(token);

    if (refreshList && visiblePublications().length > 0) {
      try {
        await withAuthRetry(refreshVisiblePublications);
        await savePublications();
      } catch (err) {
        ui.listError = err.message || 'Não foi possível atualizar os status do YouTube.';
      }
    }

    quota = await loadQuota().catch(() => quota);
  }

  function render() {
    if (destroyed || !rootEl) return;
    const canPublish = hasPublishScope();
    rootEl.innerHTML = `
      <div class="space-y-4">
        ${renderUploadForm({
          categories: metadata.categories,
          languages: metadata.languages,
          canPublish,
          authBusy: ui.authBusy,
          busy: ui.busy,
          progress: ui.progress,
          success: ui.success,
          error: ui.error,
          thumbnailWarning: ui.thumbnailWarning,
          minSchedule: minScheduleValue()
        })}
        ${renderScheduledVideos({
          publications: visiblePublications(),
          quota,
          canPublish,
          authBusy: ui.authBusy,
          refreshing: ui.refreshing,
          editingId: ui.editingId,
          listError: ui.listError,
          busy: ui.busy
        })}
      </div>
    `;
    wire();
  }

  async function handleAuthorize() {
    if (ui.authBusy) return;
    ui.authBusy = true;
    ui.error = '';
    ui.success = '';
    render();
    try {
      await authorizePublish();
      await loadMetadataAndRefresh(hasPendingPublications());
      ui.success = 'Publicação autorizada. Você já pode enviar e agendar vídeos.';
    } catch (err) {
      ui.error = err.message || 'Não foi possível autorizar a publicação.';
    } finally {
      ui.authBusy = false;
      if (!destroyed) render();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (ui.busy || !rootEl) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file');
    const thumbnail = formData.get('thumbnail') || null;
    const input = {
      title: formData.get('title'),
      description: formData.get('description'),
      tags: formData.get('tags'),
      categoryId: formData.get('categoryId'),
      privacyStatus: formData.get('privacyStatus'),
      scheduledAt: formData.get('scheduledAt'),
      file,
      thumbnail
    };

    const validation = validatePublication(input);
    if (!validation.valid) {
      setFormError(validation.errors.join('\n'));
      return;
    }

    if (!hasPublishScope()) {
      setFormError('Autorize a publicação no YouTube antes de enviar.');
      return;
    }

    const token = tokenProvider();
    if (!token) {
      setFormError('Sua sessão do YouTube expirou. Entre novamente na conta.');
      return;
    }

    const metadataBody = buildVideoMetadata({
      ...validation.values,
      defaultLanguage: String(formData.get('defaultLanguage') || '')
    });
    const controller = new AbortController();
    abortController = controller;
    ui.busy = true;
    ui.progress = 0;
    ui.error = '';
    ui.success = '';
    ui.thumbnailWarning = '';
    ui.listError = '';
    setUploadGuard(true);
    render();

    const runUpload = (authToken) => uploadVideo({
      token: authToken,
      file,
      metadata: metadataBody,
      thumbnail: thumbnail || null,
      onProgress: updateProgress,
      signal: controller.signal
    });

    try {
      let result;
      try {
        result = await runUpload(token);
      } catch (err) {
        if (err && err.status === 401) {
          const fresh = await refreshToken();
          if (!fresh) throw err;
          updateProgress(0);
          result = await runUpload(fresh);
        } else {
          throw err;
        }
      }

      const video = result.video;
      const remoteStatus = video.status || {};
      const publishAt = remoteStatus.publishAt || validation.values.publishAt || null;
      const publication = {
        id: publicationId(),
        videoId: video.id,
        channelId: state.channel && state.channel.id ? state.channel.id : '',
        title: (video.snippet && video.snippet.title) || validation.values.title,
        description: validation.values.description,
        privacyStatus: remoteStatus.privacyStatus || validation.values.privacyStatus,
        status: statusFromUpload(video, publishAt),
        scheduledAt: validation.values.publishAt || null,
        publishAt,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hasThumbnail: !!thumbnail && !result.thumbnailWarning,
        thumbnailWarning: result.thumbnailWarning || '',
        failureReason: '',
        remoteDeleted: false
      };

      quota = await recordQuotaUsage(QUOTA_COSTS.videosInsert, 'videos.insert');
      if (thumbnail && !result.thumbnailWarning) {
        quota = await recordQuotaUsage(QUOTA_COSTS.thumbnailsSet, 'thumbnails.set');
      }

      state.publications.unshift(publication);
      await savePublications();

      const when = publishAt ? formatLocal(publishAt) : '';
      ui.success = when
        ? `Vídeo enviado e agendado para ${when}. O YouTube publicará automaticamente no horário escolhido.`
        : 'Vídeo enviado ao YouTube com sucesso.';
      ui.thumbnailWarning = result.thumbnailWarning || '';
      ui.listError = '';
      if (typeof options.onChanged === 'function') options.onChanged();
    } catch (err) {
      const permission = markPermissionError(err);
      if (err && err.name === 'AbortError') {
        ui.error = 'Envio cancelado. O arquivo não foi publicado.';
      } else if (!permission) {
        ui.error = err.message || 'Não foi possível enviar o vídeo.';
      }
    } finally {
      abortController = null;
      setUploadGuard(false);
      ui.busy = false;
      ui.progress = 0;
      if (!destroyed) render();
    }
  }

  async function handleRefresh() {
    if (ui.refreshing || ui.busy) return;
    ui.refreshing = true;
    ui.listError = '';
    render();
    try {
      await withAuthRetry(refreshVisiblePublications);
      await savePublications();
      quota = await loadQuota().catch(() => quota);
      if (typeof options.onChanged === 'function') options.onChanged();
    } catch (err) {
      ui.listError = err.message || 'Não foi possível atualizar os status do YouTube.';
    } finally {
      ui.refreshing = false;
      if (!destroyed) render();
    }
  }

  function handleStartReschedule(id) {
    ui.editingId = id;
    ui.listError = '';
    render();
  }

  async function handleSaveReschedule(id) {
    const input = rootEl && rootEl.querySelector(`[data-pub-reschedule-input="${id}"]`);
    if (!input) return;
    const schedule = toPublishAt(input.value);
    if (schedule.error) {
      setListError(schedule.error);
      return;
    }
    const publication = state.publications.find((item) => item.id === id);
    if (!publication) return;

    try {
      const updated = await withAuthRetry((token) =>
        reschedulePublication(token, publication, schedule.publishAt)
      );
      state.publications = state.publications.map((item) => item.id === id ? updated : item);
      await savePublications();
      quota = await recordQuotaUsage(QUOTA_COSTS.videosUpdate, 'videos.update');
      ui.editingId = null;
      ui.listError = '';
      if (typeof options.onChanged === 'function') options.onChanged();
    } catch (err) {
      ui.listError = err.message || 'Não foi possível remarcar o vídeo.';
    } finally {
      if (!destroyed) render();
    }
  }

  async function handleCancelSchedule(id) {
    const publication = state.publications.find((item) => item.id === id);
    if (!publication) return;
    if (typeof confirm === 'function' && !confirm('Cancelar o agendamento? O vídeo continuará privado no YouTube.')) {
      return;
    }

    try {
      const updated = await withAuthRetry((token) => cancelPublication(token, publication));
      state.publications = state.publications.map((item) => item.id === id ? updated : item);
      await savePublications();
      quota = await recordQuotaUsage(QUOTA_COSTS.videosUpdate, 'videos.update');
      ui.editingId = null;
      ui.listError = '';
      if (typeof options.onChanged === 'function') options.onChanged();
    } catch (err) {
      ui.listError = err.message || 'Não foi possível cancelar o agendamento.';
    } finally {
      if (!destroyed) render();
    }
  }

  async function handleDeleteRemote(id) {
    const publication = state.publications.find((item) => item.id === id);
    if (!publication) return;
    if (typeof confirm === 'function' && !confirm('Excluir este vídeo definitivamente do YouTube? Essa ação não pode ser desfeita.')) {
      return;
    }

    try {
      const updated = await withAuthRetry((token) => removeRemoteVideo(token, publication));
      state.publications = state.publications.map((item) => item.id === id ? updated : item);
      await savePublications();
      quota = await recordQuotaUsage(QUOTA_COSTS.videosDelete, 'videos.delete');
      ui.listError = '';
      if (typeof options.onChanged === 'function') options.onChanged();
    } catch (err) {
      ui.listError = err.message || 'Não foi possível excluir o vídeo do YouTube.';
    } finally {
      if (!destroyed) render();
    }
  }

  async function handleRemoveLocal(id) {
    state.publications = state.publications.filter((item) => item.id !== id);
    await savePublications();
    ui.listError = '';
    render();
  }

  function wire() {
    if (!rootEl) return;

    rootEl.querySelectorAll('#genfy-publish-auth, #genfy-publish-auth-inline').forEach((button) => {
      button.addEventListener('click', handleAuthorize);
    });

    const form = rootEl.querySelector('#pub-form');
    if (form) form.addEventListener('submit', handleSubmit);

    const fileInput = rootEl.querySelector('#pub-video-file');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const label = rootEl.querySelector('#pub-file-label');
        const file = fileInput.files && fileInput.files[0];
        if (label) label.textContent = file ? file.name : 'Nenhum arquivo selecionado.';
      });
    }

    const thumbnailInput = rootEl.querySelector('#pub-thumbnail');
    if (thumbnailInput) {
      thumbnailInput.addEventListener('change', () => {
        const label = rootEl.querySelector('#pub-thumbnail-label');
        const file = thumbnailInput.files && thumbnailInput.files[0];
        if (label) label.textContent = file ? file.name : 'JPG ou PNG, até 2 MB. Requer canal verificado.';
      });
    }

    const cancelUpload = rootEl.querySelector('#btn-cancel-upload');
    if (cancelUpload) {
      cancelUpload.addEventListener('click', () => {
        cancelUpload.disabled = true;
        cancelUpload.textContent = 'Cancelando...';
        if (abortController) abortController.abort();
      });
    }

    const refresh = rootEl.querySelector('#btn-refresh-publications');
    if (refresh) refresh.addEventListener('click', handleRefresh);

    rootEl.querySelectorAll('[data-pub-action]').forEach((button) => {
      const id = button.dataset.id;
      button.addEventListener('click', () => {
        if (button.dataset.pubAction === 'reschedule') handleStartReschedule(id);
        else if (button.dataset.pubAction === 'save-reschedule') handleSaveReschedule(id);
        else if (button.dataset.pubAction === 'cancel-edit') {
          ui.editingId = null;
          ui.listError = '';
          render();
        } else if (button.dataset.pubAction === 'cancel') handleCancelSchedule(id);
        else if (button.dataset.pubAction === 'delete-remote') handleDeleteRemote(id);
        else if (button.dataset.pubAction === 'remove-local') handleRemoveLocal(id);
      });
    });
  }

  async function hydrate() {
    quota = await loadQuota().catch(() => null);
    if (destroyed) return;
    render();

    if (!tokenProvider() || !hasPublishScope()) return;
    await loadMetadataAndRefresh(hasPendingPublications());
    if (!destroyed) render();
  }

  render();
  hydrate().catch((err) => {
    console.warn('[GENFY] Publicação indisponível:', err && err.message);
  });

  return { destroy, refresh: hydrate };
}
