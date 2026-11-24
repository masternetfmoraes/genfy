import {
  deleteVideo,
  getVideoStatuses,
  updateVideo
} from '../../../../services/youtube/youtubeApi.js';
import { PUBLICATION_STATUS } from '../../../../constants.js';
import {
  buildCancelStatus,
  buildScheduleStatus
} from '../utils/metadataFormatter.js';

function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function statusFromYouTube(item, previous = {}) {
  const status = (item && item.status) || {};
  const processing = (item && item.processingDetails) || {};
  const publishAt = status.publishAt || null;
  const isFuture = publishAt && new Date(publishAt).getTime() > Date.now();

  let localStatus = previous.status || PUBLICATION_STATUS.PRIVATE;
  if (status.uploadStatus === 'failed' || status.failureReason) {
    localStatus = PUBLICATION_STATUS.FAILED;
  } else if (isFuture) {
    localStatus = PUBLICATION_STATUS.SCHEDULED;
  } else if (status.privacyStatus === 'public' || status.privacyStatus === 'unlisted') {
    localStatus = PUBLICATION_STATUS.PUBLISHED;
  } else if (status.uploadStatus && status.uploadStatus !== 'processed') {
    localStatus = PUBLICATION_STATUS.UPLOADING;
  } else if (previous.status === PUBLICATION_STATUS.CANCELED) {
    localStatus = PUBLICATION_STATUS.CANCELED;
  } else {
    localStatus = PUBLICATION_STATUS.PRIVATE;
  }

  return {
    status: localStatus,
    privacyStatus: status.privacyStatus || previous.privacyStatus || 'private',
    publishAt,
    uploadStatus: status.uploadStatus || '',
    processingStatus: processing.processingStatus || '',
    failureReason: status.failureReason || '',
    updatedAt: new Date().toISOString()
  };
}

export async function refreshPublications(token, publications) {
  const list = Array.isArray(publications) ? publications : [];
  const ids = list.map((item) => item.videoId).filter(Boolean);
  if (ids.length === 0) return list;

  const remote = new Map();
  for (const batch of chunk(ids, 50)) {
    const response = await getVideoStatuses(token, batch);
    (response.items || []).forEach((item) => remote.set(item.id, item));
  }

  return list.map((item) => {
    const video = remote.get(item.videoId);
    if (!video) {
      return {
        ...item,
        status: PUBLICATION_STATUS.FAILED,
        failureReason: 'Vídeo não encontrado no YouTube.',
        updatedAt: new Date().toISOString()
      };
    }
    return { ...item, ...statusFromYouTube(video, item) };
  });
}

export async function cancelPublication(token, publication) {
  await updateVideo(token, publication.videoId, 'status', buildCancelStatus());
  return {
    ...publication,
    status: PUBLICATION_STATUS.CANCELED,
    publishAt: null,
    updatedAt: new Date().toISOString()
  };
}

export async function reschedulePublication(token, publication, publishAt) {
  await updateVideo(token, publication.videoId, 'status', buildScheduleStatus(publishAt));
  return {
    ...publication,
    status: PUBLICATION_STATUS.SCHEDULED,
    publishAt,
    scheduledAt: publishAt,
    failureReason: '',
    updatedAt: new Date().toISOString()
  };
}

export async function removeRemoteVideo(token, publication) {
  await deleteVideo(token, publication.videoId);
  return {
    ...publication,
    status: PUBLICATION_STATUS.CANCELED,
    remoteDeleted: true,
    updatedAt: new Date().toISOString()
  };
}
