import { existsSync } from 'node:fs';
import { copyFile, link, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ReferenceDatabase } from '../../database/database.js';
import { INSIGHT_MODEL, runDshTask } from '../../services/dsh-runner.js';
import { resolveStoredPath } from '../../utils/storage.js';

const router = Router();
const MODEL = INSIGHT_MODEL;
type Summary = { purpose: string; contribution: string; method: string; results: string; limitations: string; reflection: string };
type Row = Summary & { paper_id: number; status: string; error: string | null; model: string | null; generated_at: string; updated_at: string };
function row(db: ReferenceDatabase, id: number): Row | undefined { return db.connection.prepare('SELECT * FROM paper_summaries WHERE paper_id = ?').get(id) as Row | undefined; }

/** 只有带 PDF 附件且文件确实存在的论文才允许归纳，避免模型拿不到原文。 */
function pdfAttachment(db: ReferenceDatabase, id: number) {
  return db.getFiles(id).find((file) =>
    (/pdf/i.test(String(file.fileType ?? '')) || /\.pdf$/i.test(file.filePath ?? '') || /\.pdf$/i.test(file.fileName ?? ''))
      && existsSync(resolveStoredPath(file.filePath)),
  );
}

function response(r: Row | undefined, hasPdf: boolean) {
  const base = { hasPdf };
  if (!r) return { ...base, status: 'none' };
  return { ...base, id: r.paper_id, status: r.status, purpose: r.purpose, contribution: r.contribution, method: r.method, results: r.results, limitations: r.limitations, reflection: r.reflection, model: r.model, generatedAt: r.generated_at, updatedAt: r.updated_at, error: r.error };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
}

function parseSummary(text: string): Summary {
  const cleaned = stripFence(text); let value: unknown; try { value = JSON.parse(cleaned); } catch { value = null; }
  const object = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const pick = (key: keyof Summary, aliases: string[]) => { const v = [key, ...aliases].map(k => object[k]).find(x => typeof x === 'string'); return String(v ?? '未提及'); };
  if (!Object.keys(object).length) return { purpose: text, contribution: '未提及', method: '未提及', results: '未提及', limitations: '未提及', reflection: '未提及' };
  return { purpose: pick('purpose',['目的','研究目的']), contribution: pick('contribution',['贡献']), method: pick('method',['方法','研究方法']), results: pick('results',['结果','主要结果']), limitations: pick('limitations',['局限','局限性']), reflection: pick('reflection',['感想','可复用点']) };
}

function mark(db: ReferenceDatabase, id: number, patch: Partial<Summary> & { status: string; error?: string | null; model?: string | null }) {
  const allowed = ['purpose','contribution','method','results','limitations','reflection','status','error','model'];
  const keys = allowed.filter(k => k in patch); const sets = keys.map(k => k + ' = @' + k);
  db.connection.prepare('UPDATE paper_summaries SET ' + sets.join(', ') + ", updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), generated_at = CASE WHEN @status = 'ready' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE generated_at END WHERE paper_id = @id").run({ id, ...patch });
}

/**
 * 给模型准备一个独立工作目录，用硬链接（失败则复制）把 PDF 放进去，
 * 避免模型把提取出的临时文本写进用户的 pdfs/<id>/ 目录。
 */
async function prepareWorkdir(paperId: number, pdfPath: string) {
  const base = path.resolve(process.env.DSH_WORKDIR ?? 'data/dsh-tmp');
  const directory = path.join(base, `paper-${paperId}`);
  const fileName = path.basename(pdfPath);
  try {
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, fileName);
    await link(pdfPath, target).catch(() => copyFile(pdfPath, target));
    return { workdir: directory, fileName };
  } catch {
    return { workdir: path.dirname(pdfPath), fileName };
  }
}

function schedule(db: ReferenceDatabase, id: number) {
  const paper = db.getReferenceById(id); if (!paper) return;
  const pdf = pdfAttachment(db, id);
  const pdfPath = pdf ? resolveStoredPath(pdf.filePath) : null;
  db.connection.prepare("INSERT INTO paper_summaries (paper_id,status,model) VALUES (@id,'pending',@model) ON CONFLICT(paper_id) DO UPDATE SET status='pending', error=NULL, model=@model, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").run({ id, model: MODEL });
  void (async () => {
    mark(db, id, { status: 'running' });
    const lines = [
      '你是严谨的学术助理。请阅读论文原文，并只输出一个 JSON 对象，不要输出代码围栏。所有字段必须是简体中文字符串，缺失写“未提及”。字段严格为 purpose、contribution、method、results、limitations、reflection（分别对应：研究目的、主要贡献、方法、结果、局限、感想/可复用点）。',
      '论文标题：' + paper.title,
      '作者：' + paper.authors.join('、'),
      '年份：' + (paper.year ?? '未提及'),
      '摘要：' + (paper.abstract || '未提供'),
    ];
    let workdir: string | undefined;
    if (pdfPath) {
      const prepared = await prepareWorkdir(id, pdfPath);
      workdir = prepared.workdir;
      lines.push('论文 PDF 就在当前工作目录，文件名：' + prepared.fileName + '。请先用 pdftotext 等命令行工具提取 PDF 正文（必要时分段阅读），再据此归纳；PDF 与摘要冲突时以 PDF 为准。');
    }
    const result = await runDshTask(lines.join('\n'), { workdir });
    if (!result.ok) { mark(db, id, { status: 'error', error: result.error ?? '生成失败' }); return; }
    mark(db, id, { status: 'ready', ...parseSummary(result.text), error: null, model: MODEL });
  })();
}

router.get('/papers/:id', (req, res) => {
  const id = Number(req.params.id); const db = ReferenceDatabase.getInstance();
  if (!db.getReferenceById(id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Paper not found' } });
  return res.json({ data: response(row(db, id), Boolean(pdfAttachment(db, id))) });
});

router.post('/papers/:id', (req, res) => {
  const id = Number(req.params.id); const db = ReferenceDatabase.getInstance();
  if (!db.getReferenceById(id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Paper not found' } });
  if (!pdfAttachment(db, id)) return res.status(409).json({ error: { code: 'PDF_REQUIRED', message: '该论文还没有 PDF 附件，无法生成归纳。请先上传 PDF 后再试。' } });
  schedule(db, id);
  return res.status(202).json({ data: { status: 'pending', id } });
});

export default router;
