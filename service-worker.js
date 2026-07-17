// 后台消息路由：sidepanel/options → service worker → 飞书 API
// 写入统一走这里而非页面直发：未来合并进 auto-fill-extension 后可复用同一消息通道
import { createRecord, listFields, clearTokenCache } from './lib/feishu-api.js';
import {
  getConfig, isConfigComplete, appendHistory, updateHistoryItem,
  getHistory, normalizeUrl
} from './lib/storage.js';
import {
  DEFAULT_FIELD_MAP, REQUIRED_FIELDS, EXPECTED_FIELD_TYPES, FIELD_TYPE_NAMES
} from './lib/constants.js';

// 点击工具栏图标即打开/关闭侧边栏（与 auto-fill-extension 同交互）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: (err && err.message) || String(err) }));
  return true; // 异步应答
});

async function handle(message) {
  switch (message.type) {
    case 'JT_SAVE_RECORD': return saveRecord(message.record);
    case 'JT_SAVE_LOCAL': return saveLocal(message.record);
    case 'JT_TEST_CONNECTION': return testConnection(message.config);
    case 'JT_RETRY_SYNC': return retrySync(message.historyId);
    default: return { ok: false, error: `未知消息类型：${message.type}` };
  }
}

// ---------- 保存 ----------

function toHistoryItem(record, extra) {
  return {
    id: crypto.randomUUID(),
    company: record.company || '',
    position: record.position || '',
    url: record.url || '',
    normalizedUrl: normalizeUrl(record.url || ''),
    linkText: record.linkText || '',
    appliedAt: record.appliedAt,
    statusValue: record.status || '已投递',
    note: record.note || '',
    ...extra
  };
}

async function saveRecord(record) {
  const config = await getConfig();
  if (!isConfigComplete(config)) {
    return { ok: false, error: '尚未完成飞书配置，请先在设置页填写凭证' };
  }
  const recordId = await createRecord(config, record);
  await appendHistory(toHistoryItem(record, { syncState: 'synced', recordId }));
  return { ok: true, recordId };
}

// 飞书写入失败时的本地退路，设置页可对 local-only 记录重试同步
async function saveLocal(record) {
  await appendHistory(toHistoryItem(record, { syncState: 'local-only', recordId: '' }));
  return { ok: true };
}

async function retrySync(historyId) {
  const config = await getConfig();
  if (!isConfigComplete(config)) return { ok: false, error: '尚未完成飞书配置' };
  const history = await getHistory();
  const item = history.find(h => h.id === historyId);
  if (!item) return { ok: false, error: '未找到该条历史记录' };
  const recordId = await createRecord(config, {
    company: item.company,
    position: item.position,
    appliedAt: item.appliedAt,
    url: item.url,
    linkText: item.linkText,
    status: item.statusValue,
    note: item.note
  });
  await updateHistoryItem(historyId, { syncState: 'synced', recordId });
  return { ok: true, recordId };
}

// ---------- 测试连接 ----------
// 一次调用同时验证：凭证有效、app_token/table_id 正确、应用有文档权限，
// 并校验必需字段是否存在、类型是否匹配——把配置错误在使用前暴露出来。
async function testConnection(rawConfig) {
  // options 页可传未保存的表单配置来测试；不传则用已保存配置
  let config;
  if (rawConfig) {
    config = { ...rawConfig, fieldMap: { ...DEFAULT_FIELD_MAP, ...(rawConfig.fieldMap || {}) } };
  } else {
    config = await getConfig();
  }
  if (!isConfigComplete(config)) {
    return { ok: false, error: '请先填写完整的四项凭证（App ID / App Secret / app_token / table_id）' };
  }

  // 凭证可能刚被修改过，旧 token 缓存不再适用
  await clearTokenCache();

  const fields = await listFields(config);
  const byName = new Map(fields.map(f => [f.field_name, f]));

  const missing = [];
  const typeWarnings = [];
  for (const key of REQUIRED_FIELDS) {
    const name = config.fieldMap[key];
    const field = byName.get(name);
    if (!field) {
      missing.push(name);
    } else if (field.type !== EXPECTED_FIELD_TYPES[key]) {
      typeWarnings.push(
        `「${name}」应为${FIELD_TYPE_NAMES[EXPECTED_FIELD_TYPES[key]]}类型，` +
        `当前是${FIELD_TYPE_NAMES[field.type] || `类型${field.type}`}`
      );
    }
  }

  return {
    ok: missing.length === 0,
    fields: fields.map(f => ({ name: f.field_name, type: FIELD_TYPE_NAMES[f.type] || `类型${f.type}` })),
    missing,
    typeWarnings,
    error: missing.length ? `连接成功，但表格缺少字段：${missing.join('、')}` : ''
  };
}
