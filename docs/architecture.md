# 文献管理系统架构与数据模型

> 技术栈：React + TypeScript / Node.js + Express / SQLite  
> 目标：单机或小团队使用，低运维、易实现、可逐步扩展  
> 配套文件：[schema.sql](./schema.sql)（可直接执行）

---

## 1. 总体架构

```
┌─────────────────────────────────────────────┐
│ React SPA (Vite + TypeScript)               │
│  分类树 / 文献列表 / 详情 / 导入 / 导出      │
└──────────────────┬──────────────────────────┘
                   │ REST /api/v1
                   │ JSON + multipart/form-data
┌──────────────────▼──────────────────────────┐
│ Express + TypeScript                        │
│  routes → services → db (prepared SQL)      │
│   ├─ RIS / WoS parser                       │
│   ├─ BibTeX exporter                        │
│   └─ file service                           │
└──────────┬──────────────────────┬───────────┘
           │                      │
   better-sqlite3           local storage/
           │                      │
     data/lit.db          storage/papers/<paperId>/<uuid>.pdf
```

关键决策：

1. **SQLite + WAL 模式**：单进程 Express 直接使用 `better-sqlite3`，同步 API 简单可靠；WAL 允许读写并行。未来多用户/多实例再迁移 PostgreSQL。
2. **元数据与文件分离**：SQLite 只存文件元数据和相对路径，PDF 本体放本地 `storage/`；数据库备份和文件备份可以分开做。
3. **分类使用邻接表**：`categories.parent_id` 表达任意层级树，移动分类只需改一个字段；查询子树用递归 CTE。
4. **一篇文献一个主分类**：满足“文件夹树”心智模型，`category_id = NULL` 表示未分类。未来需要“一篇文献属于多个文件夹”时，再加 `paper_categories` 关联表。
5. **作者用 JSON 数组**：保留作者顺序，避免为 MVP 引入 `authors` / `paper_authors` 两张表。SQLite JSON1 校验，BibTeX 导出时直接 `join(' and ')`。
6. **DOI 唯一**：导入时统一小写、去掉 `https://doi.org/` 前缀；重复 DOI 按 `skip` 或 `update` 策略处理。
7. **BibTeX key 持久化**：生成后写入 `papers.citation_key`，保证多次导出、修改元数据后引用 key 稳定。

---

## 2. 数据模型

### 2.1 实体关系

```
categories 1 ──< categories   (parent_id, 自关联)
categories 1 ──< papers       (category_id, 删除分类时置 NULL)
papers     1 ──< files        (paper_id, 删除文献时级联删除)
```

### 2.2 表说明

| 表 | 作用 | 关键约束 |
|---|---|---|
| `categories` | 多级分类/文件夹 | 同一父节点下名称唯一；`parent_id` 自关联；删除父分类级联删除子分类 |
| `papers` | 文献元数据 | 标题非空；DOI 非空时唯一；`citation_key` 非空时唯一 |
| `files` | PDF/附件 | 每篇文献最多一个 `is_primary = 1`；`storage_path` 唯一；删除文献级联删记录 |

### 2.3 为什么这样设计

**分类树用邻接表，而不是嵌套集/物化路径。**  
分类数量通常不大，递归 CTE 足够快；增删改和移动分类最简单。物化路径需要维护路径字符串，移动子树时成本高，MVP 不需要。

**作者不单独建表。**  
MVP 不需要“作者主页、作者去重、按作者聚合”等能力；作者顺序比作者实体更重要。若后续要做作者维度功能，再迁移为：

```
authors(id, family_name, given_name, normalized_name)
paper_authors(paper_id, author_id, position)
```

**文件表独立。**  
一篇文献可以有一个主 PDF 和若干补充材料；文件路径不放在 `papers` 表里，避免一篇文献多文件时无法表达。

**不建标签表。**  
需求没有要求标签；`keywords_json` 只保存原始关键词，后续需要标签筛选时再加 `tags` / `paper_tags`。

---

## 3. 完整数据库 Schema（SQLite）

以下 SQL 与 [schema.sql](./schema.sql) 一致，可直接执行。要求 SQLite >= 3.35（`better-sqlite3` 自带较新版本）。

> 依赖 SQLite JSON1（`json_valid` / `json_type`）。`better-sqlite3` 默认包含；若使用系统 SQLite，需确认编译时没有 `SQLITE_OMIT_JSON`。

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

BEGIN;

-- 1. 分类表：邻接表树
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_parent_name
  ON categories (COALESCE(parent_id, 0), name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS ix_categories_parent
  ON categories (parent_id, sort_order, name);

-- 2. 文献表
CREATE TABLE IF NOT EXISTS papers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type           TEXT    NOT NULL DEFAULT 'article',
  title          TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  authors_json   TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(authors_json)),
  keywords_json  TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(keywords_json)),
  year           INTEGER CHECK (year IS NULL OR year BETWEEN 1000 AND 2999),
  publication    TEXT,
  volume         TEXT,
  issue          TEXT,
  pages          TEXT,
  publisher      TEXT,
  doi            TEXT,
  url            TEXT,
  abstract       TEXT,
  language       TEXT,
  citation_key   TEXT,
  notes          TEXT,
  source_format  TEXT    NOT NULL DEFAULT 'manual'
                         CHECK (source_format IN ('ris', 'wos', 'manual')),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ix_papers_category
  ON papers (category_id, year DESC, title);
CREATE INDEX IF NOT EXISTS ix_papers_created
  ON papers (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_papers_updated
  ON papers (updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_papers_title
  ON papers (title);
CREATE INDEX IF NOT EXISTS ix_papers_year
  ON papers (year DESC);
CREATE INDEX IF NOT EXISTS ix_papers_publication
  ON papers (publication);

CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_doi
  ON papers (doi COLLATE NOCASE)
  WHERE doi IS NOT NULL AND trim(doi) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_citation_key
  ON papers (citation_key COLLATE NOCASE)
  WHERE citation_key IS NOT NULL AND trim(citation_key) <> '';

-- 3. 文件表
CREATE TABLE IF NOT EXISTS files (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id       INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL DEFAULT 'pdf'
                         CHECK (kind IN ('pdf', 'supplement', 'other')),
  original_name  TEXT    NOT NULL CHECK (length(trim(original_name)) > 0),
  storage_path   TEXT    NOT NULL UNIQUE,
  mime_type      TEXT    NOT NULL DEFAULT 'application/pdf',
  size_bytes     INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  sha256         TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0
                         CHECK (is_primary IN (0, 1)
                                AND (is_primary = 0 OR kind = 'pdf')),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ix_files_paper
  ON files (paper_id, is_primary DESC, created_at);
CREATE INDEX IF NOT EXISTS ix_files_sha256
  ON files (sha256);

CREATE UNIQUE INDEX IF NOT EXISTS ux_files_one_primary
  ON files (paper_id)
  WHERE is_primary = 1;

-- 4. updated_at 由服务层在每次 UPDATE 时写入

COMMIT;
```

### 3.1 关键字段约定

| 字段 | 约定 |
|---|---|
| `papers.type` | 统一为 `article` / `book` / `incollection` / `inproceedings` / `phdthesis` / `mastersthesis` / `techreport` / `misc`，应用层校验 |
| `authors_json` | `["Smith, John", "Doe, Jane"]`，保持原始顺序 |
| `keywords_json` | `["deep learning", "transformer"]` |
| `doi` | 小写；去掉 `https://doi.org/`、`http://dx.doi.org/`、`doi:` 前缀 |
| `publication` | 期刊名、会议名、书名等统一放在这里；导出时按类型映射为 `journal` / `booktitle` |
| `pages` | 自由文本，保留 `1-12`、`e123`、`Suppl 1` 等原始形式；导出 BibTeX 时把数字间的 `-` 转成 `--` |
| `storage_path` | 相对 `STORAGE_DIR` 的路径，例如 `papers/12/550e8400-e29b-41d4-a716-446655440000.pdf` |
| `citation_key` | 小写、不含空格和特殊字符；为空时由服务端生成 |

> `updated_at` 不通过 SQLite 触发器维护：所有写操作都经过 service，在更新语句中显式写入 `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`。这样避免 `recursive_triggers` 与级联外键组合时的递归问题，也更容易测试。

### 3.2 常用查询

**查询某分类及其所有子分类下的文献：**

```sql
WITH RECURSIVE subtree(id) AS (
  SELECT id FROM categories WHERE id = ?
  UNION ALL
  SELECT c.id
    FROM categories c
    JOIN subtree s ON c.parent_id = s.id
)
SELECT p.*
  FROM papers p
 WHERE p.category_id IN (SELECT id FROM subtree)
 ORDER BY p.year DESC, p.title;
```

**查询分类面包屑（从根到当前）：**

```sql
WITH RECURSIVE ancestors(id, parent_id, name, depth) AS (
  SELECT id, parent_id, name, 0
    FROM categories
   WHERE id = ?
  UNION ALL
  SELECT c.id, c.parent_id, c.name, a.depth + 1
    FROM categories c
    JOIN ancestors a ON c.id = a.parent_id
)
SELECT id, name
  FROM ancestors
 ORDER BY depth DESC;
```

**直接计数：**

```sql
SELECT category_id, COUNT(*) AS paper_count
  FROM papers
 GROUP BY category_id;
```

**统计每个分类的子树文献数（一次查询，避免 N+1）：**

```sql
WITH RECURSIVE subtree(root_id, id) AS (
  SELECT id, id FROM categories
  UNION ALL
  SELECT s.root_id, c.id
    FROM categories c
    JOIN subtree s ON c.parent_id = s.id
)
SELECT s.root_id AS category_id, COUNT(p.id) AS subtree_paper_count
  FROM subtree s
  LEFT JOIN papers p ON p.category_id = s.id
 GROUP BY s.root_id;
```

### 3.3 删除语义

- 删除分类：`ON DELETE CASCADE` 删除整棵子树；这些分类下的文献 `category_id` 被置为 `NULL`，文献和 PDF 保留。
- 删除文献：`files` 记录级联删除；服务层在事务提交后删除磁盘文件。数据库外键不会删除磁盘文件，必须由服务层处理。
- 删除文件：删除 `files` 记录并删除磁盘文件；如果删除磁盘失败，记录删除仍可成功，记录日志并由清理任务补偿。

---

## 4. API 设计

### 4.1 通用约定

- Base URL：`/api/v1`
- 请求/响应：`application/json; charset=utf-8`；上传使用 `multipart/form-data`
- ID：整数
- 时间：ISO 8601 UTC 字符串，例如 `2026-10-25T02:30:00.000Z`
- 命名：JSON 字段使用 camelCase；数据库字段使用 snake_case
- 分页：`page`（从 1 开始，默认 1）、`pageSize`（默认 20，最大 100）
- 成功响应统一包一层 `data`；列表额外带 `meta`
- 认证：本地单用户版可省略；如果要暴露到局域网，增加一个简单的 Bearer token 或登录会话

**成功响应：**

```json
{ "data": { "id": 1, "name": "人工智能" } }
```

**列表响应：**

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 20, "total": 42 }
}
```

**错误响应：**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参数校验失败",
    "details": [
      { "field": "title", "message": "标题不能为空" }
    ]
  }
}
```

常用错误码：

| HTTP | code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 参数缺失/格式错误 |
| 404 | `NOT_FOUND` | 文献/分类/文件不存在 |
| 409 | `CATEGORY_CYCLE` | 把分类移动到自己的子孙节点下 |
| 409 | `CATEGORY_NAME_TAKEN` | 同级分类重名 |
| 409 | `CATEGORY_NOT_EMPTY` | 非空分类未带 `force=true` |
| 409 | `DUPLICATE_DOI` | DOI 已存在且策略为拒绝 |
| 413 | `FILE_TOO_LARGE` | 上传文件超过限制 |
| 415 | `UNSUPPORTED_FORMAT` | 不是 RIS/WoS/PDF |
| 500 | `INTERNAL_ERROR` | 未捕获异常 |

---

## 5. API 接口列表

### 5.1 接口总览

| 模块 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 分类 | GET | `/api/v1/categories` | 获取分类树（含计数） |
| 分类 | GET | `/api/v1/categories/:id` | 分类详情 + 面包屑 |
| 分类 | POST | `/api/v1/categories` | 新建分类 |
| 分类 | PATCH | `/api/v1/categories/:id` | 重命名 / 移动 / 排序 |
| 分类 | DELETE | `/api/v1/categories/:id` | 删除分类（非空需 `force=true`） |
| 文献 | GET | `/api/v1/papers` | 列表、搜索、筛选、分页 |
| 文献 | GET | `/api/v1/papers/:id` | 文献详情（含文件、分类路径） |
| 文献 | POST | `/api/v1/papers` | 手工新建文献 |
| 文献 | PATCH | `/api/v1/papers/:id` | 更新文献 |
| 文献 | DELETE | `/api/v1/papers/:id` | 删除文献及文件 |
| 文献 | GET | `/api/v1/papers/:id/bibtex` | 单条 BibTeX |
| 文件 | POST | `/api/v1/papers/:id/files` | 上传 PDF/附件 |
| 文件 | GET | `/api/v1/papers/:id/files` | 文件列表 |
| 文件 | GET | `/api/v1/files/:id/content` | 下载/预览文件 |
| 文件 | PATCH | `/api/v1/files/:id` | 设为主文件 / 重命名 |
| 文件 | DELETE | `/api/v1/files/:id` | 删除文件 |
| 导入 | POST | `/api/v1/imports` | 导入 RIS/WoS，支持 `dryRun` |
| 导出 | GET | `/api/v1/exports/bibtex` | 导出 BibTeX 文件 |
| 导出 | POST | `/api/v1/exports/bibtex` | 大批量选中导出 |
| 系统 | GET | `/api/v1/health` | 健康检查 |
| 系统 | GET | `/api/v1/stats` | 首页统计（可选） |

### 5.2 分类接口

#### GET `/api/v1/categories`

获取完整分类树。建议一次返回整棵树，前端直接渲染，避免逐层请求。

查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `withCounts` | boolean | `true` | 是否返回文献计数 |

响应示例：

```json
{
  "data": [
    {
      "id": 1,
      "parentId": null,
      "name": "人工智能",
      "sortOrder": 0,
      "paperCount": 12,
      "subtreePaperCount": 42,
      "children": [
        {
          "id": 2,
          "parentId": 1,
          "name": "自然语言处理",
          "sortOrder": 0,
          "paperCount": 30,
          "subtreePaperCount": 30,
          "children": []
        }
      ]
    }
  ]
}
```

- `paperCount`：直接属于该分类的文献数。
- `subtreePaperCount`：包含所有子孙分类的文献数。

#### GET `/api/v1/categories/:id`

返回分类详情和从根到当前节点的路径，便于前端显示面包屑。

```json
{
  "data": {
    "id": 2,
    "parentId": 1,
    "name": "自然语言处理",
    "sortOrder": 0,
    "paperCount": 30,
    "subtreePaperCount": 30,
    "path": [
      { "id": 1, "name": "人工智能" },
      { "id": 2, "name": "自然语言处理" }
    ]
  }
}
```

#### POST `/api/v1/categories`

请求：

```json
{
  "name": "自然语言处理",
  "parentId": 1,
  "sortOrder": 0
}
```

响应：`201 Created`

```json
{
  "data": {
    "id": 2,
    "parentId": 1,
    "name": "自然语言处理",
    "sortOrder": 0,
    "createdAt": "2026-10-25T02:30:00.000Z"
  }
}
```

校验：

- `name` 去空格后长度 1–100。
- `parentId` 为 `null` 表示根分类；否则必须存在。
- 同一 `parentId` 下名称不能重复（不区分 ASCII 大小写）。
- `sortOrder` 默认 0，同级按 `sortOrder, name` 排序。

#### PATCH `/api/v1/categories/:id`

支持重命名、移动、排序，所有字段可选：

```json
{
  "name": "NLP",
  "parentId": 3,
  "sortOrder": 2
}
```

移动校验（服务层必须做）：

1. `parentId === id` → `409 CATEGORY_CYCLE`。
2. `parentId` 是当前分类的子孙节点 → `409 CATEGORY_CYCLE`。
3. 目标父节点不存在 → `404 NOT_FOUND`。
4. 目标父节点下重名 → `409 CATEGORY_NAME_TAKEN`。

判断“是否是子孙”可以用递归 CTE：

```sql
WITH RECURSIVE descendants(id) AS (
  SELECT id FROM categories WHERE parent_id = ?
  UNION ALL
  SELECT c.id
    FROM categories c
    JOIN descendants d ON c.parent_id = d.id
)
SELECT 1 FROM descendants WHERE id = ?;
```

#### DELETE `/api/v1/categories/:id`

默认行为：

- 分类为空（没有子分类且没有文献）→ `204 No Content`。
- 分类非空 → `409 CATEGORY_NOT_EMPTY`，返回子分类数和文献数，要求显式确认。

```json
{
  "error": {
    "code": "CATEGORY_NOT_EMPTY",
    "message": "分类非空，请先移动内容或使用 force=true",
    "details": { "childCount": 2, "paperCount": 18 }
  }
}
```

带 `?force=true`：

- 删除整棵子树。
- 子树内所有文献的 `category_id` 置为 `NULL`（未分类）。
- 文献和 PDF 文件保留。
- 返回 `204`。

### 5.3 文献接口

#### GET `/api/v1/papers`

查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `categoryId` | integer | — | 按分类筛选 |
| `includeDescendants` | boolean | `true` | 是否包含子分类 |
| `uncategorized` | boolean | `false` | 只查未分类文献；与 `categoryId` 二选一 |
| `q` | string | — | 搜索标题、作者、期刊/会议、摘要 |
| `yearFrom` | integer | — | 起始年份（含） |
| `yearTo` | integer | — | 结束年份（含） |
| `type` | string | — | 文献类型 |
| `hasPdf` | boolean | — | 是否有 PDF |
| `sort` | string | `createdAt` | `createdAt` / `updatedAt` / `year` / `title` |
| `order` | string | `desc` | `asc` / `desc` |
| `page` | integer | `1` | 页码 |
| `pageSize` | integer | `20` | 每页数量，最大 100 |

示例：

```
GET /api/v1/papers?categoryId=2&includeDescendants=true&q=transformer&yearFrom=2017&hasPdf=true&sort=year&order=desc&page=1&pageSize=20
```

响应：

```json
{
  "data": [
    {
      "id": 12,
      "title": "Attention Is All You Need",
      "authors": ["Vaswani, Ashish", "Shazeer, Noam"],
      "firstAuthor": "Vaswani, Ashish",
      "year": 2017,
      "publication": "NeurIPS",
      "doi": "10.5555/3295222.3295349",
      "type": "inproceedings",
      "categoryId": 2,
      "hasPdf": true,
      "fileCount": 1,
      "citationKey": "vaswani2017attention",
      "createdAt": "2026-10-25T02:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

搜索实现（MVP）：

```sql
WHERE (
  p.title LIKE @q ESCAPE '\'
  OR p.authors_json LIKE @q ESCAPE '\'
  OR p.publication LIKE @q ESCAPE '\'
  OR p.doi LIKE @q ESCAPE '\'
  OR p.abstract LIKE @q ESCAPE '\'
)
```

`q` 中的 `%`、`_`、`\` 要转义。`sort` 和 `order` 必须在服务端白名单中映射到固定 SQL 片段，不能直接拼接用户输入。文献量超过约 1 万条后，再引入 FTS5 虚拟表；MVP 不必提前复杂化。

#### GET `/api/v1/papers/:id`

返回完整元数据、分类路径和文件列表：

```json
{
  "data": {
    "id": 12,
    "categoryId": 2,
    "type": "inproceedings",
    "title": "Attention Is All You Need",
    "authors": ["Vaswani, Ashish", "Shazeer, Noam"],
    "keywords": ["transformer", "attention"],
    "year": 2017,
    "publication": "NeurIPS",
    "volume": null,
    "issue": null,
    "pages": "5998-6008",
    "publisher": null,
    "doi": "10.5555/3295222.3295349",
    "url": null,
    "abstract": "The dominant sequence transduction models...",
    "language": "en",
    "citationKey": "vaswani2017attention",
    "notes": null,
    "sourceFormat": "ris",
    "categoryPath": [
      { "id": 1, "name": "人工智能" },
      { "id": 2, "name": "自然语言处理" }
    ],
    "files": [
      {
        "id": 5,
        "paperId": 12,
        "kind": "pdf",
        "originalName": "attention.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": 1234567,
        "sha256": "...",
        "isPrimary": true,
        "createdAt": "2026-10-25T02:30:00.000Z"
      }
    ],
    "createdAt": "2026-10-25T02:30:00.000Z",
    "updatedAt": "2026-10-25T02:30:00.000Z"
  }
}
```

注意：不返回 `storage_path` 的绝对路径；前端只用 `/files/:id/content` 访问文件。

#### POST `/api/v1/papers`

手工新建。`title` 必填，其余可选：

```json
{
  "categoryId": 2,
  "type": "article",
  "title": "Deep Learning",
  "authors": ["LeCun, Yann", "Bengio, Yoshua", "Hinton, Geoffrey"],
  "keywords": ["deep learning"],
  "year": 2015,
  "publication": "Nature",
  "volume": "521",
  "issue": "7553",
  "pages": "436-444",
  "publisher": "Springer Nature",
  "doi": "10.1038/nature14539",
  "url": "https://doi.org/10.1038/nature14539",
  "abstract": "...",
  "language": "en",
  "citationKey": null
}
```

服务端处理：

- 规范化 DOI。
- `citationKey` 为空时自动生成。
- `authors` 写入 `authors_json`，`keywords` 写入 `keywords_json`。
- 返回 `201` 和完整详情。

#### PATCH `/api/v1/papers/:id`

部分更新，字段与创建相同，全部可选。示例：

```json
{
  "title": "Deep Learning (review)",
  "categoryId": 3,
  "citationKey": "lecun2015deep"
}
```

注意：

- `authors`、`keywords` 传数组时整体替换，不合并。
- 修改 DOI 时重新做唯一性检查；冲突返回 `409 DUPLICATE_DOI`。
- 修改 `citationKey` 时检查唯一性；冲突返回 `409`。
- 不传 `updated_at`，由服务层在 UPDATE 时写入当前时间。

#### DELETE `/api/v1/papers/:id`

- 删除 `papers` 记录，`files` 级联删除。
- 事务提交后删除磁盘文件；单个文件删除失败只记日志，不阻塞接口。
- 返回 `204 No Content`。

#### GET `/api/v1/papers/:id/bibtex`

返回单条 BibTeX 文本：

```
Content-Type: application/x-bibtex; charset=utf-8
```

```bibtex
@inproceedings{vaswani2017attention,
  author    = {Vaswani, Ashish and Shazeer, Noam},
  title     = {{Attention Is All You Need}},
  booktitle = {NeurIPS},
  year      = {2017},
  pages     = {5998--6008},
  doi       = {10.5555/3295222.3295349}
}
```

#### 可选：批量移动

```
PATCH /api/v1/papers/bulk
{ "ids": [12, 13, 14], "categoryId": 3 }
```

MVP 前端也可以循环调用单条 PATCH；文献量大时再加这个接口。

### 5.4 文件接口

#### POST `/api/v1/papers/:id/files`

`multipart/form-data`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | file | 是 | PDF 或附件 |
| `kind` | string | 否 | `pdf`（默认）/ `supplement` / `other` |
| `isPrimary` | boolean | 否 | 是否设为主文件；该文献第一个文件默认设为主文件 |

服务端流程：

1. 校验文献存在。
2. 限制大小（建议 50 MB，可配置）。
3. PDF 校验文件头 `%PDF-`，不能只看扩展名。
4. 计算 SHA-256。
5. 用 `crypto.randomUUID()` 生成存储名：`papers/<paperId>/<uuid>.pdf`。
6. 写入磁盘，再插入 `files` 记录；设主文件时在事务中先清除旧主文件；数据库写入失败则删除刚写入的磁盘文件。
7. 返回 `201`。

```json
{
  "data": {
    "id": 5,
    "paperId": 12,
    "kind": "pdf",
    "originalName": "attention.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1234567,
    "sha256": "...",
    "isPrimary": true,
    "createdAt": "2026-10-25T02:30:00.000Z"
  }
}
```

#### GET `/api/v1/papers/:id/files`

返回该文献的文件数组，按 `is_primary DESC, created_at` 排序。

#### GET `/api/v1/files/:id/content`

流式返回文件内容，支持 `Content-Disposition`：

- `?disposition=inline`（默认）：浏览器内预览 PDF。
- `?disposition=attachment`：下载。

响应头示例：

```
Content-Type: application/pdf
Content-Disposition: inline; filename*=UTF-8''attention.pdf
Accept-Ranges: bytes
Cache-Control: private, max-age=3600
```

文件名要做 RFC 5987 编码，避免中文文件名乱码和头注入。

#### PATCH `/api/v1/files/:id`

```json
{ "isPrimary": true }
```

设为主文件时，在同一个事务中：

```sql
UPDATE files SET is_primary = 0 WHERE paper_id = ? AND id <> ?;
UPDATE files SET is_primary = 1 WHERE id = ?;
```

也支持 `{ "originalName": "new-name.pdf" }`，只改显示名，不改磁盘路径。

#### DELETE `/api/v1/files/:id`

删除记录并删除磁盘文件；返回 `204`。如果该文件是主文件，删除后不自动指定新的主文件（前端可提示用户选择）。

### 5.5 导入接口

#### POST `/api/v1/imports`

`multipart/form-data`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `files` | file[] | 是 | 一个或多个 `.ris` / `.ciw` 文件 |
| `categoryId` | integer | 否 | 导入到哪个分类；不传则未分类 |
| `format` | string | 否 | `auto`（默认）/ `ris` / `wos` |
| `duplicatePolicy` | string | 否 | `skip`（默认）/ `update` |
| `dryRun` | boolean | 否 | `true` 只解析预览，不写数据库 |

格式识别：

- 优先看扩展名：`.ris` → RIS，`.ciw` → WoS。
- 也做内容探测：包含 `TY  -` 判为 RIS；包含 `PT ` 且以 `ER` 结束判为 WoS。
- 显式 `format` 优先于自动识别。

`dryRun=true` 响应：

```json
{
  "data": {
    "dryRun": true,
    "files": [
      {
        "filename": "sample.ris",
        "format": "ris",
        "total": 2,
        "records": [
          {
            "type": "article",
            "title": "Deep Learning",
            "authors": ["LeCun, Yann"],
            "year": 2015,
            "publication": "Nature",
            "doi": "10.1038/nature14539",
            "duplicate": false
          }
        ],
        "errors": []
      }
    ]
  }
}
```

正式导入响应：

```json
{
  "data": {
    "dryRun": false,
    "files": [
      {
        "filename": "sample.ris",
        "format": "ris",
        "total": 2,
        "created": 1,
        "updated": 1,
        "skipped": 0,
        "failed": 0,
        "errors": []
      }
    ],
    "totals": {
      "total": 2,
      "created": 1,
      "updated": 1,
      "skipped": 0,
      "failed": 0
    },
    "papers": [
      { "id": 21, "title": "Deep Learning", "citationKey": "lecun2015deep" }
    ]
  }
}
```

导入规则：

- 逐条解析；单条记录缺标题等错误只记录到 `errors`，不中断整批。
- 解析全部完成后，在一个 SQLite 事务中写入；数据库异常整体回滚。
- `duplicatePolicy=skip`：DOI 已存在则跳过。
- `duplicatePolicy=update`：DOI 已存在则用导入记录中的非空字段更新，保留原分类和文件；如果请求带 `categoryId`，同时移动到该分类。
- 没有 DOI 的记录不做去重（MVP）；后续可加“标题 + 年份”模糊去重。
- 每条新记录生成 `citation_key`；冲突时加 `a` / `b` 后缀。
- 文件级错误（空文件、格式不支持）记入该文件的 `errors`；全部文件都失败时返回 `400` / `415`。

### 5.6 导出接口

#### GET `/api/v1/exports/bibtex`

查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `categoryId` | integer | — | 按分类导出 |
| `includeDescendants` | boolean | `true` | 是否包含子分类 |
| `paperIds` | string | — | 逗号分隔的文献 ID，优先级高于 `categoryId` |
| `includeAbstract` | boolean | `false` | 是否包含摘要 |

示例：

```
GET /api/v1/exports/bibtex?categoryId=2&includeDescendants=true
```

响应：

```
Content-Type: application/x-bibtex; charset=utf-8
Content-Disposition: attachment; filename="references-2026-10-25.bib"
```

```bibtex
@article{lecun2015deep,
  author    = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
  title     = {{Deep Learning}},
  journal   = {Nature},
  year      = {2015},
  volume    = {521},
  number    = {7553},
  pages     = {436--444},
  doi       = {10.1038/nature14539},
  url       = {https://doi.org/10.1038/nature14539}
}
```

选择规则：

- 有 `paperIds` → 只导出这些 ID。
- 否则有 `categoryId` → 导出该分类（可含子孙）的文献。
- 都没有 → 导出全部文献。
- 没有匹配记录 → `200` + 只有一行注释 `% No entries` 的空文件，前端不会拿到 404。

#### POST `/api/v1/exports/bibtex`

用于前端选中大量文献（ID 太多不适合放 URL）时：

```json
{
  "paperIds": [12, 13, 14],
  "categoryId": null,
  "includeDescendants": true,
  "includeAbstract": false
}
```

返回同样的 BibTeX 文件流。

### 5.7 系统接口

#### GET `/api/v1/health`

```json
{
  "data": {
    "status": "ok",
    "db": "ok",
    "version": "1.0.0",
    "uptimeSeconds": 123
  }
}
```

#### GET `/api/v1/stats`（可选）

```json
{
  "data": {
    "paperCount": 128,
    "categoryCount": 12,
    "fileCount": 96,
    "storageBytes": 734003200,
    "byYear": [
      { "year": 2024, "count": 18 },
      { "year": 2023, "count": 27 }
    ]
  }
}
```

---

## 6. RIS / WoS 解析设计

### 6.1 统一中间模型

解析器只负责“文本 → 规范化的 ParsedPaper”，不碰数据库、不碰文件系统，方便单元测试。

```ts
export type PaperType =
  | 'article'
  | 'book'
  | 'incollection'
  | 'inproceedings'
  | 'phdthesis'
  | 'mastersthesis'
  | 'techreport'
  | 'misc';

export interface ParsedPaper {
  sourceFormat: 'ris' | 'wos';
  type: PaperType;
  title: string;
  authors: string[];
  keywords: string[];
  year: number | null;
  publication: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  language: string | null;
  raw?: Record<string, string[]>; // 调试用，可选
}

export interface ParseIssue {
  recordIndex: number;
  field?: string;
  message: string;
}

export interface ParseResult {
  format: 'ris' | 'wos';
  records: ParsedPaper[];
  issues: ParseIssue[];
}
```

解析流水线：

```
读取文件 → 解码（UTF-8，必要时 GBK）→ 去 BOM → 统一换行
        → 按记录切分 → 解析标签/续行 → 字段映射
        → 规范化（DOI、年份、页码）→ 校验 → ParsedPaper[]
```

### 6.2 RIS 解析规则

典型记录：

```
TY  - JOUR
AU  - LeCun, Yann
AU  - Bengio, Yoshua
TI  - Deep Learning
PY  - 2015
JO  - Nature
VL  - 521
IS  - 7553
SP  - 436
EP  - 444
DO  - 10.1038/nature14539
ER  -
```

规则：

1. 按行扫描，识别 `^([A-Z0-9]{2})  - ?(.*)$`。
2. `TY` 开始一条记录，`ER` 结束一条记录；忽略记录外的空行和噪声。
3. 以空格开头的行是上一字段的续行，追加到上一字段值（用空格连接）。
4. 同一标签可重复出现：`AU`、`KW` 必须按出现顺序累积；其他字段取第一个非空值。
5. 支持 CRLF、LF、文件末尾无换行。
6. 解析失败的记录写入 `issues`，不影响其他记录。

字段映射：

| 统一字段 | RIS 标签 | 说明 |
|---|---|---|
| `title` | `TI` / `T1` | 优先 `TI` |
| `authors` | `AU` / `A1` | 全部保留，按顺序；`AU` 为空时用 `A1` |
| `year` | `PY` / `Y1` | 从值中提取第一个四位年份 |
| `publication` | `JO` / `JF` / `T2` / `JA` | 按此优先级取第一个非空 |
| `doi` | `DO` | 规范化 |
| `abstract` | `AB` / `N2` | 优先 `AB` |
| `volume` | `VL` | 原样字符串 |
| `issue` | `IS` | 原样字符串 |
| `pages` | `SP` + `EP` | `SP-EP`；只有 `SP` 时只用 `SP` |
| `publisher` | `PB` |  |
| `url` | `UR` |  |
| `language` | `LA` |  |
| `keywords` | `KW` | 全部保留 |

类型映射：

| RIS `TY` | 统一 `type` |
|---|---|
| `JOUR` | `article` |
| `BOOK` | `book` |
| `CHAP` | `incollection` |
| `CONF` / `CPAPER` | `inproceedings` |
| `THES` | `phdthesis` |
| `RPRT` | `techreport` |
| `GEN` / `ELEC` / `NEWS` / `MGZN` | `misc` |
| 其他/未知 | `misc` |

### 6.3 WoS（.ciw）解析规则

典型记录：

```
FN Clarivate Analytics Web of Science
VR 1.0
PT J
AU LeCun, Yann
AU Bengio, Yoshua
TI Deep Learning
SO Nature
PY 2015
VL 521
IS 7553
BP 436
EP 444
DI 10.1038/nature14539
ER

EF
```

规则：

1. 按行扫描，识别 `^([A-Z0-9]{2}) (.*)$`（标签两个字符，后跟一个空格）。
2. `PT` 开始一条记录，`ER` 结束一条记录；`EF` 表示文件结束。
3. 以三个空格开头的行是上一字段的续行，追加到上一字段值。
4. 文件头部的 `FN`、`VR` 等直接忽略。
5. 同一标签可重复：`AU`、`DE`、`ID` 按顺序累积。
6. 支持 CRLF、LF、文件末尾无换行。

字段映射：

| 统一字段 | WoS 标签 | 说明 |
|---|---|---|
| `title` | `TI` |  |
| `authors` | `AU` / `AF` | 优先 `AU`；为空时用 `AF` |
| `year` | `PY` | 提取第一个四位年份；兼容 `2023/12/01` |
| `publication` | `SO` | 期刊/会议/来源标题 |
| `doi` | `DI` | 规范化 |
| `abstract` | `AB` |  |
| `volume` | `VL` |  |
| `issue` | `IS` |  |
| `pages` | `BP` + `EP` | `BP-EP`；只有 `BP` 时只用 `BP` |
| `publisher` | `PU` |  |
| `url` | `UR` |  |
| `language` | `LA` |  |
| `keywords` | `DE` + `ID` | 去重合并 |

类型映射：

| WoS `PT` | 统一 `type` |
|---|---|
| `J` | `article` |
| `B` | `book` |
| `C` | `inproceedings` |
| 其他/未知 | `misc` |

### 6.4 规范化细节

**DOI：**

```ts
function normalizeDoi(input: string | null): string | null {
  if (!input) return null;
  const doi = input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .toLowerCase();
  return doi || null;
}
```

**年份：**

```ts
const match = value.match(/(?:19|20)\d{2}/);
const year = match ? Number(match[0]) : null;
```

**页码：**

- `SP`/`BP` 和 `EP` 都有：`${start}-${end}`。
- 只有起始页：只用起始页。
- 已是 `436-444` 形式：原样保留，导出时统一把数字间的 `-` 换成 `--`。

**作者：**

- 保留原始字符串，如 `LeCun, Yann` 或 `Yann LeCun`。
- 不强行拆分姓/名；BibTeX 对 `Family, Given` 形式兼容最好。
- 空作者允许，但导出 BibTeX 时省略 `author` 字段。

**关键词：**

- RIS `KW` 每条一个关键词。
- WoS `DE`（作者关键词）和 `ID`（Keywords Plus）合并去重，保留原顺序。

### 6.5 编码与容错

- 默认按 UTF-8 读取，去掉 BOM。
- 如果检测到大量替换字符（`�`），可用 `iconv-lite` 尝试 GBK/GB18030 重新解码；记录一条 warning。
- 单条记录没有标题：跳过，写入 `issues`。
- 单条记录字段缺失：允许，`null` / 空数组。
- 文件为空、扩展名不支持、内容无法识别：返回 `400` / `415`，不写数据库。
- 导入时先生成预览（`dryRun`），让用户确认解析结果和重复情况，再正式写入。

---

## 7. BibTeX 导出设计

### 7.1 类型映射

| 数据库 `type` | BibTeX 条目 |
|---|---|
| `article` | `@article` |
| `book` | `@book` |
| `incollection` | `@incollection` |
| `inproceedings` | `@inproceedings` |
| `phdthesis` | `@phdthesis` |
| `mastersthesis` | `@mastersthesis` |
| `techreport` | `@techreport` |
| `misc` | `@misc` |

字段映射：

- `publication`：
  - `article` → `journal`
  - `inproceedings` / `incollection` → `booktitle`
  - `book` → `publisher`（`publication` 可作为系列名，非必填）
  - `phdthesis` / `mastersthesis` → `school`（由 `publisher` 映射）
  - `techreport` → `institution`（由 `publisher` 映射）
- `issue` → `number`
- `pages`：数字间的 `-` 转为 `--`
- `doi`、`url`、`keywords`、`abstract` 按需输出。

### 7.2 Citation key 生成

规则：

```
<第一作者姓氏 slug><四位年份><标题第一个实词 slug>
```

示例：

- `Vaswani, Ashish` + `2017` + `Attention Is All You Need` → `vaswani2017attention`
- `LeCun, Yann` + `2015` + `Deep Learning` → `lecun2015deep`

实现要点：

```ts
function slug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // 去掉变音符号
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
```

- 姓氏：取第一个作者逗号前的部分；没有逗号则取最后一个单词。
- 姓氏为空（例如纯中文名）→ `anon`。
- 年份为空 → `nd`。
- 标题第一个词：跳过 `a`、`an`、`the`、`on`、`of`、`for`、`and` 等停用词；为空 → `paper`。
- 总长度建议不超过 48 个字符。
- 冲突时追加 `a`、`b`、`c`……并再次检查数据库唯一索引。
- 生成后写入 `papers.citation_key`；后续导出不再变化。
- 允许用户通过 `PATCH /papers/:id` 手动修改 key；修改时检查唯一性。

### 7.3 LaTeX 转义

BibTeX 字段中的特殊字符必须转义：

| 字符 | 转义 |
|---|---|
| `\` | `\textbackslash{}` |
| `&` | `\&` |
| `%` | `\%` |
| `$` | `\$` |
| `#` | `\#` |
| `_` | `\_` |
| `{` | `\{` |
| `}` | `\}` |
| `~` | `\textasciitilde{}` |
| `^` | `\textasciicircum{}` |

注意：

- 不要对已经是 LaTeX 转义的字符串重复转义；MVP 假设数据库存纯文本。
- 标题用双花括号保护大小写：`title = {{Deep Learning}}`。
- 保留 Unicode（中文、重音字符）；建议用 XeLaTeX 或 LuaLaTeX 编译。若必须用 pdfLaTeX，再增加 Unicode → LaTeX 命令的转换层。
- 输出文件使用 UTF-8，不带 BOM。

### 7.4 输出示例

```bibtex
@article{lecun2015deep,
  author    = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
  title     = {{Deep Learning}},
  journal   = {Nature},
  year      = {2015},
  volume    = {521},
  number    = {7553},
  pages     = {436--444},
  doi       = {10.1038/nature14539},
  url       = {https://doi.org/10.1038/nature14539}
}

@inproceedings{vaswani2017attention,
  author    = {Vaswani, Ashish and Shazeer, Noam},
  title     = {{Attention Is All You Need}},
  booktitle = {NeurIPS},
  year      = {2017},
  pages     = {5998--6008},
  doi       = {10.5555/3295222.3295349}
}
```

---

## 8. 项目目录结构建议

```
reference-manager/
├─ src/                              # Express 后端
│  ├─ server.ts                      # 启动 HTTP server
│  ├─ app.ts                         # 组装 middleware / routes
│  ├─ config.ts                      # 环境变量与默认值
│  ├─ db/
│  │  ├─ index.ts                    # better-sqlite3 单例、PRAGMA
│  │  ├─ migrate.ts                  # 按 user_version 执行迁移
│  │  └─ migrations/
│  │     └─ 001_init.sql             # 本设计中的 schema
│  ├─ api/
│  │  ├─ categories.routes.ts
│  │  ├─ papers.routes.ts
│  │  ├─ files.routes.ts
│  │  ├─ imports.routes.ts
│  │  ├─ exports.routes.ts
│  │  └─ health.routes.ts
│  ├─ services/
│  │  ├─ category.service.ts         # 树、循环校验、删除策略
│  │  ├─ paper.service.ts            # CRUD、筛选、分页
│  │  ├─ file.service.ts             # 存储、主文件、删除
│  │  ├─ import.service.ts           # 解析 + 事务 + 去重
│  │  └─ bibtex.service.ts           # 查询 + 生成 BibTeX
│  ├─ parsers/
│  │  ├─ types.ts                    # ParsedPaper / ParseResult
│  │  ├─ ris.parser.ts
│  │  ├─ wos.parser.ts
│  │  └─ index.ts                    # 格式探测与统一入口
│  ├─ middleware/
│  │  ├─ error-handler.ts
│  │  ├─ validate.ts                 # zod 校验
│  │  └─ upload.ts                   # multer 配置与限制
│  ├─ utils/
│  │  ├─ doi.ts
│  │  ├─ citation-key.ts
│  │  ├─ latex.ts
│  │  └─ paths.ts                    # storage 路径安全拼接
│  └─ types/
│     ├─ api.ts                      # DTO
│     └─ reference.ts                # 内部模型
├─ client/                           # React + Vite 前端
│  ├─ src/
│  │  ├─ api/
│  │  │  ├─ client.ts                # fetch 封装、错误处理
│  │  │  ├─ categories.ts
│  │  │  ├─ papers.ts
│  │  │  ├─ files.ts
│  │  │  └─ exports.ts
│  │  ├─ components/
│  │  │  ├─ CategoryTree.tsx
│  │  │  ├─ PaperTable.tsx
│  │  │  ├─ PaperDetailDrawer.tsx
│  │  │  ├─ ImportDialog.tsx
│  │  │  └─ PdfPreview.tsx
│  │  ├─ features/
│  │  │  ├─ categories/
│  │  │  ├─ papers/
│  │  │  ├─ imports/
│  │  │  └─ files/
│  │  ├─ pages/
│  │  │  ├─ LibraryPage.tsx
│  │  │  └─ PaperDetailPage.tsx
│  │  ├─ hooks/
│  │  ├─ styles/
│  │  ├─ App.tsx
│  │  └─ main.tsx
│  ├─ index.html
│  └─ vite.config.ts
├─ tests/
│  ├─ fixtures/
│  │  ├─ sample.ris
│  │  └─ sample.ciw
│  ├─ ris.parser.test.ts
│  ├─ wos.parser.test.ts
│  ├─ bibtex.test.ts
│  └─ api.test.ts
├─ docs/
│  ├─ architecture.md
│  └─ schema.sql
├─ data/                             # SQLite 数据库（gitignore）
├─ storage/                          # PDF 文件（gitignore）
├─ package.json
├─ tsconfig.json
├─ .env.example
└─ README.md
```

分层职责：

- **routes**：只做 HTTP 参数解析、调用 service、设置状态码。
- **services**：业务规则、事务、权限（如果有）、文件清理。
- **parsers**：纯函数，输入字符串，输出 `ParsedPaper[]`；不读数据库。
- **db**：只暴露连接和迁移，不写业务 SQL。
- **client/features**：按业务域组织，避免 `components/` 变成大杂烩。

如果不想引入 `services/` 层，MVP 也可以让 routes 直接调用 repository；但导入、删除分类、主文件切换都有事务逻辑，建议保留 service 层。

---

## 9. 技术栈与依赖建议

### 9.1 后端

| 类别 | 选择 | 理由 |
|---|---|---|
| 运行时 | Node.js 20 LTS | 稳定，`better-sqlite3` 兼容好 |
| 语言 | TypeScript 5 | 与前端共享类型思维 |
| Web | Express 4 | 生态成熟，需求简单 |
| SQLite | `better-sqlite3` | 同步 API、事务简单、性能好 |
| 校验 | `zod` | 请求体/查询参数校验，类型推导 |
| 上传 | `multer` | 与 Express 集成简单 |
| 日志 | `pino` + `pino-http` | 结构化日志，性能好 |
| 安全 | `helmet`、`cors` | 基础头与跨域控制 |
| 环境变量 | `dotenv` | 本地开发简单 |
| 测试 | `vitest` + `supertest` | 解析器和 API 测试 |

不引入 ORM 的理由：表少、SQL 简单、递归 CTE 和部分索引用 ORM 反而绕。所有 SQL 用 prepared statement，避免注入。如果团队更看重类型安全，可以用 Drizzle ORM，但本设计的 SQL 仍是权威 schema。

### 9.2 前端

| 类别 | 选择 | 理由 |
|---|---|---|
| 构建 | Vite | 启动快，配置少 |
| 框架 | React 18 + TypeScript | 需求指定 |
| 路由 | React Router 6 | 列表页/详情页 |
| 服务端状态 | TanStack Query 5 | 缓存、失效、分页 |
| UI | Ant Design 5 | Tree / Table / Upload / Form / Modal 开箱即用，最适合管理型界面 |
| 日期 | dayjs | Ant Design 默认依赖，体积小 |
| 拖拽 | Ant Design Tree 自带 `draggable` | 分类移动；复杂需求再上 `dnd-kit` |
| PDF 预览 | `<iframe src="/api/v1/files/:id/content">` | MVP 零依赖，浏览器自带 PDF 阅读器；后续可换 `react-pdf` |

如果希望更轻的 UI，可用 Tailwind CSS + shadcn/ui 替代 Ant Design；但分类树、表格、上传、表单需要自己组合更多组件。以“简洁实用、便于实现”为目标，推荐 Ant Design。

### 9.3 环境变量

```ini
PORT=3000
NODE_ENV=development
DATABASE_PATH=./data/lit.db
STORAGE_DIR=./storage
MAX_UPLOAD_MB=50
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
```

开发时在 `client/vite.config.ts` 配置 `/api` 代理到 `http://localhost:3000`，避免本地 CORS：

```ts
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

`.gitignore` 至少包含：

```gitignore
node_modules/
dist/
client/dist/
data/
storage/
.env
*.db
*.db-wal
*.db-shm
```

---

## 10. 实现顺序（建议）

1. **基础设施**：`config.ts`、`db/index.ts`、迁移执行器、统一错误处理、`/health`。
2. **分类**：建表 + 树查询 + 新建/重命名/移动/删除 + 循环校验。
3. **文献 CRUD**：列表筛选、分页、详情、手工新建/编辑/删除。
4. **解析器**：先写 `sample.ris` / `sample.ciw` fixture 和单元测试，再接入导入接口。
5. **导入事务**：格式探测、dryRun、DOI 去重、`skip/update` 策略。
6. **文件**：上传、PDF 头校验、主文件切换、下载/预览、删除清理。
7. **BibTeX**：类型映射、key 生成、LaTeX 转义、单条/批量导出。
8. **前端**：布局 → 分类树 → 文献表格 → 详情抽屉 → 导入弹窗 → 导出按钮。
9. **加固**：外键、WAL、备份、限流、错误日志、端到端测试。

建议先打通“导入 RIS → 列表 → 上传 PDF → 导出 BibTeX”这一条主链路，再补分类拖拽、批量操作、统计等体验功能。

---

## 11. 边界情况与安全要点

### 11.1 分类

- 不允许把分类移动到自身或子孙节点下；服务层用递归 CTE 检查。
- 同级重名返回 `409`；不同父节点下可以同名。
- 删除非空分类默认拒绝；`force=true` 才级联删除子树，并把文献置为未分类。
- 分类排序用整数 `sort_order`，同级按 `sort_order, name` 排序；拖拽后批量更新排序值。

### 11.2 文献与导入

- 标题为空、全是空白的记录跳过。
- DOI 统一小写并去掉 URL 前缀；唯一索引兜底。
- 导入使用事务；解析错误逐条记录，不因一条坏记录回滚整批。
- `update` 策略只覆盖导入记录中的非空字段，避免把已有摘要/URL 清空。
- 没有 DOI 的记录不去重；如果后续需要，可加“标题 + 年份”归一化后的唯一索引或人工合并。

### 11.3 文件

- 只接受 PDF 作为主文件；校验文件头 `%PDF-`，不只信扩展名。
- 上传大小限制（默认 50 MB），同时限制单次导入文件数。
- 存储路径由服务端生成 UUID，不使用用户文件名拼接路径，杜绝路径穿越。
- 下载时设置 `Content-Disposition` 并对文件名做 RFC 5987 编码，防止头注入。
- 删除文献时先删数据库记录，再删磁盘文件；删除失败只记日志，避免接口失败。
- `storage/` 放在 Web 根目录之外，不能通过静态文件服务器直接访问。

### 11.4 数据库

- 启动时执行 `PRAGMA foreign_keys = ON`、`journal_mode = WAL`、`busy_timeout = 5000`。
- 单进程写；如果未来多进程，写操作要加锁或改用 PostgreSQL。
- 定期备份 `data/lit.db` 和 `storage/`；WAL 模式下备份前最好执行 `PRAGMA wal_checkpoint(TRUNCATE)` 或使用 SQLite Backup API。
- 迁移用 `PRAGMA user_version` 记录版本，启动时按顺序执行未应用的 SQL 文件。

### 11.5 接口与部署

- CORS 只允许前端开发地址/生产域名。
- 如果只监听 `127.0.0.1`，可以不做认证；如果暴露到局域网/公网，必须加认证和 HTTPS。
- 请求体限制、上传限制、错误信息不要泄露绝对路径和 SQL。
- 生产环境用 `helmet`、反向代理（Nginx/Caddy）和进程守护（systemd/pm2）。

---

## 12. MVP 验收清单

- [ ] 可以创建任意层级的分类，移动分类不会形成环。
- [ ] 删除非空分类需要确认；确认后子分类删除、文献变为未分类。
- [ ] 能导入 `.ris` 和 `.ciw`，字段映射正确，错误记录有提示。
- [ ] 同一 DOI 重复导入时，`skip` 和 `update` 行为符合预期。
- [ ] 文献列表支持按分类（含子分类）筛选、关键词搜索、分页。
- [ ] 可以上传 PDF、预览、下载、设为主文件、删除。
- [ ] 导出 BibTeX 可以被 LaTeX/BibTeX 正常读取。
- [ ] 重启服务后数据、文件关联、分类树都还在。
- [ ] 删除文献后数据库记录和磁盘文件都被清理。

---

## 13. 与当前脚手架的对齐建议

当前 `reference-manager` 已有一版实现（`src/database/schema.sql`、`src/database/database.ts`、`src/api/routes/*`、`src/parsers/*`）。它采用 `references` / `folders` 命名，而本设计采用 `papers` / `categories`。概念映射如下：

| 当前实现 | 本设计 | 建议 |
|---|---|---|
| `"references"` 表 | `papers` 表 | 二选一；`REFERENCES` 是 SQLite 保留字，若保留表名，所有 SQL 必须统一加双引号 |
| `folders` 表 | `categories` 表 | 概念等价；数据库层建议统一，前端文案仍可叫“文件夹” |
| `pdf_path` 字段 | `files` 表 | 现有 schema 已有 `files` 表，但 repository 还在写 `pdf_path`；应迁移到 `files` |
| `bibtex_key` | `citation_key` | 语义相同，统一命名 |
| `imported_from` | `source_format` | 统一为 `ris` / `wos` / `manual` |
| `journal` / `booktitle` | `publication` | 本设计做了简化；若追求 BibTeX 字段完整度，保留现有分字段也合理 |

**当前实现中建议优先处理的点（按影响排序）：**

1. **`references` 命名**：`schema.sql` 和 `database.ts` 已经统一加双引号，当前可以运行。不过 `REFERENCES` 是保留字，任何新 SQL 漏加引号都会报 `near "references": syntax error`；建议全量改名为 `papers`，或把“所有 SQL 必须加引号”写进规范和测试。
2. **`pdf_path` 仍是单文件模型**：schema 已有 `files` 表，但 repository 和 `/api/attach-pdf` 仍写 `references.pdf_path`，没有用到 `files`。应改为写 `files`，并增加 `GET /files/:id/content` 下载/预览接口。
3. **WoS 解析器截断多词字段**：`line.split(/\s+/, 2)` 只保留第二个 token，`TI Deep Learning` 会变成 `Deep`；`content.split(/\nER\n/)` 也不兼容 CRLF。建议改为行正则 `^([A-Z0-9]{2})\s+(.*)$`，并按 tag 判断 `ER` 结束。
4. **`masterthesis` 拼写**：BibTeX 标准是 `mastersthesis`。数据库 `CHECK`、TypeScript 联合类型、API 输出应统一，避免只在导出层做映射。
5. **导入事务与去重**：当前逐条插入，失败会留下半批数据，也没有 DOI 去重。建议“先解析、后事务写入”，用 DOI 唯一索引 + `skip` / `update` 策略。
6. **多连接问题**：每个路由文件各自 `new ReferenceDatabase()`，会创建多个 SQLite 连接并重复执行 schema。改为单例或依赖注入，启动时统一执行迁移和 `PRAGMA`。
7. **触发器与 `recursive_triggers`**：当前 schema 用触发器维护 `updated_at`；在 `recursive_triggers = ON` 时删除文件夹会报 `too many levels of trigger recursion`。保持默认 OFF，或改为服务层统一写入 `updated_at`（本设计采用后者）。
8. **API 命名二选一**：现有 `/api/references`、`/api/folders` 与本设计 `/api/v1/papers`、`/api/v1/categories` 不要混用。若保留现有路径，DB 层可以用 `papers/categories` 做映射；若整体迁移，按第 5 节的接口表实现。

如果时间有限，优先做 2–4：它们直接决定服务能否正常启动、PDF 是否可用、WoS 是否能正确导入。
