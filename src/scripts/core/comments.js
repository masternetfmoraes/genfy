export const COMMENT_SORTS = ['newest', 'most'];
export const COMMENTS_PAGE_SIZE = 5;
export const COMMENTS_MODAL_PAGE_SIZE = 10;
export const COMMENTS_MAX_PAGES_PER_VIDEO = 20;

export function normalizeCommentsSort(value) {
  if (value === 'time' || value === 'newest') return 'newest';
  if (value === 'relevance' || value === 'most') return 'most';
  return 'newest';
}

function dateDesc(a, b) {
  return (Date.parse(b) || 0) - (Date.parse(a) || 0);
}

export function normalizeCommentSnippet(snippet, video, meta = {}) {
  const s = snippet || {};
  if (!s.authorDisplayName && !s.textDisplay && !s.textOriginal) return null;
  return {
    id: meta.id || '',
    videoId: (video && video.id) || '',
    videoTitle: (video && video.title) || '',
    videoPublishedAt: (video && video.publishedAt) || null,
    videoThumbnail: (video && video.thumbnail) || '',
    videoIsShort: !!meta.videoIsShort,
    author: s.authorDisplayName || '',
    authorAvatar: s.authorProfileImageUrl || '',
    text: s.textDisplay || s.textOriginal || '',
    likeCount: Number(s.likeCount) || 0,
    publishedAt: s.publishedAt || null,
    replyCount: Number(meta.replyCount) || 0,
    isReply: !!meta.isReply,
    parentId: meta.parentId || ''
  };
}

export function groupCommentsByVideo(comments) {
  const byId = new Map();
  (Array.isArray(comments) ? comments : []).forEach((comment) => {
    if (!comment || !comment.videoId) return;
    let group = byId.get(comment.videoId);
    if (!group) {
      group = {
        videoId: comment.videoId,
        videoTitle: comment.videoTitle || '',
        videoPublishedAt: comment.videoPublishedAt || null,
        videoThumbnail: comment.videoThumbnail || '',
        videoIsShort: !!comment.videoIsShort,
        comments: []
      };
      byId.set(comment.videoId, group);
    }
    group.comments.push(comment);
  });
  return Array.from(byId.values()).map((group) => ({
    ...group,
    comments: group.comments.slice().sort((a, b) => dateDesc(a.publishedAt, b.publishedAt))
  }));
}

export function sortCommentGroups(groups, sort = 'newest') {
  const mode = normalizeCommentsSort(sort);
  return (Array.isArray(groups) ? groups : []).slice().sort((a, b) => {
    if (mode === 'most') {
      const diff = b.comments.length - a.comments.length;
      if (diff) return diff;
    }
    return dateDesc(a.videoPublishedAt, b.videoPublishedAt);
  });
}

export function paginateItems(items, page, pageSize) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(pageSize) || 1);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  return {
    items: list.slice((current - 1) * size, current * size),
    page: current,
    totalPages,
    total
  };
}
