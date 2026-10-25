import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

// 导入API路由
import foldersRouter from './api/routes/folders.js';
import referencesRouter from './api/routes/references.js';
import importRouter from './api/routes/import.js';
import exportRouter from './api/routes/export.js';

// V1 API路由
import v1Router from './api/v1/index.js';

import { PDFS_DIR, UPLOADS_DIR, migrateLegacyUploads } from './utils/storage.js';
import { ReferenceDatabase } from './database/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/pdfs', express.static(PDFS_DIR));
app.use(express.static(path.join(__dirname, '../client/dist')));

// API路由
// V1 规范API（推荐使用）
app.use('/api/v1', v1Router);

// 兼容旧版API
app.use('/api', foldersRouter);
app.use('/api', referencesRouter);
app.use('/api', importRouter);
app.use('/api', exportRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '文献管理系统运行中' });
});

// 所有其他请求返回前端应用
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// 附件目录：确保存在，并把历史 uploads/ 记录归档到 pdfs/
mkdirSync(PDFS_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });
try {
  const migration = migrateLegacyUploads(ReferenceDatabase.getInstance());
  if (migration.moved > 0 || migration.failed > 0) {
    console.log(`  附件迁移: 归档 ${migration.moved} 个, 失败 ${migration.failed} 个`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`  附件迁移跳过: ${message}`);
}

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  文献管理系统`);
  console.log(`  服务器运行在 http://localhost:${PORT}`);
  console.log(`========================================`);
});
