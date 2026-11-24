import { UI } from '../../../../ui/designSystem.js';
import { escapeHtml } from '../../../../core/format.js';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_VIDEO_CATEGORY_ID,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS_LENGTH,
  MAX_TITLE_LENGTH,
  PUBLICATION_PRIVACY_LABELS
} from '../../../../constants.js';

function options(items, selected, valueKey, labelKey) {
  return items.map((item) => {
    const value = item[valueKey];
    return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(item[labelKey])}</option>`;
  }).join('');
}

export function renderUploadForm({
  categories,
  languages,
  canPublish,
  authBusy,
  busy,
  progress,
  success,
  error,
  thumbnailWarning,
  minSchedule
}) {
  const disabled = !canPublish || busy ? 'disabled' : '';
  const pct = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));

  return `
    <div class="${UI.card} p-5 cursor-default" id="genfy-publish-upload">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Publicar ou agendar no YouTube</h4>
          <p class="text-xs ${UI.muted} mt-1">O arquivo vai direto do navegador para o YouTube. Nenhum servidor GENFY recebe o vídeo.</p>
        </div>
        <span class="${UI.badgeBase} ${UI.badgeCalc}">Upload direto</span>
      </div>

      ${!canPublish ? `
        <div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
          <p class="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            Para enviar vídeos, autorize o GENFY a publicar e editar no seu canal. A permissão é solicitada separadamente e pode ser revogada no Google.
          </p>
          <button type="button" id="genfy-publish-auth" class="${UI.buttonBase} ${UI.buttonPrimary} mt-3" ${authBusy ? 'disabled' : ''}>
            ${authBusy ? 'Aguardando autorização...' : 'Conectar publicação no YouTube'}
          </button>
        </div>
      ` : ''}

      <div id="pub-form-error" class="mb-4 ${error ? '' : 'hidden'} rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300 whitespace-pre-line">${escapeHtml(error || '')}</div>
      <div id="pub-form-success" class="mb-4 ${success ? '' : 'hidden'} rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-300 whitespace-pre-line">${escapeHtml(success || '')}</div>
      <div id="pub-thumb-warning" class="mb-4 ${thumbnailWarning ? '' : 'hidden'} rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 whitespace-pre-line">${escapeHtml(thumbnailWarning || '')}</div>

      ${busy ? `
        <div class="mb-4 rounded-xl border ${UI.border} p-4" aria-live="polite">
          <div class="flex items-center justify-between gap-3 mb-2">
            <p class="text-xs font-medium ${UI.textBody}" id="pub-progress-label">Enviando vídeo... ${pct}%</p>
            <button type="button" id="btn-cancel-upload" class="${UI.buttonBase} ${UI.buttonGhost} text-xs">Cancelar envio</button>
          </div>
          <div class="${UI.progressTrack}">
            <div id="pub-progress-fill" class="${UI.progressFill}" style="width:${pct}%"></div>
          </div>
          <p class="text-[11px] ${UI.muted} mt-2">Mantenha esta aba aberta até o envio terminar. Depois disso, o YouTube publica no horário agendado mesmo com o Chrome fechado.</p>
        </div>
      ` : ''}

      <form id="pub-form" class="space-y-4">
        <fieldset ${disabled} class="space-y-4 ${disabled ? 'opacity-60' : ''}">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="pub-video-file" class="text-xs font-medium ${UI.muted} block mb-1.5">Arquivo de vídeo *</label>
              <input id="pub-video-file" name="file" type="file" accept="video/*,.mkv,.avi,.mov,.wmv,.flv,.webm" required class="${UI.input} w-full file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 dark:file:bg-indigo-900/30 dark:file:text-indigo-300" />
              <p id="pub-file-label" class="text-[11px] ${UI.muted} mt-1">Nenhum arquivo selecionado.</p>
            </div>
            <div>
              <label for="pub-thumbnail" class="text-xs font-medium ${UI.muted} block mb-1.5">Thumbnail (opcional)</label>
              <input id="pub-thumbnail" name="thumbnail" type="file" accept="image/jpeg,image/png" class="${UI.input} w-full file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 dark:file:bg-gray-700 dark:file:text-gray-200" />
              <p id="pub-thumbnail-label" class="text-[11px] ${UI.muted} mt-1">JPG ou PNG, até 2 MB. Requer canal verificado.</p>
            </div>
          </div>

          <div>
            <label for="pub-title" class="text-xs font-medium ${UI.muted} block mb-1.5">Título *</label>
            <input id="pub-title" name="title" type="text" required maxlength="${MAX_TITLE_LENGTH}" class="${UI.input} w-full" placeholder="Título do vídeo no YouTube" />
          </div>

          <div>
            <label for="pub-description" class="text-xs font-medium ${UI.muted} block mb-1.5">Descrição</label>
            <textarea id="pub-description" name="description" rows="4" maxlength="${MAX_DESCRIPTION_LENGTH}" class="${UI.input} w-full resize-y" placeholder="Descrição, links e timestamps..."></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="pub-tags" class="text-xs font-medium ${UI.muted} block mb-1.5">Tags (separadas por vírgula)</label>
              <input id="pub-tags" name="tags" type="text" maxlength="${MAX_TAGS_LENGTH}" class="${UI.input} w-full" placeholder="SEO, tutorial, react" />
            </div>
            <div>
              <label for="pub-category" class="text-xs font-medium ${UI.muted} block mb-1.5">Categoria *</label>
              <select id="pub-category" name="categoryId" class="${UI.input} w-full">
                ${options(categories, DEFAULT_VIDEO_CATEGORY_ID, 'id', 'title')}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label for="pub-language" class="text-xs font-medium ${UI.muted} block mb-1.5">Idioma padrão</label>
              <select id="pub-language" name="defaultLanguage" class="${UI.input} w-full">
                ${options(languages, DEFAULT_LANGUAGE, 'code', 'name')}
              </select>
            </div>
            <div>
              <label for="pub-privacy" class="text-xs font-medium ${UI.muted} block mb-1.5">Privacidade imediata</label>
              <select id="pub-privacy" name="privacyStatus" class="${UI.input} w-full">
                ${Object.entries(PUBLICATION_PRIVACY_LABELS).map(([value, label]) => `
                  <option value="${value}" ${value === 'public' ? 'selected' : ''}>${escapeHtml(label)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label for="pub-schedule" class="text-xs font-medium ${UI.muted} block mb-1.5">Agendar para</label>
              <input id="pub-schedule" name="scheduledAt" type="datetime-local" min="${escapeHtml(minSchedule)}" class="${UI.input} w-full" />
            </div>
          </div>

          <p class="text-[11px] ${UI.muted} leading-relaxed">
            Se você preencher o agendamento, o vídeo será enviado como privado e ficará público automaticamente no horário escolhido.
            A privacidade imediata só vale para envios sem agendamento.
          </p>

          <button type="submit" id="btn-publish-video" class="${UI.buttonBase} ${UI.buttonPrimary}">
            ${busy ? 'Enviando...' : 'Enviar para o YouTube'}
          </button>
        </fieldset>
      </form>
    </div>
  `;
}
