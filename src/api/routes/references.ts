import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';

const router = Router();
const db = ReferenceDatabase.getInstance();

// 获取文献列表
router.get('/references', async (req, res) => {
  try {
    const folderId = req.query.folderId ? parseInt(req.query.folderId as string) : undefined;
    const search = req.query.search as string | undefined;
    const references = db.getReferences(folderId, search);
    res.json({ references });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch references' });
  }
});

// 获取单个文献详情
router.get('/references/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reference = db.getReferenceById(id);
    if (!reference) {
      return res.status(404).json({ error: 'Reference not found' });
    }
    res.json({ reference });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reference' });
  }
});

// 更新文献
router.put('/references/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.updateReference(id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reference' });
  }
});

// 删除文献
router.delete('/references/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteReference(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reference' });
  }
});

export default router;
