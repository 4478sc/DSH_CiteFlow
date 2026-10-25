# CiteFlow · 本地文献管理器

> 单机运行的文献管理工具：**RIS / WoS 引文导入 → 多级分类 → PDF 附件 → BibTeX 导出**，为 LaTeX 论文写作服务。

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 它解决什么问题

写论文时，引文散落在 IEEE Xplore、Web of Science 的导出文件里，PDF 躺在下载文件夹，BibTeX 又得手写。CiteFlow 把这条链路收拢到一个本地网页里：导入原始引文文件、按课题分类、挂上 PDF、一键导出 `.bib` 丢给 LaTeX。**数据全部留在本机**，没有账号、没有云同步。

## 功能

| 模块 | 说明 |
|---|---|
| 引文导入 | RIS（EndNote / IEEE Xplore）与 WoS `.ciw`；自动识别格式；DOI 去重（`skip` / `update`）；支持 `dryRun` 预演 |
| 分类管理 | 任意层级分类树，同级重名唯一、防环触发器；支持拖拽移动、批量移动 |
| PDF 附件 | 上传后归档到 `pdfs/<文献ID>/`，每条文献最多一个主附件，支持流式预览与静态访问 |
| BibTeX 导出 | 按分类或按选中条目导出；LaTeX 特殊字符转义、BibTeX key 生成（`作者+年份+标题词`） |
| 检索与批量 | 标题 / 作者 / 摘要 / DOI 搜索，按类型、年份区间、有无 PDF 过滤；批量删除、批量移动 |
| 界面 | 深色三栏布局，手写 CSS，无 UI 框架；后端不可达时自动回退到内置 Demo 数据供界面评审 |

## 技术栈

**后端** — Express 4 · better-sqlite3 12 · TypeScript 5（`strict`）· 纯 ESM（相对导入必须带 `.js` 后缀）
**前端** — React 18 · Vite 5 · Axios · lucide-react · 手写 CSS（无 Ant Design / Tailwind）
**存储** — SQLite（WAL 模式）· 文件系统存 PDF

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

## 目录结构

```
src/
  database/database.ts     # 单例 + prepared 语句缓存 + 事务 + CRUD（约 2100 行，核心）
  database/schema.sql      # 运行时真源（docs/schema.sql 是设计稿，已不同步）
  parsers/{ris,wos}-parser.ts   # 返回 { references, errors, warnings }
  utils/bibtex-exporter.ts # 导出、转义、key 生成
  utils/storage.ts         # 附件归档 pdfs/、历史 uploads/ 迁移
  api/v1/*.ts              # 规范 API（categories / papers / files / imports / exports / health）
  api/routes/*.ts          # 旧版兼容 API
  server.ts                # 挂载 v1、legacy、静态资源；PORT 固定 3000
client/src/
  App.tsx                  # 三栏状态机、搜索防抖、批量选择
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
| POST/PATCH/DELETE | `/api/v1/papers[/:id]` | 增删改文献 |
| PATCH | `/api/v1/papers/batch-move` | 批量移动（`paperIds`, `categoryId`） |
| DELETE | `/api/v1/papers/batch-delete` | 批量删除（`paperIds`） |
| POST | `/api/v1/imports` | 导入（multipart：`files`, `format`, `duplicatePolicy`, `dryRun`） |
| GET/POST | `/api/v1/exports/bibtex` | 按分类 / 按 `paperIds` 导出 BibTeX |
| POST | `/api/v1/files/:paperId/files` | 上传附件（归档到 `pdfs/`） |
| GET | `/api/v1/files/:id/content` | 流式读取附件 |
| DELETE | `/api/v1/files/:id` | 删除附件（含实体文件） |

旧版兼容接口挂在 `/api`（`folders`、`references`、`import`、`export`），前端会优先 v1、失败后回退。

## 数据存放

| 路径 | 内容 | 说明 |
|---|---|---|
| `data/references.sqlite` | 文献 / 分类 / 附件记录 | 可用环境变量 `REFERENCE_MANAGER_DB` 改路径 |
| `pdfs/<文献ID>/` | 上传的 PDF | 数据库只存相对路径 `pdfs/3/paper.pdf` |
| `uploads/` | multer 临时目录 | 处理完即清空，正常应始终为空 |

`.env` **不会被读取**（无 dotenv）。真正生效的只有两个环境变量：`REFERENCE_MANAGER_DB`、`REFERENCE_MANAGER_SCHEMA`。端口写死在 `src/server.ts:19`。

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
- `docs/` 下部分交付文档（`PROJECT_STATUS.md`、`DELIVERY*.md`）含过时或无法复现的完成度声明，**以 [`HANDOVER.md`](HANDOVER.md) 为准**。
- 上传文件大小限制仅对导入接口生效（50 MB）；附件接口未设上限。

## 文档

| 文档 | 说明 |
|---|---|
| [`HANDOVER.md`](HANDOVER.md) | 权威交接文档：实测状态、已知问题、维护任务速查、变更记录 |
| [`docs/architecture.md`](docs/architecture.md) | 数据模型 / API / 解析规则 / key 生成规则的设计依据 |
| [`src/database/schema.sql`](src/database/schema.sql) | 数据库真源 |
| [`QUICKSTART.md`](QUICKSTART.md) | 更细的启动说明 |

## License

[MIT](LICENSE)