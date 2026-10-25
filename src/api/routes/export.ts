import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';
import { referencesToBibtex } from '../../utils/bibtex-exporter.js';

const router = Router();
const db = ReferenceDatabase.getInstance();

// 导出选中的文献为BibTeX格式
router.post('/export/bibtex', async (req, res) => {
  try {
    const { referenceIds } = req.body;
    
    if (!referenceIds || !Array.isArray(referenceIds)) {
      return res.status(400).json({ error: 'Invalid reference IDs' });
    }
    
    const references = referenceIds
      .map(id => db.getReferenceById(parseInt(id)))
      .filter(ref => ref !== null);
    
    const bibtexContent = referencesToBibtex(references);
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="references.bib"');
    res.send(bibtexContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export BibTeX' });
  }
});

export default router;
