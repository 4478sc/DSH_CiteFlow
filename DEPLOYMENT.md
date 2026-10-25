# 文献管理系统 - 部署指南

**项目路径**: F:\dsh_somedata\reference-manager
**完成时间**: 2026-10-25

---

## ✅ 开发完成

所有模块已完成开发和验证：
- ✅ 架构设计完成
- ✅ 数据库实现 (33/33测试通过)
- ✅ 解析器实现 (202样本100%解析)
- ✅ API路由 (TypeScript strict通过)
- ✅ React前端 (完整UI + 响应式)

---

## 🚀 快速启动

### 1. 安装依赖
```powershell
cd F:\dsh_somedata\reference-manager

# 后端依赖
npm install

# 前端依赖
cd client
npm install
cd ..
```

### 2. 构建项目
```powershell
# 在项目根目录
npm run build
```

### 3. 启动服务
```powershell
# 生产模式
npm start

# 开发模式（推荐）
npm run dev          # 后端
npm run dev:client   # 前端（新终端）
```

访问: http://localhost:3000 (生产) 或 http://localhost:5173 (开发)

---

## 📋 验证步骤

### 后端验证
```powershell
cd F:\dsh_somedata\reference-manager
npm run test:integration
```

### 前端验证
```powershell
cd F:\dsh_somedata\reference-manager\client
npm run build
```

---

## 🎯 使用示例

1. **导入文献**: 右上角"导入" → 选择RIS/WoS文件
2. **上传PDF**: 选择文献 → 详情面板 → 上传PDF
3. **导出BibTeX**: 选择分类/文献 → 导出BibTeX
4. **批量操作**: 多选文献 → 批量移动/删除

---

## 📁 数据目录

- `data/` - SQLite数据库
- `storage/` - PDF文件
- 备份这两个目录即可保存所有数据

---

## 🔧 配置

创建 `.env` 文件（参考 `.env.example`）：
```
PORT=3000
DB_PATH=./data/references.db
STORAGE_PATH=./storage
CORS_ORIGIN=http://localhost:5173
```

---

## 📚 文档

- `README.md` - 项目介绍
- `docs/architecture.md` - 完整架构文档
- `docs/schema.sql` - 数据库Schema

---

**项目完成！立即运行 npm run build 开始使用。**