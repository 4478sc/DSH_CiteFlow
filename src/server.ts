import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入API路由
import foldersRouter from './api/routes/folders.js';
import referencesRouter from './api/routes/references.js';
import importRouter from './api/routes/import.js';
import exportRouter from './api/routes/export.js';

// V1 API路由
import v1Router from './api/v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/pdfs', express.static(path.join(__dirname, '../pdfs')));
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

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  文献管理系统`);
  console.log(`  服务器运行在 http://localhost:${PORT}`);
  console.log(`========================================`);
});
