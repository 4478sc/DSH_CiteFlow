# 文献管理系统 — 会话交接文档

> 路径：`F:\dsh_somedata\reference-manager` · 交接时间：2026-10-25
> **本文件由后续会话逐文件实测校验后重写，结论优先于 README / STATUS / PROJECT_STATUS 等旧文档。**

---

## 0. 30 秒速览

- **是什么**：本地单机文献管理器。RIS / WoS 引文导入 → 多级分类 → PDF 附件 → BibTeX 导出（供 LaTeX 论文用）。
- **形态**：单仓库、前后端分离目录。后端 Express + better-sqlite3（ESM + TS strict），前端 React 18 + Vite（无 UI 框架，手写 CSS）。
- **一句话现状**：**前端可构建可运行；后端尚未完成首次构建**——根依赖未安装、`dist/` 不存在，且有 2 类必错的编译问题与 1 个导入接口字段不匹配（见 §6 P0）。
- **下一步**：装依赖 → 修 P0 → `npm run build` 通过 → 冒烟（§2、§9）。

---

## 1. 当前状态（实测快照 2026-10-25 11:20 前后）

| 项目 | 状态 | 证据 |
|---|---|---|
| 前端类型检查 | ✅ 通过 | `cd client; node node_modules/typescript/bin/tsc --noEmit` → exit 0 |
| 前端产物 | ✅ 已构建 | `client/dist` 时间 11:22，晚于最新源码 11:12 |
| 后端类型检查 | ❌ 失败 | 6 处 `$1` 占位符 + `imports.ts` 字段不匹配（§6） |
| 后端运行 | ❌ 从未跑过 | 无根 `node_modules`、无 `dist/`、`data/` 为空（无 .sqlite） |
| 解析器 | ✅ 可用 | 实测 2 个真实样本（各 1 条）+ 多记录 + CRLF 合成样本，0 error |
| 数据库层 | ⚠️ 未验证 | 依赖缺失，代码约 2,100 行含完整 CRUD/事务/迁移校验 |
| 测试套件 | ❌ 无 | 仓库无测试框架；`test-parsers.js` / `integration-test.js` 当前均不可直接运行 |
| Git | ❌ 无仓库 | 未 `git init` |

被交接方原述「8500 行 / 33 测试 / 202 样本 / 100% 完成」在本仓库**不可复现**，见 §7。

---

## 2. 接手第一步（按顺序执行）

```powershell
cd F:\dsh_somedata\reference-manager
npm install                 # 根依赖（Node 版本风险见 §6.1）
# 先修 §6 的 P0-1、P0-2、P0-3
npm run build               # tsc + client build
npm start                   # http://localhost:3000
```

开发模式：

```powershell
# 终端 1：后端（watch 编译产物）
npm run build:server; node --watch dist/server.js
# 终端 2：前端（Vite 5173，已配 /api → localhost:3000 代理）
cd client; npm run dev
```

**无后端也能看 UI**：前端内置离线回退（`client/src/data/demoStore.ts` 种子数据），`cd client; npm run dev` 直接打开即为 demo 模式，可用于纯界面评审。

---

## 3. 代码地图（按重要性排序）

| 文件 | 行数 | 作用 / 改动注意 |
|---|---|---|
| `src/database/database.ts` | ~2,100 | 核心。单例 `ReferenceDatabase.getInstance()`、prepared 语句缓存、事务封装、snake_case↔camelCase 映射、schema 定位与列校验、全部 CRUD + 附件 |
| `src/database/schema.sql` | 207 | **运行时真源**（`docs/schema.sql` 是设计稿，已不同步） |
| `src/utils/bibtex-exporter.ts` | 925 | 导出、LaTeX 转义、BibTeX key 生成（`escapeBibtex` / `generateBibtexKey` / `BIBTEX_ENTRY_TYPES`） |
| `src/parsers/ris-parser.ts` | 527 | RIS 解析，返回 `{ references, errors, warnings }` |
| `src/parsers/wos-parser.ts` | 549 | WoS(.ciw) 解析，同上结构 |
| `src/parsers/types.ts` | 65 | `CitationRecord`、`CitationParseResult`、诊断码 |
| `src/api/v1/*.ts` | ~700 | 规范 API：categories / papers / files / imports / exports / health |
| `src/api/routes/*.ts` | ~240 | 旧版兼容 API（folders / references / import / export / attach-pdf） |
| `src/server.ts` | 51 | 挂载 `/api/v1`、`/api`、静态 `client/dist` 与 `/pdfs`；**PORT 硬编码 3000** |
| `client/src/services/api.ts` | 777 | 全部前后端契约：`normalize*` 归一化、v1→legacy 逐级回退、离线切 demo |
| `client/src/App.tsx` | 475 | 三栏状态机、搜索防抖、批量选择、Toast |
| `client/src/data/demoStore.ts` | 868 | 离线种子库 + 内存态增删改 |
| `client/src/components/*.tsx` | ~1290 | Sidebar / ReferenceList / ReferenceDetail / ImportDialog / ConfirmDialog |
| `client/src/styles/globals.css` | 3743 | 全部样式（深色主题），无 Tailwind / AntD |
| `client/src/utils/format.ts` | 238 | 作者格式化、引用格式化、排序、文件夹路径、下载、BibTeX 预览 |

代码量实测：TS/TSX 9,433 行 + CSS 3,743 行 = 13,176 行（31 个文件）。

---

## 4. 技术栈与硬约束（改代码前必读）

- **Node 18+**（实测机器为 v24.20.0，注意 §6.1）；npm 11。
- **纯 ESM**：所有相对导入**必须写 `.js` 后缀**（即使源文件是 `.ts`），如 `import { parseRIS } from './parsers/ris-parser.js'`。`type: module` + `module: ESNext` + `moduleResolution: node`。不要改成 CommonJS。
- **`strict: true`**，含 `noImplicitAny`；递归函数必须标注返回类型。
- **无 ORM**：better-sqlite3 同步 API + 事务封装，全部写操作在事务内。
- **无 dotenv，`.env` 不会被读取**。真正生效的环境变量只有两个：
  - `REFERENCE_MANAGER_DB` — 数据库文件路径，默认 `<cwd>/data/references.sqlite`
  - `REFERENCE_MANAGER_SCHEMA` — schema.sql 路径

  `.env` / `.env.example` 里的 `DATABASE_PATH`、`STORAGE_DIR` 等是历史遗留，改了没效果。端口同上，只能改 `server.ts:19`。
- 前端依赖仅 `react` / `react-dom` / `axios` / `lucide-react`（图标）。没有 Ant Design，README 里提到 AntD 的地方是错的。

---

## 5. 数据模型（以 `src/database/schema.sql` 为准）

- **folders**：自引用树；同级重名唯一（root / child 两个 partial unique index）；有防环触发器；`ON DELETE CASCADE` 删子级。
- **references**：`type` 受 CHECK 约束为 7 种（article / inproceedings / book / masterthesis / phdthesis / incollection / misc）；`authors`、`editors`、`keywords` 以 **JSON 文本**存储并有 `json_valid` 校验；`bibtex_key` 非空且唯一；`pdf_path` 是主附件的冗余列；`folder_id` 为 `ON DELETE SET NULL`。
- **files**：一条文献多附件；`UNIQUE (reference_id, file_path)`；partial unique index 保证每条文献**最多 1 个 `is_primary`**。
- 视图：`folder_reference_counts`、`reference_details`；触发器三张表自动维护 `updated_at`。
- 启动时 `assertSchemaColumns()` 校验必需列，旧库会抛 `SCHEMA_MISMATCH`（删除 db 重建，或补迁移）。

---

## 6. 已知问题（按优先级）

### 6.0 P0 — 不修则 `npm run build` 必失败

1. **`$1` / `$2` 模板占位符残留**（6 处）：
   - `src/api/v1/files.ts:35, 51, 90, 106`
   - `src/api/v1/exports.ts:35, 66`

   现状 `res.status($1).json({ error: { code: '$2', message } })`；应为 `res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } })`。错误分支才会触发，但编译直接报 `TS2304: Cannot find name '$1'`。
2. **导入接口与解析器契约不匹配**：`src/api/v1/imports.ts:70, 73, 78` 用了 `parseResult.diagnostics` 与 `parseResult.records`，而解析器返回 `{ references, errors, warnings }`。**该接口目前 100% 失败**（TypeError 被逐文件 catch，表现为每条文件一条 error）。修法：字段改为 `references` / `errors` + `warnings`，诊断对象结构按 `CitationDiagnostic` 映射。
3. **`imports.ts` 类型错误**：`existing.id` 可能为 `undefined`（:114）、`err.message` 作用于 `unknown`（:126, :133）、`results` 各数组被推断为 `never[]`（给 `results` 显式标注类型即可一并解决）。

### 6.1 P0 环境风险 — better-sqlite3 与 Node 24

`better-sqlite3@^9.2.2` 发布于 2023 年末，Node 24（ABI 137）通常无预编译包，`npm install` 会回落到 node-gyp 本地编译，未装 VS Build Tools 时直接失败。
**首选**：用 Node 20/22 安装；**备选**：把依赖升到 `better-sqlite3@^11`（API 兼容），再跑一次 `npm install`。
> 本次会话的沙箱禁止写 npm 缓存（`%LOCALAPPDATA%\npm-cache` EPERM），故未实际执行安装——请在普通终端操作，不要在受限沙箱里重试。

### 6.2 P1 — 逻辑缺陷

4. **`DELETE /api/v1/papers/batch-delete` 不可达**：`papers.ts:107` 的 `delete('/:id')` 注册在 `:180` 的 `delete('/batch-delete')` 之前，Express 先匹配 `/:id`，`parseInt('batch-delete')` → NaN。**把具体路径路由挪到 `/:id` 之前**。前端 `api.ts:652` 已把它当作"可能失败"处理并有逐条删除兜底，所以症状是"批量删除静默变慢"。
5. **前端末级兜底参数名错**：`api.ts:683` 发 `PATCH /v1/papers/:id { categoryId }`，后端只认 `folderId`，该兜底不会真正移动文献。
6. **上传文件落在 `uploads/`**：`files.ts:8` 的 multer dest 是 `uploads/`，DB 记录该路径；而 `server.ts` 只静态暴露 `/pdfs`。预览走 `/api/v1/files/:id/content`（流式读取）仍可用，但 `uploads/` 会无限累积。若要长期保存：移动到 `pdfs/` 再更新 `file_path`。
7. **`src/api/v1/categories.ts:14`** 的 `buildTree` 递归无参数/返回类型，strict 下报 `TS7023/TS7024`，需补 `(parentId: number | null): FolderNode[]`。

### 6.3 P2 — 测试与工程化

8. `test-parsers.js:2-3` 从 `./src/parsers/*.js` 导入（该文件不存在），且硬编码 `F:\大创\...` 绝对路径 → 改为从 `dist/` 导入。
9. `integration-test.js` 依赖 `dist/database/database.js`，必须先 `npm run build:server`（`npm run test:integration` 已串好）。
10. 无 Git 仓库、无 CI、无 lint 配置。建议第一步 `git init` 并提交一次可用基线。

---

## 7. 文档真伪对照（别被旧文档误导）

| 文档 | 可信度 | 说明 |
|---|---|---|
| `docs/architecture.md`（1590 行） | ✅ 高 | 数据模型 / API / 解析规则 / key 生成规则的设计依据，仍是最完整的规格说明 |
| `README.md` | 🟡 中 | 功能描述基本属实；但混用 npm / pnpm，且写了并不存在的 Ant Design |
| `STATUS.md` | ❌ 低 | 停留在"数据库/前端进行中"，已过时 |
| `PROJECT_STATUS.md` / `DELIVERY*.md` | ❌ 低 | "202 样本、33/33 测试、8500 行、100%" 在本仓库无对应证据 |
| `src/database/schema.sql` | ✅ 最高 | 运行时真源，优先于 `docs/schema.sql` |

关于「202 个样本」：仓库内只有两个真实样本文件（`F:\大创\引文数据包\IEEE Xplore Citation RIS Download 2022.9.1.9.11.56.ris` 423 B / 1 条；`savedrecs (58).ciw` 2.5 KB / 1 条）。实测均解析成功（0 error 0 warning），多记录拆分与 CRLF 也已验证，但**没有 130+72 条的规模证据**。

---

## 8. 常见维护任务速查

| 任务 | 改哪里 | 关键注意点 |
|---|---|---|
| 新增导入格式（如 EndNote XML） | 新建 `src/parsers/x-parser.ts`，实现 `parseXWithDiagnostics(): CitationParseResult`；在 `imports.ts` 加分支与格式探测 | 探测目前靠 `content.includes('TY  -')` 与 `('PT ' / 'FN ')`，扩展时同步改这里 |
| 修 BibTeX 输出格式 | `utils/bibtex-exporter.ts` | 转义 `escapeBibtex`、key `generateBibtexKey`、类型映射 `BIBTEX_ENTRY_TYPES`；改完用真实样本比对 |
| 加文献字段 | `schema.sql` 加列 → `database.ts` 的 `REQUIRED_REFERENCE_COLUMNS` + 行↔对象映射 + INSERT/UPDATE 语句 | 旧库会 `SCHEMA_MISMATCH`，需删库重建或写迁移 |
| 加 API | `src/api/v1/<域>.ts` + `v1/index.ts` 挂载 | 成功 `{ data, meta }`，失败 `{ error: { code, message } }`；具体路径路由放 `/:id` 之前 |
| 前端接新接口 | `client/src/services/api.ts` | 保持 `withCandidates([v1, legacy], fallback)` 模式与 `normalize*` 兼容层，不要绕过 |
| 改 UI / 样式 | `components/*.tsx` + `styles/globals.css` | 无 UI 库；图标用 `lucide-react`；深色主题变量在 css 顶部 |
| 换数据库位置 | 环境变量 `REFERENCE_MANAGER_DB` | 不是 `.env` 里的 `DATABASE_PATH` |
| 重置数据 | 删 `data/references.sqlite`（含 `-wal` / `-shm`） | 启动会自动建表 |
| 换端口 | `src/server.ts:19` | 没有读 `PORT` 环境变量 |
| 关闭所有 DB 连接 | `ReferenceDatabase.closeAll()` | 测试 teardown / 进程退出时用 |

---

## 9. 改动后的最小验证流程

```powershell
npm run build:server                       # 必须 0 错误
cd client; node node_modules/typescript/bin/tsc --noEmit; npm run build; cd ..
node integration-test.js                   # 建库→分类→RIS 解析→导入→BibTeX 导出 冒烟
npm start                                  # 另开终端执行以下检查：
curl http://localhost:3000/api/v1/health
curl "http://localhost:3000/api/v1/papers?page=1&pageSize=5"
curl -X POST http://localhost:3000/api/v1/imports -F "files=@F:\大创\引文数据包\savedrecs (58).ciw" -F "format=auto"
curl -X POST http://localhost:3000/api/v1/exports/bibtex -H "Content-Type: application/json" -d '{"paperIds":[1]}'
```

验收要点：解析条数 = 文件内 `TY  -` / `PT ` 记录数；BibTeX 条目数与导出文献数一致；`bibtex_key` 无重复。

---

## 10. 建议的下一步（按价值排序）

1. 装依赖（Node 20/22）+ 修 P0 三处 → 让 `npm run build` 通过。
2. 修 `batch-delete` 路由顺序，用 3 条以上样本做一次真实导入回归。
3. `git init` + 首次提交，把 `HANDOVER.md` 一并纳入。
4. 把解析器测试改成读 `dist/`，补 5–10 条真实样本固化为可重复测试。
5. 功能增强：EndNote XML、DOI lookup、SQLite FTS5 全文检索、CSV 导出、数据库自动备份。

---

## 11. 交接背景

本项目由 4 个子代理并行完成：**架构**（`docs/architecture.md`）、**数据库**（`database.ts` + `schema.sql`）、**解析器**（RIS/WoS + BibTeX）、**前端**（React 三栏 UI）。交付文档堆叠了六份、但未做最终集成构建，因此存在本文件 §6 的落地缺口——接手时请以可执行验证为准，不要以文档中的完成度声明为准。
