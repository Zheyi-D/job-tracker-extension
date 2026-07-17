// 侧边栏编排：读配置 → 注入抓取 → 草稿恢复 → 重复检测 → 可编辑表单 → 保存
// 侧边栏常驻不关闭：切换标签页/页面加载完成后，若表单未被手动编辑则自动带入新页面信息
import {
  getConfig, isConfigComplete, findDuplicate,
  getDraft, saveDraft, clearDraft
} from '../lib/storage.js';
import { STATUS_OPTIONS } from '../lib/constants.js';

const $ = id => document.getElementById(id);
const FORM_IDS = ['f-company', 'f-position', 'f-time', 'f-url', 'f-status', 'f-note'];

let pageTitle = ''; // 抓取到的页面标题，作为飞书超链接字段的显示文本
let dirty = false;  // 用户手动编辑过表单：换页时不自动覆盖，避免丢改动

init().catch(err => showMsg(`初始化失败：${err.message}`, 'error'));

async function init() {
  fillSelect($('f-status'), STATUS_OPTIONS, '已投递');

  const config = await getConfig();
  if (!isConfigComplete(config)) {
    show('view-setup');
    $('btn-open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
    return;
  }
  show('view-form');
  bindForm();

  // 草稿恢复优先于重新抓取（同 URL 才恢复，防止串页面）
  const tab = await activeTab();
  const draft = await getDraft();
  if (draft && tab && draft.tabUrl === tab.url) {
    restoreDraft(draft);
    dirty = true;
    $('scrape-hint').textContent = '已恢复未保存的草稿';
  } else {
    await refreshFromTab();
  }

  // 侧边栏常驻：跟随标签页切换 / 页面加载完成
  chrome.tabs.onActivated.addListener(() => onTabChanged());
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, t) => {
    if (changeInfo.status === 'complete' && t.active) onTabChanged();
  });

  // 版本更新检测
  showUpdateIfAvailable();
  $('update-dismiss').addEventListener('click', () => dismissUpdate());
}

async function onTabChanged() {
  if (dirty) {
    // 有未保存的手动改动，不覆盖，仅提示
    $('scrape-hint').textContent = '页面已变化，可点「↻ 重新抓取」带入当前页信息';
    return;
  }
  await refreshFromTab();
}

// ---------- 抓取 ----------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// 重置表单并抓取当前活动标签页
async function refreshFromTab() {
  resetForm();
  const tab = await activeTab();
  const tabUrl = (tab && tab.url) || '';
  if (!/^https?:\/\//.test(tabUrl)) {
    $('scrape-hint').textContent = '当前页面无法抓取，请手动填写';
    return;
  }
  $('f-url').value = tabUrl;
  await scrapePage(tab.id);
  await checkDuplicate();
  dirty = false;
}

async function scrapePage(tabId) {
  let result = null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/scraper.js']
    });
    result = injection && injection.result;
  } catch {
    // 受限页（chrome:// 等）注入失败 → 降级为手动填写
  }
  if (!result) {
    $('scrape-hint').textContent = '未能抓取页面信息，请手动填写';
    return;
  }
  pageTitle = result.pageTitle || '';
  if (result.company) $('f-company').value = result.company;
  if (result.position) $('f-position').value = result.position;
  if (result.url) $('f-url').value = result.url;

  // 低置信度来源（hostname / h1 兜底）橙色高亮提醒核对
  const LOW = new Set(['hostname', 'fallback']);
  $('f-company').classList.toggle('low-confidence', LOW.has(result.confidence.company));
  $('f-position').classList.toggle('low-confidence', LOW.has(result.confidence.position));
  $('scrape-hint').textContent =
    LOW.has(result.confidence.company) || LOW.has(result.confidence.position)
      ? '橙色字段为推测值，请核对'
      : '已抓取当前页面信息';
}

async function checkDuplicate() {
  const banner = $('dup-banner');
  banner.classList.add('hidden');
  const url = $('f-url').value.trim();
  if (!url) return;
  const dup = await findDuplicate(url);
  if (dup) {
    const days = Math.floor((Date.now() - dup.appliedAt) / 86400000);
    const when = days <= 0 ? '今天' : `${days} 天前`;
    banner.textContent = `⚠ ${when}已投递过此链接（${dup.company} · ${dup.position}）`;
    banner.classList.remove('hidden');
  }
}

// ---------- 表单 ----------

function bindForm() {
  $('btn-save').addEventListener('click', onSave);
  $('btn-save-local').addEventListener('click', onSaveLocal);
  $('btn-rescrape').addEventListener('click', async () => {
    await clearDraft();
    dirty = false;
    await refreshFromTab();
  });
  $('link-options').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  // 用户输入 → 置脏 + 草稿写入 storage.session（关闭侧边栏重开可恢复）
  for (const id of FORM_IDS) {
    $(id).addEventListener('input', onUserEdit);
    $(id).addEventListener('change', onUserEdit);
  }
}

async function onUserEdit() {
  dirty = true;
  const tab = await activeTab();
  const values = {};
  for (const id of FORM_IDS) values[id] = $(id).value;
  await saveDraft({ tabUrl: (tab && tab.url) || '', pageTitle, values });
}

function restoreDraft(draft) {
  pageTitle = draft.pageTitle || '';
  for (const id of FORM_IDS) {
    if (draft.values && draft.values[id] !== undefined) $(id).value = draft.values[id];
  }
}

// 恢复表单为待抓取的初始状态
function resetForm() {
  $('f-company').value = '';
  $('f-position').value = '';
  $('f-url').value = '';
  $('f-note').value = '';
  $('f-time').value = toLocalInputValue(new Date());
  $('f-status').value = '已投递';
  $('f-company').classList.remove('low-confidence');
  $('f-position').classList.remove('low-confidence');
  $('dup-banner').classList.add('hidden');
  $('msg').className = 'msg hidden';
  $('btn-save').textContent = '保存到飞书';
  $('btn-save-local').classList.add('hidden');
  $('scrape-hint').textContent = '';
  pageTitle = '';
}

function collectRecord() {
  const company = $('f-company').value.trim();
  const position = $('f-position').value.trim();
  return {
    company,
    position,
    appliedAt: $('f-time').value ? new Date($('f-time').value).getTime() : Date.now(),
    url: $('f-url').value.trim(),
    linkText: pageTitle || [company, position].filter(Boolean).join(' · '),
    status: $('f-status').value,
    note: $('f-note').value.trim()
  };
}

// ---------- 保存 ----------

async function onSave() {
  const record = collectRecord();
  if (!record.company && !record.position) {
    showMsg('公司和岗位至少填一项', 'error');
    return;
  }
  setBusy(true, '同步中…');
  const resp = await chrome.runtime.sendMessage({ type: 'JT_SAVE_RECORD', record });
  setBusy(false);
  if (resp && resp.ok) {
    await clearDraft();
    dirty = false; // 已保存：换页时自动带入新页面信息
    showMsg('✓ 已同步到飞书', 'success');
    $('scrape-hint').textContent = '打开下一个岗位页面会自动带入新信息';
  } else {
    showMsg((resp && resp.error) || '保存失败，请重试', 'error');
    $('btn-save').textContent = '重试';
    $('btn-save-local').classList.remove('hidden');
  }
}

async function onSaveLocal() {
  const record = collectRecord();
  const resp = await chrome.runtime.sendMessage({ type: 'JT_SAVE_LOCAL', record });
  if (resp && resp.ok) {
    await clearDraft();
    dirty = false;
    showMsg('✓ 已保存到本地，可稍后在设置页重试同步', 'success');
  } else {
    showMsg('本地保存失败', 'error');
  }
}

// ---------- 工具 ----------

function show(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $(viewId).classList.remove('hidden');
}

function fillSelect(select, options, defaultValue) {
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    if (opt === defaultValue) el.selected = true;
    select.appendChild(el);
  }
}

function showMsg(textContent, kind) {
  const msg = $('msg');
  msg.textContent = textContent;
  msg.className = `msg ${kind}`;
}

function setBusy(busy, label) {
  $('btn-save').disabled = busy;
  if (busy) $('btn-save').textContent = label;
  else $('btn-save').textContent = '保存到飞书';
}

// Date → datetime-local 输入框格式（本地时区 YYYY-MM-DDTHH:mm）
function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- 更新提示 ----------

let dismissedVersion = '';

async function showUpdateIfAvailable() {
  const resp = await chrome.runtime.sendMessage({ type: 'JT_CHECK_UPDATE' });
  console.log('[update] sidepanel 检测结果:', resp);
  if (!resp || !resp.hasUpdate || !resp.info) return;
  // 检查是否已在本会话中关闭过此版本
  if (resp.info.version === dismissedVersion) return;
  const $banner = $('update-banner');
  $('update-version').textContent = 'v' + resp.info.version;
  // 截取 changelog 前 200 字
  const body = (resp.info.body || '').replace(/\r/g, '').trim();
  $('update-body').textContent = body.length > 200 ? body.slice(0, 200) + '…' : body;
  $('update-link').href = resp.info.url || '#';
  $banner.classList.remove('hidden');
}

async function dismissUpdate() {
  const resp = await chrome.runtime.sendMessage({ type: 'JT_CHECK_UPDATE' });
  if (resp && resp.info) {
    dismissedVersion = resp.info.version;
    await chrome.runtime.sendMessage({ type: 'JT_DISMISS_UPDATE', version: resp.info.version });
  }
  $('update-banner').classList.add('hidden');
}
