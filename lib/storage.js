// chrome.storage 薄封装：配置、投递历史、草稿、URL 规范化
import { STORAGE_KEYS, HISTORY_LIMIT, DEFAULT_FIELD_MAP } from './constants.js';

// ---------- 配置 ----------

export async function getConfig() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.config);
  const config = data[STORAGE_KEYS.config];
  if (!config) return null;
  return { ...config, fieldMap: { ...DEFAULT_FIELD_MAP, ...(config.fieldMap || {}) } };
}

export function isConfigComplete(config) {
  return !!(config && config.appId && config.appSecret && config.appToken && config.tableId);
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ [STORAGE_KEYS.config]: config });
}

// ---------- 投递历史 ----------

export async function getHistory() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history);
  return data[STORAGE_KEYS.history] || [];
}

export async function appendHistory(item) {
  const history = await getHistory();
  history.unshift(item);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
}

export async function updateHistoryItem(id, patch) {
  const history = await getHistory();
  const idx = history.findIndex(h => h.id === id);
  if (idx === -1) return false;
  history[idx] = { ...history[idx], ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  return true;
}

export async function clearHistory() {
  await chrome.storage.local.remove(STORAGE_KEYS.history);
}

// ---------- URL 规范化与重复检测 ----------

// 去 hash、去跟踪参数、hostname 小写、去尾部斜杠，用于同链接重复投递检测
export function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const toDelete = [];
    for (const key of u.searchParams.keys()) {
      if (/^utm_/i.test(key) || ['spm', 'from', 'ref'].includes(key.toLowerCase())) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(k => u.searchParams.delete(k));
    u.searchParams.sort();
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return rawUrl;
  }
}

// 返回历史中同链接的最近一条记录，无则 null
export async function findDuplicate(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const history = await getHistory();
  return history.find(h => h.normalizedUrl === normalized) || null;
}

// ---------- 侧边栏草稿（storage.session，浏览器关闭即清） ----------

export async function getDraft() {
  const data = await chrome.storage.session.get(STORAGE_KEYS.draft);
  return data[STORAGE_KEYS.draft] || null;
}

export async function saveDraft(draft) {
  await chrome.storage.session.set({ [STORAGE_KEYS.draft]: draft });
}

export async function clearDraft() {
  await chrome.storage.session.remove(STORAGE_KEYS.draft);
}
