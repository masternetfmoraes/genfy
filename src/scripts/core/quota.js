import { storageGet, storageSet } from '../services/storage.js';
import {
  QUOTA_KEY,
  QUOTA_LIMIT,
  QUOTA_TIMEZONE,
  VIDEO_UPLOAD_COST
} from '../constants.js';

let quotaWrite = Promise.resolve();

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: QUOTA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function quotaDateKey(date = new Date()) {
  const parts = dateFormatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function normalizeQuota(data, now = new Date()) {
  const date = quotaDateKey(now);
  const valid = data && typeof data === 'object' ? data : {};
  if (valid.date !== date) {
    return { date, used: 0, entries: [] };
  }
  const used = Number(valid.used);
  return {
    date,
    used: Number.isFinite(used) && used > 0 ? used : 0,
    entries: Array.isArray(valid.entries) ? valid.entries : []
  };
}

export function quotaSnapshot(data, now = new Date()) {
  const quota = normalizeQuota(data, now);
  const remaining = Math.max(0, QUOTA_LIMIT - quota.used);
  return {
    ...quota,
    limit: QUOTA_LIMIT,
    remaining,
    estimatedUploads: Math.max(0, Math.floor(remaining / VIDEO_UPLOAD_COST))
  };
}

export async function loadQuota(now = new Date()) {
  const stored = await storageGet(QUOTA_KEY, null);
  return quotaSnapshot(stored, now);
}

export function recordQuotaUsage(cost, label = 'YouTube API', now = new Date()) {
  const operation = quotaWrite.then(async () => {
    const stored = await storageGet(QUOTA_KEY, null);
    const quota = normalizeQuota(stored, now);
    const amount = Math.max(0, Number(cost) || 0);
    const updated = {
      date: quota.date,
      used: quota.used + amount,
      entries: [
        ...quota.entries,
        { at: now.toISOString(), cost: amount, label }
      ].slice(-30)
    };
    await storageSet(QUOTA_KEY, updated);
    return quotaSnapshot(updated, now);
  });
  quotaWrite = operation.catch(() => {});
  return operation;
}
