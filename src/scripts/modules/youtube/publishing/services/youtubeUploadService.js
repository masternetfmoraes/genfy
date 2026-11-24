import { UPLOAD_BASE, YouTubeApiError } from '../../../../services/youtube/youtubeApi.js';
import { UPLOAD_CHUNK_SIZE, UPLOAD_TIMEOUT_MS } from '../../../../constants.js';

const MAX_CHUNK_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readApiError(res) {
  const body = await res.json().catch(() => null);
  const error = body && body.error;
  return {
    reason:
      (error && error.errors && error.errors[0] && error.errors[0].reason) ||
      (error && error.status) ||
      '',
    message: (error && error.message) || `HTTP ${res.status}`
  };
}

function isRetryable(err) {
  if (!err || err.name === 'AbortError') return false;
  const status = err.status;
  return status === undefined || status === 0 || status === 429 || status >= 500;
}

function nextOffset(range, fallback) {
  const match = /bytes=(\d+)-(\d+)/i.exec(String(range || ''));
  if (!match) return fallback;
  const offset = Number(match[2]) + 1;
  return Number.isFinite(offset) ? offset : fallback;
}

async function fetchWithTimeout(url, options, {
  timeoutMs = UPLOAD_TIMEOUT_MS,
  signal = null
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (timedOut && err && err.name === 'AbortError') {
      throw new YouTubeApiError('O envio demorou demais e foi interrompido. Tente novamente.', {
        status: 0,
        reason: 'timeout'
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function createResumableSession({ token, file, metadata, signal = null }) {
  if (!token) {
    throw new YouTubeApiError('Token de acesso ausente.', { status: 401, reason: 'noToken' });
  }
  const url = `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(file.size),
      'X-Upload-Content-Type': file.type || 'video/*'
    },
    body: JSON.stringify(metadata)
  }, { signal });

  if (!res.ok) {
    const detail = await readApiError(res);
    throw new YouTubeApiError(`Não foi possível iniciar o envio (HTTP ${res.status}).`, {
      status: res.status,
      reason: detail.reason
    });
  }

  const uploadUrl = res.headers.get('Location') || res.headers.get('location');
  if (!uploadUrl) {
    throw new YouTubeApiError('A YouTube API não retornou a URL de upload.', {
      status: 0,
      reason: 'missingUploadUrl'
    });
  }
  return uploadUrl;
}

export async function sendUploadChunk({
  uploadUrl,
  token,
  file,
  start,
  end,
  signal = null
}) {
  const chunk = file.slice(start, end + 1);
  const res = await fetchWithTimeout(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'video/*',
      'Content-Range': `bytes ${start}-${end}/${file.size}`
    },
    body: chunk
  }, { signal, timeoutMs: Math.max(UPLOAD_TIMEOUT_MS, 60000) });

  if (res.status === 308) {
    return { done: false, range: res.headers.get('Range') || res.headers.get('range') || '' };
  }

  if (res.ok) {
    const video = await res.json().catch(() => null);
    if (!video || !video.id) {
      throw new YouTubeApiError('O YouTube não retornou o vídeo enviado.', {
        status: 0,
        reason: 'missingVideo'
      });
    }
    return { done: true, video };
  }

  const detail = await readApiError(res);
  throw new YouTubeApiError(`Falha no envio do vídeo (HTTP ${res.status}).`, {
    status: res.status,
    reason: detail.reason
  });
}

export async function setVideoThumbnail({ token, videoId, thumbnail, signal = null }) {
  if (!thumbnail) return null;
  const url = `${UPLOAD_BASE}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': thumbnail.type || 'image/jpeg'
    },
    body: thumbnail
  }, { signal });

  if (!res.ok) {
    const detail = await readApiError(res);
    throw new YouTubeApiError(`Falha ao enviar a thumbnail (HTTP ${res.status}).`, {
      status: res.status,
      reason: detail.reason
    });
  }
  return res.json().catch(() => null);
}

export async function uploadVideo({
  token,
  file,
  metadata,
  thumbnail = null,
  onProgress = () => {},
  signal = null,
  chunkSize = UPLOAD_CHUNK_SIZE
}) {
  if (!file || !file.size) {
    throw new YouTubeApiError('Arquivo de vídeo inválido.', { status: 400, reason: 'invalidFile' });
  }

  const uploadUrl = await createResumableSession({ token, file, metadata, signal });
  let start = 0;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size) - 1;
    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_CHUNK_ATTEMPTS; attempt++) {
      try {
        result = await sendUploadChunk({ uploadUrl, token, file, start, end, signal });
        break;
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_CHUNK_ATTEMPTS - 1) throw err;
        await sleep(500 * 2 ** attempt);
      }
    }

    if (!result) throw lastError || new Error('Falha desconhecida no envio do vídeo.');

    if (result.done) {
      onProgress(1);
      let thumbnailWarning = null;
      if (thumbnail) {
        try {
          await setVideoThumbnail({ token, videoId: result.video.id, thumbnail, signal });
        } catch (err) {
          thumbnailWarning = err.message || 'Não foi possível enviar a thumbnail.';
        }
      }
      return { video: result.video, thumbnailWarning };
    }

    const offset = nextOffset(result.range, end + 1);
    start = offset > start ? offset : end + 1;
    onProgress(start / file.size);
  }

  throw new YouTubeApiError('O envio terminou sem resposta final do YouTube.', {
    status: 0,
    reason: 'incompleteUpload'
  });
}
