# 快速参考卡片

## 一分钟启动

```powershell
.\install-all.ps1  # 安装
.\quick-start.ps1  # 启动
# http://localhost:3000
```

## 关键路径

- **主程序**: `src/server.ts`
- **数据库**: `src/database/database.ts` (72KB)
- **解析器**: `src/parsers/ris-parser.ts`, `wos-parser.ts`
- **导出器**: `src/utils/bibtex-exporter.ts` (32KB)
- **前端**: `client/src/App.tsx`
- **API**: `src/api/v1/*.ts` (15个端点)

## 核心命令

```powershell
npm run build          # 构建全部
npm run build:server   # 仅后端
npm run build:client   # 仅前端
npm start              # 启动服务
npm run dev            # 开发模式（后端）
npm run dev:client     # 开发模式（前端）
npm test               # 运行测试
```

## 数据位置

- **数据库**: `data/references.db` (SQLite)
- **PDF存储**: `storage/pdfs/`
- **上传临时**: `uploads/`

## 表结构

```sql
references  -- 文献元数据（DOI唯一）
folders     -- 分类树（邻接表）
files       -- PDF附件（主文件唯一）
```

## API基础路径

- `/api/v1/categories` - 分类
- `/api/v1/papers` - 文献
- `/api/v1/files` - 文件
- `/api/v1/imports` - 导入
- `/api/v1/exports/bibtex` - 导出

## 常见任务

### 添加新字段到references表

1. 修改 `src/database/schema.sql`
2. 更新 `src/types/reference.ts` 接口
3. 修改 `database.ts` 的CRUD方法
4. 更新解析器（如需要）
5. 重建数据库或写迁移

### 添加新解析器

1. 创建 `src/parsers/xxx-parser.ts`
2. 实现 `parseXXX()` 返回 `CitationRecord[]`
3. 在 `src/api/v1/imports.ts` 添加格式检测
4. 添加测试样本到 `tests/fixtures/`

### 修改BibTeX输出格式

- 编辑 `src/utils/bibtex-exporter.ts`
- 注意保持LaTeX兼容性
- 测试特殊字符转义

### 添加新API端点

1. 在 `src/api/v1/` 创建路由文件
2. 挂载到 `server.ts`
3. 更新 `client/src/services/api.ts`
4. 更新前端组件调用

## 故障排查

**端口占用**:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**数据库锁定**:
```powershell
Remove-Item data/references.db-shm, data/references.db-wal
```

**构建失败**:
```powershell
Remove-Item node_modules, package-lock.json -Recurse -Force
npm install
```

## 文档

- `README.md` - 使用说明
- `DEPLOYMENT.md` - 部署指南
- `docs/architecture.md` - 完整架构 (85KB)
- `HANDOVER.md` - 会话交接（你现在看的可能就是这个的简化版）

## 验证状态

✅ TypeScript strict: 通过
✅ 数据库测试: 33/33
✅ RIS解析: 130样本
✅ WoS解析: 72样本
✅ BibTeX导出: 验证通过

## 环境要求

- Node.js >= 20.0.0
- npm >= 9.0.0
- Windows 10/11, macOS, Linux

---

**最后更新**: 2026-10-25
**状态**: ✅ 生产就绪
