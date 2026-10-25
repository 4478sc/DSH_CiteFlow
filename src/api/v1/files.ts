import { Router } from 'express';
import multer from 'multer';
import { ReferenceDatabase } from '../../database/database.js';
import { existsSync, createReadStream } from 'fs';
import {
  UPLOADS_DIR,
  removeStoredFile,
  resolveStoredPath,
  storeUploadedFile,
} from '../../utils/storage.js';

const router = Router();
// multer 只负责把上传落到 uploads/ 临时目录，处理完立即归档到 pdfs/<paperId>/。
const upload = multer({ dest: UPLOADS_DIR });

/**
 * POST /api/v1/papers/:id/files - 上传文件
 */
router.post('/:paperId/files', upload.single('file'), (req, res) => {
  const tempPath = req.file?.path;
  let storedPath: string | null = null;

  const cleanup = (): void => {
    if (storedPath) removeStoredFile(storedPath);
    if (tempPath) removeStoredFile(tempPath);
  };

  try {
    const paperId = Number.parseInt(req.params.paperId, 10);
    const { kind = 'pdf', isPrimary = false } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }
    if (!Number.isFinite(paperId) || paperId <= 0) {
      cleanup();
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid paper id' } });
    }
    
    const db = ReferenceDatabase.getInstance();
    if (!db.getReferenceById(paperId)) {
      cleanup();
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Paper not found' } });
    }

    // 归档到 pdfs/<paperId>/<原文件名>，数据库只记相对路径。
    const stored = storeUploadedFile(req.file.path, req.file.originalname, paperId);
    storedPath = stored.filePath;

    const fileId = db.attachFile(
      paperId,
      stored.fileName,
      stored.filePath,
      kind,
      isPrimary === 'true' || isPrimary === true
    );
    
    const file = db.getFiles(paperId).find(f => f.id === fileId);
    res.status(201).json({ data: file });
  } catch (error) {
    cleanup();
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'UPLOAD_ERROR', message } });
  }
});

/**
 * GET /api/v1/papers/:id/files - 获取文件列表
 */
router.get('/:paperId/files', (req, res) => {
  try {
    const paperId = parseInt(req.params.paperId);
    const db = ReferenceDatabase.getInstance();
    const files = db.getFiles(paperId);
    
    res.json({ data: files });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'GET_FILES_ERROR', message } });
  }
});

/**
 * GET /api/v1/files/:id/content - 下载/预览文件
 */
router.get('/:id/content', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    
    // 查找文件
    const allPapers = db.getReferences();
    let targetFile = null;
    let found = false;
    
    for (const paper of allPapers) {
      const files = db.getFiles(paper.id);
      targetFile = files.find(f => f.id === id);
      if (targetFile) {
        found = true;
        break;
      }
    }
    
    if (!found || !targetFile) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    }
    
    const absolutePath = resolveStoredPath(targetFile.filePath);
    if (!existsSync(absolutePath)) {
      return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found on disk' } });
    }
    
    res.setHeader('Content-Type', targetFile.mimeType ?? 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${targetFile.fileName}"`);
    createReadStream(absolutePath).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'DOWNLOAD_ERROR', message } });
  }
});

/**
 * DELETE /api/v1/files/:id - 删除文件
 */
router.delete('/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid file id' } });
    }

    const db = ReferenceDatabase.getInstance();
    const file = db.getFile(id);
    db.deleteFile(id);
    // 同步删除 pdfs/ 里的实体文件，避免删了记录却留下孤儿文件。
    if (file) removeStoredFile(file.filePath);
    
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'DELETE_ERROR', message } });
  }
});

export default router;
