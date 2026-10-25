import { Router } from 'express';
import multer from 'multer';
import { ReferenceDatabase } from '../../database/database.js';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';

const router = Router();
const upload = multer({ dest: 'uploads/' });

/**
 * POST /api/v1/papers/:id/files - 上传文件
 */
router.post('/:paperId/files', upload.single('file'), (req, res) => {
  try {
    const paperId = parseInt(req.params.paperId);
    const { kind = 'pdf', isPrimary = false } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }
    
    const db = ReferenceDatabase.getInstance();
    const fileId = db.attachFile(
      paperId,
      req.file.originalname,
      req.file.path,
      kind,
      isPrimary === 'true' || isPrimary === true
    );
    
    const file = db.getFiles(paperId).find(f => f.id === fileId);
    res.status(201).json({ data: file });
  } catch (error) {
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
    
    if (!existsSync(targetFile.filePath)) {
      return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found on disk' } });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${targetFile.fileName}"`);
    createReadStream(targetFile.filePath).pipe(res);
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
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    db.deleteFile(id);
    
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'DELETE_ERROR', message } });
  }
});

export default router;
