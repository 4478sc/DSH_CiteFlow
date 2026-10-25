import { Router } from 'express';
import multer from 'multer';
import { readFileSync, unlinkSync } from 'fs';
import { parseRISWithDiagnostics } from '../../parsers/ris-parser.js';
import { parseWoSWithDiagnostics } from '../../parsers/wos-parser.js';
import type { CitationDiagnostic } from '../../parsers/types.js';
import { ReferenceDatabase } from '../../database/database.js';
import { UPLOADS_DIR } from '../../utils/storage.js';

/** 单次导入请求的汇总结果。 */
interface ImportSummary {
  /** dry-run 时是完整记录，正常导入时是 { id, title, doi }。 */
  imported: Array<Record<string, unknown>>;
  updated: Array<{ id: number; title: string }>;
  skipped: Array<{ title: string; doi?: string; reason: string }>;
  errors: Array<{ file?: string; title?: string; error: string }>;
  diagnostics: Array<{ file: string; diagnostics: CitationDiagnostic[] }>;
}

const router = Router();
const upload = multer({ 
  dest: UPLOADS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * POST /api/v1/imports - 导入RIS/WoS文件
 * Body (multipart): files[], categoryId, format (auto/ris/wos), duplicatePolicy (skip/update), dryRun
 */
router.post('/', upload.array('files'), async (req, res) => {
  const uploadedFiles: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];
  
  try {
    const { categoryId, format = 'auto', duplicatePolicy = 'skip', dryRun = 'false' } = req.body;
    
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ 
        error: { code: 'NO_FILES', message: 'No files uploaded' } 
      });
    }
    
    const results: ImportSummary = { 
      imported: [], 
      updated: [],
      skipped: [], 
      errors: [],
      diagnostics: []
    };
    
    const db = ReferenceDatabase.getInstance();
    const isDryRun = dryRun === 'true' || dryRun === true;
    
    for (const file of uploadedFiles) {
      try {
        const content = readFileSync(file.path, 'utf-8');
        let parseResult = null;
        let detectedFormat = format;
        
        // 自动检测格式
        if (format === 'auto') {
          if (content.includes('TY  -')) {
            detectedFormat = 'ris';
          } else if (content.includes('PT ') || content.includes('FN ')) {
            detectedFormat = 'wos';
          }
        }
        
        // 解析
        if (detectedFormat === 'ris') {
          parseResult = parseRISWithDiagnostics(content);
        } else if (detectedFormat === 'wos') {
          parseResult = parseWoSWithDiagnostics(content);
        } else {
          results.errors.push({ 
            file: file.originalname, 
            error: 'Unknown format, could not auto-detect' 
          });
          continue;
        }
        
        // 收集诊断信息
        if (parseResult.errors.length > 0 || parseResult.warnings.length > 0) {
          results.diagnostics.push({
            file: file.originalname,
            diagnostics: [...parseResult.errors, ...parseResult.warnings]
          });
        }
        
        // 导入记录
        for (const record of parseResult.references) {
          try {
            // 检查DOI重复
            if (record.doi && duplicatePolicy === 'skip') {
              const existing = db.getReferences().find(
                ref => ref.doi?.toLowerCase() === record.doi?.toLowerCase()
              );
              if (existing) {
                results.skipped.push({ 
                  title: record.title, 
                  doi: record.doi,
                  reason: 'Duplicate DOI' 
                });
                continue;
              }
            }
            
            if (isDryRun) {
              results.imported.push({ 
                ...record, 
                dryRun: true,
                detectedFormat 
              });
            } else {
              const refData = {
                ...record,
                folderId: categoryId ? Number.parseInt(String(categoryId), 10) : undefined,
                sourceFormat: detectedFormat
              };
              
              // 更新或创建
              if (record.doi && duplicatePolicy === 'update') {
                const existing = db.getReferences().find(
                  ref => ref.doi?.toLowerCase() === record.doi?.toLowerCase()
                );
                if (existing && typeof existing.id === 'number') {
                  db.updateReference(existing.id, refData);
                  results.updated.push({ id: existing.id, title: record.title });
                  continue;
                }
              }
              
              const refId = db.createReference(refData);
              results.imported.push({ id: refId, title: record.title, doi: record.doi });
            }
          } catch (err) {
            results.errors.push({ 
              title: record.title || 'Unknown', 
              error: err instanceof Error ? err.message : String(err) 
            });
          }
        }
      } catch (err) {
        results.errors.push({ 
          file: file.originalname, 
          error: err instanceof Error ? err.message : String(err) 
        });
      } finally {
        // 清理上传的临时文件
        try {
          unlinkSync(file.path);
        } catch (cleanupErr) {
          console.error('Failed to cleanup uploaded file:', cleanupErr);
        }
      }
    }
    
    res.json({ 
      data: results,
      meta: {
        totalFiles: uploadedFiles.length,
        totalImported: results.imported.length,
        totalUpdated: results.updated.length,
        totalSkipped: results.skipped.length,
        totalErrors: results.errors.length
      }
    });
  } catch (error) {
    // 清理所有上传文件
    for (const file of uploadedFiles) {
      try {
        unlinkSync(file.path);
      } catch {}
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: { code: 'INTERNAL_ERROR', message } 
    });
  }
});

export default router;
