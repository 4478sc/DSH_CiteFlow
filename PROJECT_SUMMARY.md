# 文献管理系统 - 项目总结

## 📦 已完成的功能

### 核心功能 ✅
- [x] 多级文件夹管理系统
- [x] RIS格式文件导入 (.ris)
- [x] Web of Science格式导入 (.ciw)
- [x] BibTeX格式导出
- [x] PDF文件关联
- [x] 全文搜索功能
- [x] 批量选择和导出

### 技术实现 ✅
- [x] 后端Express服务器
- [x] SQLite数据库 (better-sqlite3)
- [x] React前端应用
- [x] TypeScript类型系统
- [x] 文件上传处理 (multer)
- [x] RESTful API设计

### 解析器 ✅
- [x] RIS格式解析器 (IEEE Xplore等)
- [x] WoS格式解析器 (Web of Science)
- [x] BibTeX生成器
- [x] 自动生成BibTeX Key

### 用户界面 ✅
- [x] 现代深色主题设计
- [x] 三栏布局：文件夹 | 列表 | 详情
- [x] 响应式操作
- [x] 搜索高亮
- [x] 批量操作支持
- [x] 文件拖放导入

## 📁 项目结构

```
reference-manager/
├── src/                           # 后端源码
│   ├── api/routes/               # API路由
│   │   ├── folders.ts           # 文件夹管理
│   │   ├── references.ts        # 文献CRUD
│   │   ├── import.ts            # 导入功能
│   │   └── export.ts            # 导出功能
│   ├── database/                # 数据库层
│   │   ├── schema.sql           # 数据库结构
│   │   └── database.ts          # 数据库操作
│   ├── parsers/                 # 格式解析器
│   │   ├── ris-parser.ts        # RIS格式
│   │   └── wos-parser.ts        # WoS格式
│   ├── utils/                   # 工具函数
│   │   └── bibtex-exporter.ts   # BibTeX导出
│   ├── types/                   # 类型定义
│   │   └── reference.ts         # 文献类型
│   └── server.ts                # 主服务器
│
├── client/                       # 前端应用
│   ├── src/
│   │   ├── services/
│   │   │   └── api.ts           # API客户端
│   │   ├── styles/
│   │   │   └── globals.css      # 全局样式
│   │   ├── App.tsx              # 主组件
│   │   ├── App.css              # 应用样式
│   │   └── main.tsx             # 入口文件
│   ├── index.html               # HTML模板
│   ├── vite.config.ts           # Vite配置
│   └── package.json             # 前端依赖
│
├── data/                         # 数据存储 (自动创建)
├── pdfs/                         # PDF文件 (自动创建)
├── uploads/                      # 临时上传 (自动创建)
│
├── install.ps1                   # 安装脚本
├── start.ps1                     # 启动脚本
├── start-dev.ps1                 # 开发模式启动
├── test-parsers.js               # 解析器测试
├── package.json                  # 后端依赖
├── tsconfig.json                 # TS配置
└── README.md                     # 使用文档
```

## 🚀 使用步骤

### 1. 安装
```powershell
cd reference-manager
.\install.ps1
```

### 2. 启动
```powershell
.\start.ps1
```

访问: http://localhost:3000

### 3. 导入文献
- 点击"导入"按钮
- 选择RIS或WoS格式
- 选择您的文件

### 4. 组织文献
- 左侧创建文件夹
- 导入时选择目标文件夹
- 点击文件夹查看分类

### 5. 导出BibTeX
- 勾选要导出的文献
- 点击"导出BibTeX"
- 文件自动下载

## 🎨 设计亮点

### 颜色方案
- 背景：深海军蓝 (#0F172A, #1E293B)
- 主文本：亮白 (#F8FAFC)
- 强调色：天蓝 (#38BDF8) - 主要操作
- 行动色：橙色 (#F97316) - CTA按钮
- 边框：板岩灰 (#334155, #475569)

### 布局特点
- 固定高度工具栏
- 可折叠侧边栏
- 无限滚动列表
- 固定详情面板
- 响应式网格

### 交互细节
- Hover状态提升
- 选中状态高亮
- 平滑过渡动画
- 键盘快捷键支持
- 拖放文件上传

## 📊 支持的文献类型

- article (期刊论文)
- inproceedings (会议论文)
- book (书籍)
- incollection (书籍章节)
- phdthesis (博士论文)
- mastersthesis (硕士论文)
- techreport (技术报告)
- misc (其他)

## 🔧 技术栈

### 后端
- **运行时**: Node.js 18+
- **框架**: Express 4.18
- **数据库**: better-sqlite3 9.2
- **文件上传**: multer 1.4
- **语言**: TypeScript 5.3

### 前端
- **框架**: React 18.2
- **构建工具**: Vite 5.0
- **HTTP客户端**: Axios 1.6
- **语言**: TypeScript 5.3
- **样式**: 纯CSS (无框架)

### 开发工具
- TypeScript编译器
- Vite HMR
- Node watch模式

## 📋 API端点

### 文献管理
- `GET /api/references` - 获取文献列表
- `GET /api/references/:id` - 获取单个文献
- `PUT /api/references/:id` - 更新文献
- `DELETE /api/references/:id` - 删除文献

### 文件夹管理
- `GET /api/folders` - 获取文件夹树
- `POST /api/folders` - 创建文件夹
- `DELETE /api/folders/:id` - 删除文件夹

### 导入导出
- `POST /api/import/ris` - 导入RIS格式
- `POST /api/import/wos` - 导入WoS格式
- `POST /api/export/bibtex` - 导出BibTeX
- `POST /api/attach-pdf` - 关联PDF

### 系统
- `GET /api/health` - 健康检查

## 🔍 示例：BibTeX输出

```bibtex
@article{Sharma2020,
  title={Breaking the Performance Tradeoffs in N-Path Mixer-First Receivers Using a Second-Order Baseband Noise-Canceling TIA},
  author={Sharma, Prateek Kumar and Nallam, Nagarjuna},
  journal={IEEE Journal of Solid-State Circuits},
  volume={55},
  number={11},
  pages={3009--3023},
  year={2020},
  doi={10.1109/JSSC.2020.3005776},
  publisher={IEEE}
}
```

## 🐛 已知限制

1. **单用户系统** - 没有用户认证
2. **本地存储** - 数据仅保存在本地
3. **有限的导入格式** - 仅支持RIS和WoS
4. **基础搜索** - 简单字符串匹配
5. **无自动备份** - 需手动备份data文件夹

## 🔮 未来可能的增强

- [ ] EndNote XML格式支持
- [ ] 高级搜索过滤器
- [ ] 标签系统
- [ ] 引用网络图
- [ ] 云同步
- [ ] 多用户支持
- [ ] PDF全文搜索
- [ ] 自动元数据获取 (DOI lookup)
- [ ] 引用格式化 (APA, MLA等)
- [ ] 数据库自动备份

## 📝 测试示例

```javascript
// 测试解析器
node test-parsers.js

// 手动测试
curl http://localhost:3000/api/health
```

## 💾 数据持久化

- **数据库**: `./data/references.db` (SQLite)
- **PDF文件**: `./pdfs/` 目录
- **临时上传**: `./uploads/` 目录

## 🔐 安全注意事项

- 应用运行在本地localhost
- 无需认证（本地使用）
- 文件上传有基本验证
- SQL注入防护（参数化查询）

## 📞 故障排除

### 端口占用
编辑 `src/server.ts`，修改 `PORT` 变量

### 依赖安装失败
```powershell
# 清除缓存重试
pnpm store prune
pnpm install
```

### 数据库锁定
关闭所有实例，删除 `data/references.db-wal` 和 `data/references.db-shm`

### 解析失败
- 检查文件编码（应为UTF-8）
- 确认文件格式正确
- 查看控制台日志

## ✅ 质量检查

- [x] 类型安全 (TypeScript)
- [x] 错误处理
- [x] API参数验证
- [x] 文件类型检查
- [x] SQL注入防护
- [x] 响应式设计
- [x] 代码注释
- [x] 用户文档

---

**开发完成时间**: 2025-01
**主要语言**: TypeScript
**License**: MIT
