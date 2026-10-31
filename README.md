# CiteFlow · 本地文献管理器

> 单机运行的文献管理工具：**RIS / WoS 引文导入 → 多级分类 → PDF 附件 → AI 论文归纳 → BibTeX 导出**，为 LaTeX 论文写作服务。

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 它解决什么问题

写论文时，引文散落在 IEEE Xplore、Web of Science 的导出文件里，PDF 躺在下载文件夹，BibTeX 又得手写，读完一篇还要自己在笔记里抠出「目的 / 方法 / 结论」。CiteFlow 把这条链路收拢到一个本地网页里：导入原始引文文件、按课题分类、挂上 PDF、让本地 Harness 读原文生成六字段归纳、一键导出 `.bib` 丢给 LaTeX。**数据全部留在本机**，没有账号、没有云同步。

## 功能

| 模块 | 说明 |
|---|---|
| 引文导入 | RIS（EndNote / IEEE Xplore）与 WoS `.ciw`；自动识别格式；DOI 去重（`skip` / `update`）；支持 `dryRun` 预演 |
| 分类管理 | 任意层级分类树，同级重名唯一、防环触发器；支持拖拽移动、批量移动 |
| 批量复制 | 「Copy to」把选中文献复制到目标分类（原文献保留，附件用硬链接/复制落到新记录的 `pdfs/<新id>/`） |
| PDF 附件 | 上传后归档到 `pdfs/<文献ID>/`，每条文献最多一个主附件；「替换 PDF」会先挂新文件再删除旧附件 |
| AI 归纳 | 逐篇生成 **目的 / 贡献 / 方法 / 结果 / 局限 / 感想** 六个中文字段，结果持久化；**必须先有 PDF 附件**（模型要读原文） |
| BibTeX 导出 | 按分类或按选中条目导出；LaTeX 特殊字符转义、BibTeX key 生成（`作者+年份+标题词`） |
| 检索与批量 | 标题 / 作者 / 摘要 / DOI 搜索，按类型、年份区间、有无 PDF 过滤；批量删除、批量移动 |
| 界面 | 深色三栏布局，手写 CSS，无 UI 框架；后端不可达时自动回退到内置 Demo 数据供界面评审 |

## 技术栈

**后端** — Express 4 · better-sqlite3 12 · TypeScript 5（`strict`）· 纯 ESM（相对导入必须带 `.js` 后缀）
**前端** — React 18 · Vite 5 · Axios · lucide-react · 手写 CSS（无 Ant Design / Tailwind）
**存储** — SQLite（WAL 模式）· 文件系统存 PDF
**AI** — DeepSeek Harness CLI（`dsh`）headless 模式 + `dsh-plugin-subscriptions`（Codex 订阅账号），可选接入；不配置也能正常使用其他功能

## 快速开始

```powershell
git clone https://github.com/4478sc/DSH_CiteFlow.git
cd DSH_CiteFlow

npm install
npm --prefix client install
npm run build          # tsc + client build
npm start              # http://localhost:3000
```

> **Node 版本**：18 及以上。Node 22/24 需要 `better-sqlite3 >= 12`（本仓库已锁定 `^12.11.1`）；Node 20 及以下用 `^11` 亦可。Windows 上若没有 MSVC Build Tools，请务必使用带预编译包的版本，否则会回落源码编译而失败。

开发模式（前后端分离 + 热更新）：

```powershell
npm run build:server; node --watch dist/server.js   # 终端 1：后端 :3000
npm --prefix client run dev                          # 终端 2：前端 :5173（/api 已代理到 3000）
```

## AI 归纳（可选功能）

在文献详情页点「生成归纳」，后端异步调用本机的 DeepSeek Harness，读该论文的 PDF 全文，产出六个中文字段并写入 `paper_summaries` 表。前端轮询状态（`pending → running → ready | error`），完成后「查看归纳」展开。

**启用前提**

1. 本机装有 DeepSeek Harness，且能运行 `dsh`（headless profile）；
2. 已安装并登录订阅插件 [`dsh-plugin-subscriptions`](https://github.com/V1ki/dsh-plugin-subscriptions)（在 Web 端 Settings → Subscriptions 登录 Codex，token 落在 `~/.dsh/plugins/subscriptions/`，headless 共享）；
3. 论文已上传 PDF —— 没有 PDF 时接口直接返回 `409 PDF_REQUIRED`，前端按钮也会禁用。

默认路由是**订阅插件里的 Codex `gpt-6.1-sol`**：每次调用会生成一层 `--patch` 覆盖层，把插件挂成 `llm-subscriptions` 并把默认模型指向 `provider: codex`。插件未安装时自动退回本机 OpenAI 兼容网关（`openai` provider），并在后端日志打印一行提示。

**配置项（都是环境变量，均可不设）**

| 变量 | 默认值 | 作用 |
|---|---|---|
| `DSH_CLI` | `dsh`（PATH） | Harness 启动器路径；也可写进 `data/dsh-cli.txt`（本机配置，不入库） |
| `DSH_PROFILE` | — | 固定使用 `headless`，无需设置 |
| `DSH_INSIGHT_PROVIDER` | `codex` | provider 名（`codex` 订阅 / `openai` 网关 / `aicodemirror1` / `opencode-go`） |
| `DSH_INSIGHT_MODEL` | `gpt-6.1-sol` | 模型 id |
| `DSH_INSIGHT_PLUGIN` | 自动探测 | `dsh-plugin-subscriptions` 的 `lib/index.js` 绝对路径；默认从 `~/.dsh/profiles/*/node_modules/` 里找 |
| `DSH_INSIGHT_BASE_URL` | `http://127.0.0.1:18080/v1` | 仅 `openai` provider 使用的兼容网关地址 |
| `DSH_INSIGHT_API_KEY_ENV` | 按 provider 推断 | 指向凭据里对应的环境变量名 |
| `DSH_TIMEOUT_MS` | `420000` | 单篇生成超时（读 PDF 全文通常 1–3 分钟） |
| `DSH_WORKDIR` | `data/dsh-tmp` | 覆盖层与工作目录；每篇论文用硬链接副本 `paper-<id>/`，不污染 `pdfs/` |

**实现要点**

- headless profile 默认关闭凭据存储、也没有任何 model route，直接调用只会得到 `MISSING_CREDENTIAL`；本项目在每次调用时生成一层**不含密钥**的 `--patch` 覆盖层，只对该次调用生效，不改动用户的 `~/.dsh` 配置。
- 生成时以 PDF 所在的工作目录启动 Harness 并提示模型先用 `pdftotext` 等工具提取正文；PDF 与摘要冲突时以 PDF 为准。
- 模型名、provider、超时都可覆盖，切换模型不需要改代码。
- 生成任务在后台异步执行，接口立即返回 `202 pending`，前端轮询；失败原因会原样写进 `paper_summaries.error` 并在界面上显示。

## 目录结构

```
src/
  database/database.ts     # 单例 + prepared 语句缓存 + 事务 + CRUD（核心）
  database/schema.sql      # 运行时真源（docs/schema.sql 是设计稿，已不同步）
  parsers/{ris,wos}-parser.ts   # 返回 { references, errors, warnings }
  services/dsh-runner.ts   # 调用 dsh headless：覆盖层、PDF 工作目录、NDJSON 解析
  services/reference-copy.ts # 复制文献到分类（含附件硬链接/复制）
  utils/bibtex-exporter.ts # 导出、转义、key 生成
  utils/storage.ts         # 附件归档 pdfs/、历史 uploads/ 迁移
  api/v1/*.ts              # 规范 API（categories / papers / files / imports / exports / insights / health）
  api/routes/*.ts          # 旧版兼容 API
  server.ts                # 挂载 v1、legacy、静态资源；PORT 固定 3000
client/src/
  App.tsx                  # 三栏状态机、搜索防抖、批量选择、附加/替换 PDF
  services/api.ts          # 全部前后端契约：归一化 + v1→legacy 回退 + 离线切 Demo
  data/demoStore.ts        # 离线种子库
  styles/globals.css       # 全部样式
samples/                   # 真实样本（测试用）
```

## API 速览

成功返回 `{ data, meta }`，失败返回 `{ error: { code, message } }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/categories` | 分类树 |
| POST/PATCH/DELETE | `/api/v1/categories[/:id]` | 增删改分类 |
| GET | `/api/v1/papers?page&pageSize&q&categoryId&type&yearFrom&yearTo&hasPdf` | 列表 / 搜索 / 分页 |
| GET | `/api/v1/papers/:id` | 详情（含附件） |
| POST/PATCH/DELETE | `/api/v1/papers[/:id]` | 增删改文献；删除时一并清理附件实体文件 |
| PATCH | `/api/v1/papers/batch-move` | 批量移动（`paperIds`, `categoryId`） |
| POST | `/api/v1/papers/batch-copy` | 批量复制到分类，返回新 id 列表（`paperIds`, `categoryId`） |
| DELETE | `/api/v1/papers/batch-delete` | 批量删除（`paperIds`） |
| POST | `/api/v1/imports` | 导入（multipart：`files`, `format`, `duplicatePolicy`, `dryRun`） |
| GET/POST | `/api/v1/exports/bibtex` | 按分类 / 按 `paperIds` 导出 BibTeX |
| POST | `/api/v1/files/:paperId/files` | 上传附件（归档到 `pdfs/`） |
| GET | `/api/v1/files/:id/content` | 流式读取附件 |
| DELETE | `/api/v1/files/:id` | 删除附件（含实体文件，并同步主附件字段） |
| GET | `/api/v1/insights/papers/:id` | 读取归纳：`{ status, hasPdf, purpose…reflection, model, generatedAt }` |
| POST | `/api/v1/insights/papers/:id` | 触发生成：`202`；无 PDF 返回 `409 PDF_REQUIRED`；不存在返回 `404` |

旧版兼容接口挂在 `/api`（`folders`、`references`、`import`、`export`），前端会优先 v1、失败后回退。

## 数据存放

| 路径 | 内容 | 说明 |
|---|---|---|
| `data/references.sqlite` | 文献 / 分类 / 附件 / 归纳记录 | 可用 `REFERENCE_MANAGER_DB` 改路径 |
| `pdfs/<文献ID>/` | 上传的 PDF | 数据库只存相对路径 `pdfs/3/paper.pdf` |
| `uploads/` | multer 临时目录 | 处理完即清空，正常应始终为空 |
| `data/dsh-tmp/` | 归纳覆盖层与工作目录 | 每篇论文一个 `paper-<id>/`，可随时删除 |

`.env` **不会被读取**（无 dotenv）。真正生效的环境变量：`REFERENCE_MANAGER_DB`、`REFERENCE_MANAGER_SCHEMA`，以及上面「AI 归纳」列出的 `DSH_*`。端口写死在 `src/server.ts`。

## 测试

```powershell
npm run test:parsers      # 29 项断言：内置合成样本 + samples/ 真实样本 + 诊断码
npm run test:integration  # 建库 → 分类 → RIS 解析 → 导入 → BibTeX 导出 全链路
npm test                  # 两者串行
```

解析器测试读取 `dist/` 编译产物（会先自动 `build:server`），并校验 `dist/` 不比源码旧。

## 已知限制

- 单用户、无认证，默认只监听本机；要暴露到局域网需自行加认证与反向代理。
- 端口 3000 硬编码。
- AI 归纳依赖本机 Harness 与可用模型凭据；未配置时该功能返回错误提示，其余功能不受影响。
- 归纳按「有 PDF 才能生成」设计；PDF 缺失或文件被手工删除时 `hasPdf` 为 false，接口返回 409。
- 上传文件大小限制仅对导入接口生效（50 MB）；附件接口未设上限。
- `docs/` 下部分交付文档含过时声明，**以 [`HANDOVER.md`](HANDOVER.md) 与代码为准**。

## 文档

| 文档 | 说明 |
|---|---|
| [`HANDOVER.md`](HANDOVER.md) | 权威交接文档：实测状态、已知问题、维护任务速查、变更记录 |
| [`docs/architecture.md`](docs/architecture.md) | 数据模型 / API / 解析规则 / key 生成规则的设计依据 |
| [`src/database/schema.sql`](src/database/schema.sql) | 数据库真源 |
| [`QUICKSTART.md`](QUICKSTART.md) | 更细的启动说明 |

## License

[MIT](LICENSE)
