import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS_LENGTH,
  MAX_THUMBNAIL_BYTES,
  MAX_TITLE_LENGTH,
  MAX_VIDEO_BYTES,
  MIN_SCHEDULE_LEAD_MS
} from '../../../../constants.js';

const VIDEO_EXTENSIONS = [
  'mp4', 'mov', 'm4v', 'avi', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'mpeg', 'mpg', 'ogv'
];
const THUMBNAIL_EXTENSIONS = ['jpg', 'jpeg', 'png'];

function extensionOf(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function parseTags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map((tag) => String(tag).trim()).filter(Boolean))];
}

export function validateVideoFile(file) {
  const errors = [];
  if (!file) {
    errors.push('Selecione um arquivo de vídeo.');
    return { valid: false, errors };
  }
  const ext = extensionOf(file.name);
  const typeOk = /^video\//i.test(file.type || '') || VIDEO_EXTENSIONS.includes(ext);
  if (!typeOk) errors.push('Formato de vídeo não suportado.');
  if (!Number.isFinite(file.size) || file.size <= 0) {
    errors.push('O arquivo de vídeo está vazio.');
  } else if (file.size > MAX_VIDEO_BYTES) {
    errors.push('O vídeo excede o limite de 256 GB do YouTube.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateThumbnailFile(file) {
  const errors = [];
  if (!file) return { valid: true, errors };
  const ext = extensionOf(file.name);
  const typeOk = /^image\/(jpeg|png)$/i.test(file.type || '') || THUMBNAIL_EXTENSIONS.includes(ext);
  if (!typeOk) errors.push('A thumbnail deve ser JPG ou PNG.');
  if (!Number.isFinite(file.size) || file.size <= 0) {
    errors.push('A thumbnail está vazia.');
  } else if (file.size > MAX_THUMBNAIL_BYTES) {
    errors.push('A thumbnail excede o limite de 2 MB.');
  }
  return { valid: errors.length === 0, errors };
}

export function toPublishAt(value, now = new Date()) {
  if (!value) return { publishAt: null, error: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { publishAt: null, error: 'Data de agendamento inválida.' };
  }
  if (date.getTime() < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
    return { publishAt: null, error: 'O agendamento deve ser pelo menos 1 minuto no futuro.' };
  }
  return { publishAt: date.toISOString(), error: null };
}

export function validatePublication(input, now = new Date()) {
  const errors = [];
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const tags = parseTags(input.tags);
  const privacyStatus = input.privacyStatus || 'private';
  const categoryId = String(input.categoryId || '').trim();

  if (!title) errors.push('Informe o título do vídeo.');
  else if (title.length > MAX_TITLE_LENGTH) {
    errors.push(`O título deve ter no máximo ${MAX_TITLE_LENGTH} caracteres.`);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`A descrição deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`);
  }
  if (tags.join(', ').length > MAX_TAGS_LENGTH) {
    errors.push(`As tags devem somar no máximo ${MAX_TAGS_LENGTH} caracteres.`);
  }
  if (!categoryId) errors.push('Selecione uma categoria.');
  if (!['public', 'unlisted', 'private'].includes(privacyStatus)) {
    errors.push('Privacidade inválida.');
  }

  const fileCheck = validateVideoFile(input.file);
  errors.push(...fileCheck.errors);

  const thumbnailCheck = validateThumbnailFile(input.thumbnail);
  errors.push(...thumbnailCheck.errors);

  const schedule = toPublishAt(input.scheduledAt, now);
  if (schedule.error) errors.push(schedule.error);
  if (schedule.publishAt && privacyStatus !== 'public') {
    errors.push('Vídeos agendados precisam ser publicados como públicos no horário escolhido.');
  }

  return {
    valid: errors.length === 0,
    errors,
    values: {
      title,
      description,
      tags,
      categoryId,
      privacyStatus,
      publishAt: schedule.publishAt
    }
  };
}
