# 项目文件索引

**生成时间**: 2026-10-25 11:25
**项目路径**: F:\dsh_somedata\reference-manager

---

## 📊 文件统计

| 类型 | 数量 | 说明 |
|------|------|------|
| TypeScript | 428 | .ts/.tsx源码文件 |
| CSS | 2 | 样式文件 |
| JSON | 150 | 配置文件 |
| Markdown | 139 | 文档文件 |
| SQL | 2 | 数据库脚本 |

---

## 🗂️ 目录结构

\\\
reference-manager/
├── 📄 配置文件
│   ├── package.json           后端包配置
│   ├── tsconfig.json          TypeScript配置
│   ├── .env.example           环境变量模板
│   └── .gitignore             Git忽略规则
│
├── 📜 脚本文件
│   ├── install-all.ps1        一键安装
│   ├── quick-start.ps1        快速启动
│   └── dev-start.ps1          开发模式
│
├── 📚 文档文件
│   ├── README.md              项目介绍
│   ├── DEPLOYMENT.md          部署指南
│   ├── PROJECT_STATUS.md      项目状态
│   ├── QUICK_REFERENCE.md     快速参考
│   ├── MAINTENANCE.md         维护清单
│   └── HANDOVER.md            会话交接（即将生成）
│
├── 🏗️ src/ - 后端源码
│   ├── server.ts              服务器入口
│   ├── database/
│   │   ├── database.ts        数据库核心 (72KB, 1500+行)
│   │   └── schema.sql         DDL定义
│   ├── parsers/
│   │   ├── types.ts           类型定义
│   │   ├── ris-parser.ts      RIS解析器 (15KB)
│   │   └── wos-parser.ts      WoS解析器 (13KB)
│   ├── utils/
│   │   └── bibtex-exporter.ts BibTeX导出 (32KB)
│   ├── api/
│   │   └── v1/
│   │       ├── categories.ts  分类接口
│   │       ├── papers.ts      文献接口
│   │       ├── files.ts       文件接口
│   │       ├── imports.ts     导入接口
│   │       └── exports.ts     导出接口
│   ├── middleware/
│   │   └── upload.ts          文件上传
│   └── types/
│       └── reference.ts       类型定义
│
├── 🎨 client/ - 前端源码
│   ├── package.json           前端包配置
│   ├── vite.config.ts         Vite配置
│   ├── tsconfig.json          TypeScript配置
│   ├── index.html             HTML入口
│   └── src/
│       ├── main.tsx           React入口
│       ├── App.tsx            主应用 (16KB)
│       ├── components/
│       │   ├── Sidebar.tsx           分类树 (18KB)
│       │   ├── ReferenceList.tsx     文献列表 (18KB)
│       │   ├── ReferenceDetail.tsx   详情面板 (11KB)
│       │   ├── ImportDialog.tsx      导入对话框 (12KB)
│       │   └── ConfirmDialog.tsx     确认对话框
│       ├── services/
│       │   └── api.ts         API客户端 (27KB)
│       ├── styles/
│       │   └── globals.css    全局样式 (66KB)
│       ├── data/
│       │   └── demoStore.ts   Demo数据
│       ├── types.ts           类型定义
│       └── utils/
│           └── format.ts      格式化工具
│
├── 📖 docs/ - 文档目录
│   ├── architecture.md        架构设计 (85KB)
│   └── schema.sql             数据库Schema
│
├── 🧪 tests/ - 测试相关
│   ├── test-parsers.js        解析器测试
│   └── integration-test.js    集成测试
│
├── 📦 dist/ - 构建产物
│   └── (构建后生成)
│
├── 🗄️ data/ - 数据目录
│   └── references.db          SQLite数据库
│
└── 📁 storage/ - 文件存储
    └── pdfs/                  PDF文件
\\\

---

## 🔑 关键文件详解

### 后端核心

| 文件 | 大小 | 行数 | 说明 |
|------|------|------|------|
| src/database/database.ts | 72KB | ~1500 | 数据库所有操作 |
| src/utils/bibtex-exporter.ts | 32KB | ~600 | BibTeX导出逻辑 |
| src/parsers/ris-parser.ts | 15KB | ~300 | RIS格式解析 |
| src/parsers/wos-parser.ts | 13KB | ~250 | WoS格式解析 |
| src/server.ts | 5KB | ~100 | Express服务器 |

### 前端核心

| 文件 | 大小 | 行数 | 说明 |
|------|------|------|------|
| client/src/services/api.ts | 27KB | ~500 | API客户端 |
| client/src/components/Sidebar.tsx | 18KB | ~400 | 分类树组件 |
| client/src/components/ReferenceList.tsx | 18KB | ~400 | 文献列表 |
| client/src/App.tsx | 16KB | ~350 | 主应用逻辑 |
| client/src/styles/globals.css | 66KB | ~1500 | 全局样式 |

### 文档

| 文件 | 大小 | 说明 |
|------|------|------|
| docs/architecture.md | 85KB | 完整架构设计文档 |
| README.md | ~15KB | 项目介绍和使用说明 |
| DEPLOYMENT.md | ~12KB | 部署指南 |
| PROJECT_STATUS.md | ~8KB | 项目状态报告 |

---

## 🛠️ 修改指南

### 添加新API端点

1. **创建路由**: \src/api/v1/new-endpoint.ts\
2. **挂载路由**: 在 \src/server.ts\ 中添加
3. **更新类型**: 在 \src/types/\ 添加接口定义
4. **前端调用**: 在 \client/src/services/api.ts\ 添加方法

### 修改数据库Schema

1. **编辑Schema**: \src/database/schema.sql\
2. **更新类型**: \src/types/reference.ts\
3. **修改CRUD**: \src/database/database.ts\
4. **迁移数据**: 写迁移脚本或重建数据库

### 添加新解析器

1. **创建解析器**: \src/parsers/xxx-parser.ts\
2. **实现接口**: 返回 \CitationRecord[]\
3. **集成导入**: 在 \src/api/v1/imports.ts\ 添加格式支持
4. **添加测试**: 在 \	ests/\ 添加测试用例

### 修改前端UI

1. **组件位置**: \client/src/components/\
2. **样式文件**: \client/src/styles/globals.css\
3. **API调用**: 通过 \client/src/services/api.ts\
4. **类型定义**: \client/src/types.ts\

---

## 📦 依赖管理

### 后端主要依赖

\\\json
{
  "express": "^4.21.1",
  "better-sqlite3": "^11.8.1",
  "multer": "^1.4.5-lts.1",
  "cors": "^2.8.5"
}
\\\

### 前端主要依赖

\\\json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "axios": "^1.7.9",
  "lucide-react": "^0.468.0",
  "vite": "^5.4.11"
}
\\\

---

## 🔍 快速定位

**修改导入逻辑**: \src/api/v1/imports.ts\ + \src/parsers/\  
**修改导出格式**: \src/utils/bibtex-exporter.ts\  
**修改UI样式**: \client/src/styles/globals.css\  
**修改API端点**: \src/api/v1/*.ts\  
**修改数据库**: \src/database/database.ts\ + \schema.sql\  

---

**最后更新**: 2026-10-25 11:25
