// 全局常量：API 地址、storage key、字段映射默认值、选项列表
// storage key 与消息 type 统一 jt_/JT_ 前缀，为将来与 auto-fill-extension 合并预留命名空间

export const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

export const STORAGE_KEYS = {
  config: 'jt_config',   // storage.local：飞书凭证 + 字段映射
  history: 'jt_history', // storage.local：本地投递历史
  draft: 'jt_draft',     // storage.session：侧边栏表单草稿（防误关丢数据）
  token: 'jt_token'      // storage.session：tenant_access_token 缓存（不落盘）
};

export const HISTORY_LIMIT = 500;

// 扩展内部字段 → 飞书表格列名 的默认映射（配置页可改映射而不用改表）
export const DEFAULT_FIELD_MAP = {
  company: '公司',
  position: '岗位',
  appliedAt: '投递时间',
  link: '链接',
  status: '状态',
  note: '备注'
};

// 建表必需字段（测试连接时校验）；备注为可选列
export const REQUIRED_FIELDS = ['company', 'position', 'appliedAt', 'link', 'status'];

// 必需字段的期望 Bitable 类型（1 文本 / 3 单选 / 5 日期 / 15 超链接）
export const EXPECTED_FIELD_TYPES = {
  company: 1,
  position: 1,
  appliedAt: 5,
  link: 15,
  status: 3
};

// Bitable 字段类型编号 → 中文名（测试连接结果展示用）
export const FIELD_TYPE_NAMES = {
  1: '文本', 2: '数字', 3: '单选', 4: '多选', 5: '日期', 7: '复选框',
  11: '人员', 13: '电话号码', 15: '超链接', 17: '附件', 18: '单向关联',
  20: '公式', 21: '双向关联', 22: '地理位置', 23: '群组',
  1001: '创建时间', 1002: '最后更新时间', 1003: '创建人', 1004: '修改人', 1005: '自动编号'
};

// ⚠ 修改此数组时须同步更新 SKILL.md Step 5.2 建表 JSON 中的状态 options 列表
export const STATUS_OPTIONS = ['已投递', '测评', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '已挂', '已拒绝'];
