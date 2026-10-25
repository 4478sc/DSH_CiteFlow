import { Router } from 'express';
import multer from 'multer';
import { readFileSync } from 'fs';
import { parseRIS } from '../../parsers/ris-parser.js';
import { parseWoS } from '../../parsers/wos-parser.js';
import { ReferenceDatabase } from '../../database/database.js';
import { generateBibtexKey } from '../../utils/bibtex-exporter.js';

const router = Router();
const upload = multer({ dest: 'uploads/' });
const db = ReferenceDatabase.getInstance();

// 导入RIS格式文件
router.post('/import/ris', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const content = readFileSync(req.file.path, 'utf-8');
    const references = parseRIS(content);
    const folderId = req.body.folderId ? parseInt(req.body.folderId) : undefined;
    
    let imported = 0;
    let failed = 0;
    
    for (const ref of references) {
      try {
        ref.folderId = folderId;
        ref.bibtexKey = generateBibtexKey(ref);
        db.createReference(ref);
        imported++;
      } catch (error) {
        failed++;
      }
    }
    
    res.json({ 
      success: true,
      imported,
      failed,
      total: references.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to import RIS file' });
  }
});

// 导入WoS格式文件
router.post('/import/wos', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const content = readFileSync(req.file.path, 'utf-8');
    const references = parseWoS(content);
    const folderId = req.body.folderId ? parseInt(req.body.folderId) : undefined;
    
    let imported = 0;
    let failed = 0;
    
    for (const ref of references) {
      try {
        ref.folderId = folderId;
        ref.bibtexKey = generateBibtexKey(ref);
        db.createReference(ref);
        imported++;
      } catch (error) {
        failed++;
      }
    }
    
    res.json({ 
      success: true,
      imported,
      failed,
      total: references.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to import WoS file' });
  }
});

// 关联PDF文件
router.post('/attach-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const referenceId = parseInt(req.body.referenceId);
    db.updateReference(referenceId, { pdfPath: req.file.path });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to attach PDF' });
  }
});

export default router;
