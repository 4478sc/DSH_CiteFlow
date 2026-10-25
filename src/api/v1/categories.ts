import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';

const router = Router();

/**
 * GET /api/v1/categories - 获取所有分类树
 */
router.get('/', (req, res) => {
  try {
    const db = ReferenceDatabase.getInstance();
    const folders = db.getFolders();
    
    const buildTree = (parentId) => {
      return folders
        .filter(f => f.parentId === parentId)
        .map(f => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          children: buildTree(f.id),
          directCount: db.getReferences().filter(r => r.folderId === f.id).length
        }));
    };
    
    res.json({ data: buildTree(null) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * POST /api/v1/categories - 创建分类
 */
router.post('/', (req, res) => {
  try {
    const { name, parentId = null } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name required' } });
    }
    
    const db = ReferenceDatabase.getInstance();
    const id = db.createFolder(name.trim(), parentId);
    const folder = db.getFolders().find(f => f.id === id);
    
    res.status(201).json({ data: folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * PATCH /api/v1/categories/:id - 更新分类
 */
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, parentId } = req.body;
    
    const db = ReferenceDatabase.getInstance();
    const updates: { name?: string; parentId?: number | null } = {};
    if (name !== undefined) updates.name = name.trim();
    if (parentId !== undefined) updates.parentId = parentId;
    
    db.updateFolder(id, updates);
    const updated = db.getFolders().find(f => f.id === id);
    
    res.json({ data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * DELETE /api/v1/categories/:id - 删除分类
 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    db.deleteFolder(id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

export default router;
