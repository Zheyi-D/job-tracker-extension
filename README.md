# 求职投递追踪（Job Tracker）

![MIT](https://img.shields.io/badge/license-MIT-green)

投递简历后一键记录：自动抓取当前招聘页面的公司、岗位、链接，确认后同步到你的飞书多维表格，作为求职投递追踪表。

Chrome 扩展 · Manifest V3 · 零依赖 · 原生 JS/CSS/HTML

## 功能

- **一键记录**：投完简历点工具栏图标打开侧边栏，自动抓取公司/岗位/链接/时间
- **固定侧边栏**：与浏览器并排常驻，点击页面不会消失；切换到新岗位页面自动带入新信息（手动编辑过则不覆盖）
- **确认后保存**：抓取结果可编辑修正；低置信度字段橙色高亮提醒核对
- **同步飞书**：写入你自己的多维表格，可筛选排序、用"状态"列跟踪笔试/面试进度
- **重复检测**：同一链接投过会提示（不拦截）
- **本地退路**：飞书写入失败可先存本地，稍后在设置页一键重试同步
- **草稿保护**：侧边栏关闭重开自动恢复未保存内容
- **一键初始化**：设置页可清空全部记录与配置，恢复默认状态

> ⚠ Chrome 限制：同一标签页同时只能显示一个扩展侧边栏，本扩展与「简历自动填充助手」的侧边栏会互相切换（后续两者合并后解决）。

## 安装

1. 下载/克隆本项目（或直接下 [ZIP](https://github.com/Zheyi-D/job-tracker-extension/archive/refs/heads/main.zip) 解压）
2. Chrome 打开 `chrome://extensions` → 打开右上角"开发者模式"
3. 点"加载已解压的扩展程序"，选择本项目文件夹

## 飞书侧配置（首次使用，约 10 分钟）

> 设置页内也有这份指南（扩展图标右键 → 选项）。

1. 打开 [飞书开放平台](https://open.feishu.cn) → 开发者后台 → **创建企业自建应用**（个人可免费注册飞书团队）；在"凭证与基础信息"页复制 **App ID** 和 **App Secret**。
2. 应用"权限管理"页开通 `bitable:app`（查看、编辑和管理多维表格）。
3. **创建版本并发布**（自己是管理员就自己审批通过）。⚠ **权限在发布后才生效**——最容易漏的一步。
4. 在飞书"我的空间"新建**多维表格**（⚠ 不要放知识库，`/wiki/` 链接的 token 无法直接使用），建列如下：

   | 列名 | 类型 |
   |---|---|
   | 公司 | 文本 |
   | 岗位 | 文本 |
   | 投递时间 | 日期（勾选"显示时间"） |
   | 链接 | 超链接 |
   | 状态 | 单选：已投递 / 测评 / 笔试 / 一面 / 二面 / 三面 / HR面 / Offer / 已挂 / 已拒绝 |
   | 备注（选填） | 文本 |

   列名不同也没关系，设置页"字段映射"里改映射即可。建议给"状态"列建一个看板视图跟踪面试进度。
5. 打开这张表 → 右上角 **⋯ → 更多 → 添加文档应用** → 搜索你的应用 → 添加并设为**可编辑**。⚠ 第二容易漏的一步，漏掉会报"无权访问"（91403）。
6. 复制表格的浏览器地址（形如 `https://xxx.feishu.cn/base/{app_token}?table={table_id}&view=...`），粘贴到设置页的 app_token 输入框，会自动解析出 app_token 和 table_id。
7. 设置页点"测试连接"——会同时验证凭证、表格定位、文档授权和字段结构，看到"✓ 连接成功"即完成。

## 使用

1. 在招聘官网投完简历
2. 点工具栏扩展图标打开固定侧边栏 → 核对/修正自动抓取的公司、岗位（橙色边框表示推测值，建议核对）
3. 点"保存到飞书" → 完成；打开下一个岗位页面会自动带入新信息，也可随时点「↻ 重新抓取」

## 抓取识别范围

四层启发式（无需任何大模型 API，纯本地零成本）：

1. **站点规则表 `SITE_RULES`**（`content/scraper.js`）：腾讯/阿里/字节/京东/美团/百度等大厂官网 + Moka、北森、用友大易、Workday、SuccessFactors、Greenhouse、Lever 等招聘 SaaS（一条规则覆盖数百家公司）
2. Open Graph meta 标签
3. 页面标题拆分（"岗位名-公司招聘"惯例）
4. h1 / 域名兜底（低置信度，界面高亮提醒）

遇到识别不准的网站？在 `SITE_RULES` 数组加一条规则即可永久修复：

```javascript
{ match: h => h === 'careers.example.com', company: '示例公司',
  position: () => text('h1.job-title') || genericPosition() },
```

## 安全说明

- App Secret 保存在 `chrome.storage.local`（**刻意不用 sync**，避免上传云端）；扩展存储按扩展 ID 隔离，网页和其他扩展无法读取。
- 权衡：本机恶意程序理论上可读浏览器 profile 目录。缓解：应用只开 `bitable:app` 权限、只把这一张表添加为文档应用——即使泄露，影响范围也仅限这张求职表。
- 个人自用场景可接受；**请勿将填有凭证的浏览器 profile 或本扩展目录分享给他人**。

## 项目结构与合并契约

本扩展设计为未来可合并进 [auto-fill-extension](https://github.com/Zheyi-D/auto-fill-extension)：

```
├── manifest.json          # MV3：sidePanel/storage/scripting + <all_urls>
├── service-worker.js      # 消息路由（JT_ 前缀）：保存/测试连接/重试同步
├── lib/
│   ├── feishu-api.js      # 【迁移核心】token 缓存 + Bitable 读写，零 UI 耦合
│   ├── storage.js         # 配置/历史/草稿/URL 规范化
│   └── constants.js       # 字段映射、选项、storage key（jt_ 前缀）
├── content/
│   └── scraper.js         # 【迁移核心】自包含 IIFE，零 chrome.* 依赖
├── sidepanel/             # 固定侧边栏（确认表单）
├── options/               # 设置页（凭证/字段映射/测试连接/历史管理/初始化）
└── LICENSE
```

合并约定：

- `lib/feishu-api.js` 仅依赖 `fetch` + `chrome.storage.session`，不含任何 UI/消息协议代码，整文件拷贝即可复用
- `content/scraper.js` 自包含、可被任何 `executeScript` 或 content script 调用，返回值为纯数据对象
- 消息 type 统一 `JT_` 前缀、storage key 统一 `jt_` 前缀，与合并目标的命名不冲突

## Roadmap

- [ ] V2：低置信度时可选调用 LLM 抽取公司/岗位（用户自配 API key）
- [ ] V2：远程重复检测（`records/search`，跨设备场景）
- [ ] AI Agent Skill：一句 prompt 让 Claude Code/Codex 自动装好扩展并连通飞书
- [ ] 更多站点规则（欢迎按上文格式补充）

## License

MIT © [Zheyi-D](https://github.com/Zheyi-D)
