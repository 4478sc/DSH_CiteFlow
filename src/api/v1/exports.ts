import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';
import { exportBibTeX } from '../../utils/bibtex-exporter.js';

const router = Router();

/**
 * GET /api/v1/exports/bibtex - 按分类导出
 */
router.get('/bibtex', (req, res) => {
  try {
    const { categoryId, includeDescendants = 'false' } = req.query;
    const db = ReferenceDatabase.getInstance();
    let papers = db.getReferences();
    
    // 筛选
    if (categoryId) {
      const catId = parseInt(categoryId);
      papers = papers.filter(p => p.folderId === catId);
    }
    
    if (papers.length === 0) {
      res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
      return res.send('% No entries\n');
    }
    
    const bibtex = exportBibTeX(papers);
    const date = new Date().toISOString().split('T')[0];
    
    res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="references-${date}.bib"`);
    res.send(bibtex);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'EXPORT_ERROR', message } });
  }
});

/**
 * POST /api/v1/exports/bibtex - 按ID批量导出
 */
router.post('/bibtex', (req, res) => {
  try {
    const { paperIds } = req.body;
    
    if (!Array.isArray(paperIds) || paperIds.length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'paperIds must be a non-empty array' } });
    }
    
    const db = ReferenceDatabase.getInstance();
    const papers = paperIds.map(id => db.getReferenceById(id)).filter(Boolean);
    
    if (papers.length === 0) {
      res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
      return res.send('% No entries\n');
    }
    
    const bibtex = exportBibTeX(papers);
    const date = new Date().toISOString().split('T')[0];
    
    res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="selected-${date}.bib"`);
    res.send(bibtex);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'BATCH_EXPORT_ERROR', message } });
  }
});

export default router;
