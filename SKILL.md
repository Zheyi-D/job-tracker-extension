---
name: 求职投递追踪插件
slug: job-tracker-feishu-skill
displayName: 求职投递追踪插件
version: 1.0.0
description: 安装「求职投递追踪」Chrome 插件并连通飞书多维表格——克隆最新代码（或 git pull 更新已有目录）、引导完成飞书开放平台配置、调用飞书 OpenAPI 自动建好投递记录表、输出配置项。用户只需完成少量网页端手动操作并回报凭证，建表全自动。
---

> 上面 `version` 只是 SkillHub 的标识字段；实际代码永远从 **main 分支** `git clone`/`git pull` 拿最新版，不会写死某个版本。

# 求职投递追踪 — Skill

## 一件事

帮用户装好 Chrome 扩展 + 在他自己的飞书多维表格里自动建好投递记录表、输出配置、引导完成。

用户说一句"帮我装那个求职投递追踪插件"，你按下面的流程走完。

## 开始前先说清楚

告诉用户：**大部分步骤我来做，但下面 4 步只能你亲手操作**（浏览器和飞书的安全限制，任何 AI 都无法代劳）：

1. 飞书开放平台的网页操作（建应用 / 开权限 / 发布版本）— 约 3 分钟
2. 在飞书"我的空间"新建一个空多维表格并给应用授权 — 约 1 分钟
3. 在 `chrome://extensions` 加载扩展 — 约 30 秒
4. 把 4 项配置粘进扩展设置页 — 约 30 秒

**建表、建字段、验证连通这些最繁琐的部分由我自动完成。**

## Step 0: 能力探测

按顺序判断，进入对应场景：

- 你**能执行 shell 命令 / 读写文件**（Claude Code、Codex、Workbuddy、Qclaw 等）→ **场景 A**（主流程）
- 能执行命令，但用户说**从没用过飞书** → **场景 B**：先走"飞书从零注册"，再接场景 A
- 你**不能执行命令**（纯对话类产品）→ **场景 C**：输出图文教程，全程用户手动

---

## 场景 A：主流程（agent 自动建表）

### Step 1: 获取最新代码

不要写死版本号，始终拿最新 main 分支：

```bash
if [ -d job-tracker-extension ]; then
  cd job-tracker-extension && git pull origin main
else
  git clone https://github.com/Zheyi-D/job-tracker-extension.git
fi
```

没有 git 就让用户下载最新 ZIP 并解压（覆盖旧目录）：
https://github.com/Zheyi-D/job-tracker-extension/archive/refs/heads/main.zip

### Step 2: 加载扩展 🙋（用户手动）

发给用户：

> 1. Chrome 打开 `chrome://extensions`
> 2. 右上角打开"开发者模式"
> 3. 点"加载已解压的扩展程序"，选择 `job-tracker-extension` 文件夹
> 4. 装好后回复"好了"

### Step 3: 飞书开放平台配置 🙋（用户手动）

发给用户：

> 1. 打开 https://open.feishu.cn → 右上角"开发者后台" → **创建企业自建应用**（名称随意，如"求职追踪"）
> 2. 左侧"凭证与基础信息"页：复制 **App ID**（cli_ 开头）和 **App Secret**
> 3. 左侧"权限管理"：搜索并开通 `bitable:app`（查看、编辑和管理多维表格）
> 4. 左侧"版本管理与发布"：**创建版本 → 申请发布**（自己是管理员就自己审批通过）
>    ⚠ 权限在发布后才生效，这步最容易漏
> 5. 把 **App ID 和 App Secret** 发给我

等待用户回报凭证。收到 App Secret 后只在调用 API 时使用，不要在任何 UI 中回显。告诉用户：会话结束后可在开放平台随时"重置 Secret"作废本次用的凭证。

### Step 4: 建空 base + 授权 🙋（用户手动）

> 1. 打开飞书 → 云文档"我的空间" → 新建 → **多维表格**（⚠ 不要建在知识库里）
> 2. 打开这个表 → 右上角 **⋯ → 更多 → 添加文档应用** → 搜索你刚建的应用 → 添加并设为**可编辑**
>    ⚠ 漏掉这步后面全部报"无权访问"（91403）
> 3. 把浏览器地址栏的**完整链接**发给我（形如 `https://xxx.feishu.cn/base/XXXX?table=...`）

从链接解析 app_token：`/base/` 与 `?` 之间的段。如果链接是 `/wiki/` 开头，说明表建在知识库里了，让用户按第 1 步重建在"我的空间"。

### Step 5: 自动建表（agent 执行）

**5.1 获取 tenant_access_token：**

```bash
TOKEN=$(curl -sS -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d '{"app_id":"<APP_ID>","app_secret":"<APP_SECRET>"}' \
  | sed 's/.*"tenant_access_token":"\([^"]*\)".*/\1/')
echo "TOKEN: ${TOKEN:0:10}..."
```

如果 `TOKEN` 为空或太短，打印完整响应用于排错。常见原因：10003/10014 = 凭证抄错，或应用未发布。

**5.2 把建表 JSON 写入文件 `table.json`：**

注意：中文 JSON **不要内联在 curl -d 里**（Windows 终端引号转义会破坏它），用文件 + `--data-binary` 提交。

```json
{
  "table": {
    "name": "投递记录",
    "default_view_name": "全部投递",
    "fields": [
      { "field_name": "公司", "type": 1 },
      { "field_name": "岗位", "type": 1 },
      { "field_name": "投递时间", "type": 5, "ui_type": "DateTime",
        "property": { "date_formatter": "yyyy-MM-dd HH:mm" } },
      { "field_name": "链接", "type": 15, "ui_type": "Url" },
      { "field_name": "状态", "type": 3, "ui_type": "SingleSelect",
        "property": { "options": [
          { "name": "已投递" }, { "name": "测评" }, { "name": "笔试" },
          { "name": "一面" }, { "name": "二面" }, { "name": "三面" },
          { "name": "HR面" }, { "name": "Offer" }, { "name": "已挂" }, { "name": "已拒绝" }
        ] } },
      { "field_name": "备注", "type": 1 }
    ]
  }
}
```

规则说明（不要改动）：
- 第一个字段必须是"公司"（主字段），传文本类型（1）是合法的；传单选会报 1254012
- "投递时间"的 `date_formatter: "yyyy-MM-dd HH:mm"` 对应界面上的"显示时间"
- "状态"选项名必须与上面完全一致（扩展写入时按选项名匹配）；color 省略则自动依次分配

**5.3 建表：**

```bash
curl -sS -X POST "https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @table.json
```

成功时从响应 `data.table_id` 取出 **table_id**（tbl 开头）。随后删除 `table.json`。

常见错误处理：
| code | 含义 | 处理 |
|---|---|---|
| 91403 | 应用无权访问该表 | 用户漏了 Step 4-2"添加文档应用"，回去补 |
| 99991672 | 权限不足 | 用户漏了 Step 3-4"发布版本"，回去补 |
| 1254040 | app_token 不存在 | 多半是 /wiki/ 链接，回 Step 4 |
| 1254012 | 字段类型不支持 | 检查 fields 第一项是否被改动 |

**5.4 验证 + 清理：**

列出字段确认 6 列齐全：

```bash
curl -sS "https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/fields?page_size=100" \
  -H "Authorization: Bearer $TOKEN"
```

再列出当前 base 的所有表：

```bash
curl -sS "https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables?page_size=100" \
  -H "Authorization: Bearer $TOKEN"
```

空 base 自带一张默认表（通常叫"数据表"）。询问用户是否删除；同意则：

```bash
curl -sS -X DELETE "https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<默认表table_id>" \
  -H "Authorization: Bearer $TOKEN"
```

（只剩最后一张表时飞书拒绝删除，报 1254034，这是正常保护——如果新表是仅剩的，删不掉也无所谓，正好留着。）

### Step 6: 输出配置 🙋（用户手动）

用如下格式发给用户（table_id 用 5.3 拿到的值）：

> ✅ 表已建好。最后一步，把下面 4 项填进扩展：
>
> 扩展图标右键 → 选项（或 `chrome://extensions` → 详情 → 扩展程序选项）
>
> | 设置项 | 值 |
> |---|---|
> | App ID | `cli_xxxx` |
> | App Secret | `xxxx` |
> | app_token | `xxxx`（也可粘贴表格完整链接，会自动解析） |
> | table_id | `tblxxxx` |
>
> 填完点"保存配置" → 点"**测试连接**"。看到"✓ 连接成功"就全部完成了！

测试连接会同时验证凭证、表格定位、文档授权和字段结构；若报错，把设置页显示的中文错误提示发回来，按提示处理。

### Step 7: 告知使用方法

> 在招聘官网投完简历 → 点工具栏扩展图标打开侧边栏 → 核对自动抓取的公司/岗位（橙色边框表示推测值）→ 点"保存到飞书"。建议在飞书表里给"状态"列建看板视图跟踪面试进度。

---

## 场景 B：用户完全没用过飞书

在场景 A 的 Step 3 之前，先发：

> 1. 访问 https://www.feishu.cn 下载飞书，用手机号注册（个人免费）
> 2. 注册时会引导"创建团队"，随便起个名（如"个人空间"），你自动成为管理员
>    ——必须是管理员才能自己审批应用发布
> 3. 完成后回复我，继续下一步

然后按场景 A 的 Step 3 继续。

---

## 场景 C：agent 无 shell 能力（退化为图文教程）

不要尝试执行命令。直接输出以下：

1. 下载 ZIP 并解压：https://github.com/Zheyi-D/job-tracker-extension/archive/refs/heads/main.zip
2. Chrome 打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选解压出的文件夹
3. 扩展图标右键 → 选项 → 展开"📖 首次配置指南"——**设置页内置了完整的分步指南**，照着做即可，全程约 10 分钟。建表列时严格按指南中的"字段要求"表建：公司/岗位/备注=文本，投递时间=日期（勾选"显示时间"），链接=超链接，状态=单选（选项：已投递/测评/笔试/一面/二面/三面/HR面/Offer/已挂/已拒绝）
4. 遇到报错看设置页的中文提示，或对照仓库 README 的"飞书侧配置"一节排错

你仍可帮用户做的事：帮他解析粘贴的表格链接（提取 app_token 和 table_id）、解答配置步骤的疑问、解读"测试连接"的报错文案。
