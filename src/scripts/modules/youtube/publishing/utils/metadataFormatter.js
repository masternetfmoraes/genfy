export function buildVideoMetadata({
  title,
  description = '',
  tags = [],
  categoryId,
  defaultLanguage,
  privacyStatus = 'private',
  publishAt = null
}) {
  const snippet = {
    title,
    description,
    categoryId
  };
  if (tags.length > 0) snippet.tags = tags;
  if (defaultLanguage) snippet.defaultLanguage = defaultLanguage;

  const status = {
    privacyStatus: publishAt ? 'private' : privacyStatus,
    selfDeclaredMadeForKids: false,
    embeddable: true
  };
  if (publishAt) status.publishAt = publishAt;

  return { snippet, status };
}

export function buildScheduleStatus(publishAt) {
  return {
    status: {
      privacyStatus: 'private',
      publishAt,
      selfDeclaredMadeForKids: false
    }
  };
}

export function buildCancelStatus() {
  return {
    status: {
      privacyStatus: 'private',
      publishAt: null,
      selfDeclaredMadeForKids: false
    }
  };
}
