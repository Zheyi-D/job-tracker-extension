// 设置页：凭证配置（含表格链接自动解析）、字段映射、测试连接、历史管理、初始化
import { getConfig, saveConfig, getHistory, clearHistory } from '../lib/storage.js';
import { DEFAULT_FIELD_MAP, STORAGE_KEYS } from '../lib/constants.js';

const $ = id => document.getElementById(id);
const MAP_KEYS = ['company', 'position', 'appliedAt', 'link', 'status', 'note'];

init();

async function init() {
  await loadConfig();
  await renderHistory();

  $('btn-save').addEventListener('click', onSaveConfig);
  $('btn-test').addEventListener('click', onTestConnection);
  $('btn-export').addEventListener('click', onExport);
  $('btn-clear').addEventListener('click', onClear);
  $('btn-reset').addEventListener('click', onResetAll);
  // 粘贴多维表格完整链接时自动解析 app_token / table_id
  $('c-app-token').addEventListener('change', parseBaseUrl);
  $('c-app-token').addEventListener('blur', parseBaseUrl);
}

// ---------- 配置 ----------

async function loadConfig() {
  const config = await getConfig();
  if (!config) return;
  $('c-app-id').value = config.appId || '';
  $('c-app-secret').value = config.appSecret || '';
  $('c-app-token').value = config.appToken || '';
  $('c-table-id').value = config.tableId || '';
  for (const key of MAP_KEYS) {
    const v = (config.fieldMap && config.fieldMap[key]) || '';
    if (v && v !== DEFAULT_FIELD_MAP[key]) $(`m-${key}`).value = v;
  }
}

function collectConfig() {
  const fieldMap = {};
  for (const key of MAP_KEYS) {
    const v = $(`m-${key}`).value.trim();
    if (v) fieldMap[key] = v;
  }
  return {
    appId: $('c-app-id').value.trim(),
    appSecret: $('c-app-secret').value.trim(),
    appToken: $('c-app-token').value.trim(),
    tableId: $('c-table-id').value.trim(),
    fieldMap
  };
}

// 支持直接粘贴 https://xxx.feishu.cn/base/{app_token}?table={table_id}&view=... 链接
function parseBaseUrl() {
  const raw = $('c-app-token').value.trim();
  if (!/^https?:\/\//.test(raw)) return;
  if (raw.includes('/wiki/')) {
    showMsg('config-msg',
      '⚠ 这是知识库（/wiki/）链接，其中的 token 不能直接使用。\n' +
      '请把多维表格移动或复制到"我的空间"，再粘贴 /base/ 开头的链接。', 'warn');
    return;
  }
  const tokenMatch = raw.match(/\/base\/([A-Za-z0-9]+)/);
  if (!tokenMatch) {
    showMsg('config-msg', '未能从链接中解析出 app_token，请确认是 /base/ 开头的多维表格链接', 'error');
    return;
  }
  $('c-app-token').value = tokenMatch[1];
  try {
    const tableId = new URL(raw).searchParams.get('table');
    if (tableId && !$('c-table-id').value.trim()) $('c-table-id').value = tableId;
  } catch { /* 忽略 */ }
  showMsg('config-msg', '已从链接自动解析 app_token' + ($('c-table-id').value ? ' 和 table_id' : ''), 'success');
}

async function onSaveConfig() {
  const config = collectConfig();
  if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
    showMsg('config-msg', '请填写完整的四项凭证', 'error');
    return;
  }
  await saveConfig(config);
  showMsg('config-msg', '✓ 配置已保存', 'success');
}

async function onTestConnection() {
  const btn = $('btn-test');
  btn.disabled = true;
  btn.textContent = '测试中…';
  try {
    // 直接用当前表单值测试（无需先保存）
    const resp = await chrome.runtime.sendMessage({ type: 'JT_TEST_CONNECTION', config: collectConfig() });
    if (resp && resp.ok) {
      let text = `✓ 连接成功，字段校验通过。表格现有 ${resp.fields.length} 个字段：\n` +
        resp.fields.map(f => `· ${f.name}（${f.type}）`).join('\n');
      if (resp.typeWarnings && resp.typeWarnings.length) {
        text += `\n\n⚠ 类型建议：\n${resp.typeWarnings.join('\n')}`;
      }
      showMsg('config-msg', text, resp.typeWarnings && resp.typeWarnings.length ? 'warn' : 'success');
    } else {
      showMsg('config-msg', (resp && resp.error) || '测试失败', 'error');
    }
  } catch (err) {
    showMsg('config-msg', `测试失败：${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '测试连接';
  }
}

// ---------- 历史 ----------

async function renderHistory() {
  const history = await getHistory();
  $('history-count').textContent = history.length ? `（${history.length} 条）` : '';
  const list = $('history-list');
  list.textContent = '';

  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '暂无投递记录';
    list.appendChild(empty);
    return;
  }

  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'history-item';

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatDate(item.appliedAt);

    const who = document.createElement('span');
    who.className = 'who';
    if (item.url) {
      const a = document.createElement('a');
      a.href = item.url;
      a.target = '_blank';
      a.textContent = `${item.company} · ${item.position}`;
      who.appendChild(a);
    } else {
      who.textContent = `${item.company} · ${item.position}`;
    }

    const badge = document.createElement('span');
    badge.className = `badge ${item.syncState}`;
    badge.textContent = item.syncState === 'synced' ? '已同步' : '仅本地';

    row.append(time, who, badge);

    if (item.syncState === 'local-only') {
      const retry = document.createElement('button');
      retry.className = 'btn secondary mini';
      retry.textContent = '重试同步';
      retry.addEventListener('click', () => onRetry(item.id, retry));
      row.appendChild(retry);
    }
    list.appendChild(row);
  }
}

async function onRetry(historyId, btn) {
  btn.disabled = true;
  btn.textContent = '同步中…';
  const resp = await chrome.runtime.sendMessage({ type: 'JT_RETRY_SYNC', historyId });
  if (resp && resp.ok) {
    showMsg('history-msg', '✓ 已同步到飞书', 'success');
    await renderHistory();
  } else {
    btn.disabled = false;
    btn.textContent = '重试同步';
    showMsg('history-msg', (resp && resp.error) || '同步失败', 'error');
  }
}

async function onExport() {
  const history = await getHistory();
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `投递记录-${formatDate(Date.now()).replaceAll('/', '')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onClear() {
  if (!confirm('确定清空全部本地投递历史？（不影响飞书表格中的数据）')) return;
  await clearHistory();
  await renderHistory();
  showMsg('history-msg', '已清空本地历史', 'success');
}

// ---------- 初始化：恢复默认状态 ----------
// 只清 jt_ 前缀的 key，不用 storage.clear()——为将来与 auto-fill-extension 合并预留安全边界
async function onResetAll() {
  const confirmed = confirm(
    '确定初始化？将清空：\n' +
    '· 本地投递历史\n' +
    '· 未保存的表单草稿\n' +
    '· 飞书凭证与字段映射配置\n\n' +
    '不影响飞书表格中已同步的数据。'
  );
  if (!confirmed) return;
  await chrome.storage.local.remove([STORAGE_KEYS.config, STORAGE_KEYS.history]);
  await chrome.storage.session.remove([STORAGE_KEYS.draft, STORAGE_KEYS.token]);
  // 清空页面上的表单显示
  for (const id of ['c-app-id', 'c-app-secret', 'c-app-token', 'c-table-id']) $(id).value = '';
  for (const key of MAP_KEYS) $(`m-${key}`).value = '';
  $('config-msg').className = 'msg hidden';
  await renderHistory();
  showMsg('reset-msg', '✓ 已恢复默认状态，重新配置请展开顶部"首次配置指南"', 'success');
}

// ---------- 工具 ----------

function showMsg(id, text, kind) {
  const msg = $(id);
  msg.textContent = text;
  msg.className = `msg ${kind}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
