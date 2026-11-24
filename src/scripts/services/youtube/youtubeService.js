// src/scripts/services/youtube/youtubeService.js
// Orquestra: canal do usuário + vídeos recentes + estatísticas.
// A amostra é configurável e paginada para não limitar as análises a 5 vídeos.

import * as api from './youtubeApi.js';

export const VIDEO_SAMPLE_SIZE = 50;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchUploadItems(accessToken, playlistId, limit) {
  const items = [];
  let pageToken = '';

  while (items.length < limit) {
    const remaining = limit - items.length;
    const page = await api.getPlaylistItems(
      accessToken,
      playlistId,
      Math.min(api.MAX_IDS_PER_REQUEST, remaining),
      pageToken
    );
    const batch = Array.isArray(page.items) ? page.items : [];
    items.push(...batch);

    pageToken = page.nextPageToken || '';
    if (!pageToken || batch.length === 0) break;
  }

  return items.slice(0, limit);
}

async function fetchVideosByIds(accessToken, ids) {
  const byId = {};

  for (let i = 0; i < ids.length; i += api.MAX_IDS_PER_REQUEST) {
    const chunk = ids.slice(i, i + api.MAX_IDS_PER_REQUEST);
    const res = await api.getVideosByIds(accessToken, chunk);
    (res.items || []).forEach((video) => {
      byId[video.id] = video || {};
    });
  }

  return byId;
}

function parseIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

function mapVideo(item, videoDetails) {
  const snippet = item.snippet || {};
  const detailsSnippet = (videoDetails && videoDetails.snippet) || {};
  const videoId = item.contentDetails && item.contentDetails.videoId;
  const thumbs = snippet.thumbnails || {};
  const thumbnail =
    (thumbs.medium && thumbs.medium.url) ||
    (thumbs.default && thumbs.default.url) ||
    '';
  const stats = (videoDetails && videoDetails.statistics) || {};
  const contentDetails = (videoDetails && videoDetails.contentDetails) || {};
  const durationSeconds = parseIsoDurationToSeconds(contentDetails.duration);

  return {
    id: videoId,
    title: snippet.title || detailsSnippet.title || '(sem título)',
    thumbnail,
    publishedAt: snippet.publishedAt || null,
    viewCount: stats.viewCount || null,
    likeCount: stats.likeCount || null,
    commentCount: stats.commentCount || null,
    durationSeconds,
    description: detailsSnippet.description || snippet.description || '',
    tags: Array.isArray(detailsSnippet.tags) ? detailsSnippet.tags : [],
    categoryId: detailsSnippet.categoryId || ''
  };
}

export async function loadChannelDashboard(accessToken, { videoLimit = VIDEO_SAMPLE_SIZE } = {}) {
  const channelRes = await api.getMyChannel(accessToken);
  assert(channelRes && Array.isArray(channelRes.items), 'Resposta inválida da YouTube API (canais).');

  const channel = channelRes.items[0];
  if (!channel) {
    throw new Error('Nenhum canal do YouTube encontrado nesta conta Google.');
  }

  const uploadsPlaylistId =
    channel.contentDetails &&
    channel.contentDetails.relatedPlaylists &&
    channel.contentDetails.relatedPlaylists.uploads;

  let recentVideos = [];

  if (uploadsPlaylistId) {
    const items = await fetchUploadItems(accessToken, uploadsPlaylistId, videoLimit);
    const videoIds = items
      .map((item) => item.contentDetails && item.contentDetails.videoId)
      .filter(Boolean);
    const detailsById = await fetchVideosByIds(accessToken, videoIds);

    recentVideos = items
      .map((item) => mapVideo(item, detailsById[item.contentDetails && item.contentDetails.videoId] || {}))
      .filter((video) => video.id);
  }

  const snippet = channel.snippet || {};
  const stats = channel.statistics || {};
  const thumbs = snippet.thumbnails || {};

  return {
    id: channel.id,
    title: snippet.title || '(sem nome)',
    description: snippet.description || '',
    handle: snippet.customUrl || null,
    url: channel.id ? `https://www.youtube.com/channel/${channel.id}` : null,
    avatar:
      (thumbs.medium && thumbs.medium.url) ||
      (thumbs.default && thumbs.default.url) ||
      '',
    publishedAt: snippet.publishedAt || null,
    subscriberCount: stats.subscriberCount || null,
    viewCount: stats.viewCount || null,
    videoCount: stats.videoCount || null,
    recentVideos
  };
}
