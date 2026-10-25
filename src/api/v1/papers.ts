import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';
import { exportBibTeX } from '../../utils/bibtex-exporter.js';

const router = Router();

/** 把 Express 的 query 值（string | string[] | ParsedQs…）收敛成字符串。 */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** 读取整数 query 参数；缺失或无法解析时返回 fallback。 */
function queryInt(value: unknown, fallback: number): number {
  const raw = queryString(value);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * GET /api/v1/papers - 列表/搜索/筛选
 */
router.get('/', (req, res) => {
  try {
    const db = ReferenceDatabase.getInstance();
    let papers = db.getReferences();
    
    const { categoryId, q, yearFrom, yearTo, type, hasPdf, page, pageSize } = req.query;
    const pageNum = Math.max(1, queryInt(page, 1));
    const pageSizeNum = Math.max(1, queryInt(pageSize, 20));
    
    // 筛选
    const categoryFilter = queryInt(categoryId, Number.NaN);
    if (Number.isFinite(categoryFilter)) {
      papers = papers.filter(p => p.folderId === categoryFilter);
    }
    const keyword = queryString(q);
    if (keyword) {
      const query = keyword.toLowerCase();
      papers = papers.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.authors?.some(a => a.toLowerCase().includes(query)) ||
        p.abstract?.toLowerCase().includes(query)
      );
    }
    const yearFromNum = queryInt(yearFrom, Number.NaN);
    if (Number.isFinite(yearFromNum)) papers = papers.filter(p => p.year != null && p.year >= yearFromNum);
    const yearToNum = queryInt(yearTo, Number.NaN);
    if (Number.isFinite(yearToNum)) papers = papers.filter(p => p.year != null && p.year <= yearToNum);
    const typeFilter = queryString(type);
    if (typeFilter) papers = papers.filter(p => p.type === typeFilter);
    if (queryString(hasPdf) === 'true') papers = papers.filter(p => p.pdfPath);
    
    // 分页
    const total = papers.length;
    const start = (pageNum - 1) * pageSizeNum;
    const paged = papers.slice(start, start + pageSizeNum);
    
    res.json({
      data: paged,
      meta: { page: pageNum, pageSize: pageSizeNum, total }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * POST /api/v1/papers - 创建文献
 */
router.post('/', (req, res) => {
  try {
    const db = ReferenceDatabase.getInstance();
    const id = db.createReference(req.body);
    const paper = db.getReferenceById(id);
    
    res.status(201).json({ data: paper });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * PATCH /api/v1/papers/batch-move - 批量移动
 * Body: { paperIds: number[], categoryId: number | null }
 * 注意：必须在 /:id 路由之前定义，否则 "batch-move" 会被当作 id
 */
router.patch('/batch-move', (req, res) => {
  try {
    const { paperIds, categoryId } = req.body;
    
    if (!Array.isArray(paperIds) || paperIds.length === 0) {
      return res.status(400).json({ 
        error: { code: 'INVALID_INPUT', message: 'paperIds must be a non-empty array' } 
      });
    }
    
    const db = ReferenceDatabase.getInstance();
    let moved = 0;
    
    for (const id of paperIds) {
      try {
        db.updateReference(id, { folderId: categoryId });
        moved++;
      } catch (err) {
        console.error(`Failed to move paper ${id}:`, err);
      }
    }
    
    res.json({ data: { total: paperIds.length, moved } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * DELETE /api/v1/papers/batch-delete - 批量删除
 * Body: { paperIds: number[] }
 * 注意：必须在 /:id 路由之前定义，否则 "batch-delete" 会被当作 id
 */
router.delete('/batch-delete', (req, res) => {
  try {
    const { paperIds } = req.body;
    
    if (!Array.isArray(paperIds) || paperIds.length === 0) {
      return res.status(400).json({ 
        error: { code: 'INVALID_INPUT', message: 'paperIds must be a non-empty array' } 
      });
    }
    
    const db = ReferenceDatabase.getInstance();
    let deleted = 0;
    
    for (const id of paperIds) {
      try {
        db.deleteReference(id);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete paper ${id}:`, err);
      }
    }
    
    res.json({ data: { total: paperIds.length, deleted } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * GET /api/v1/papers/:id - 详情
 */
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    const paper = db.getReferenceById(id);
    
    if (!paper) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Paper not found' } });
    }
    
    const files = db.getFiles(id);
    res.json({ data: { ...paper, files } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * GET /api/v1/papers/:id/bibtex - 单条BibTeX
 */
router.get('/:id/bibtex', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    const paper = db.getReferenceById(id);
    
    if (!paper) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Paper not found' } });
    }
    
    const bibtex = exportBibTeX([paper]);
    res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${paper.title?.substring(0, 30) || 'paper'}.bib"`);
    res.send(bibtex);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * PATCH /api/v1/papers/:id - 更新文献
 */
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    
    db.updateReference(id, req.body);
    const updated = db.getReferenceById(id);
    
    res.json({ data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

/**
 * DELETE /api/v1/papers/:id - 删除文献
 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = ReferenceDatabase.getInstance();
    db.deleteReference(id);
    
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

export default router;
