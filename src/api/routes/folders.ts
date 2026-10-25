import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';

const router = Router();
const db = ReferenceDatabase.getInstance();

// 文件夹管理
router.get('/folders', async (req, res) => {
  try {
    const folders = db.getFolders();
    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

router.post('/folders', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const id = db.createFolder(name, parentId);
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

router.delete('/folders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteFolder(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;
