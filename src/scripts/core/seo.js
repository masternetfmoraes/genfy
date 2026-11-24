export function getSeoSignals(video = {}) {
  const title = String(video.title || '').trim();
  const description = String(video.description || '').trim();
  const tags = Array.isArray(video.tags)
    ? video.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];
  return {
    title,
    description,
    tags,
    categoryId: video.categoryId ? String(video.categoryId) : '',
    titleLength: title.length,
    descriptionLength: description.length,
    tagsCount: tags.length
  };
}

export function truncateSeoText(text, maxLength) {
  const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}
