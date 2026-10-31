import { access, copyFile, link, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ReferenceDatabase } from '../database/database.js';
import { PDFS_DIR, resolveStoredPath, toStoredPath } from '../utils/storage.js';

/** 改名冲突时生成 name-1.ext / name-2.ext … */
async function availableName(directory: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? fileName : `${stem}-${index}${extension}`;
    try {
      await access(path.join(directory, candidate));
    } catch {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}${extension}`;
}

/** 同一磁盘用硬链接（不占额外空间），跨卷退化为复制。 */
async function linkOrCopy(source: string, target: string): Promise<void> {
  await link(source, target).catch(() => copyFile(source, target));
}

/**
 * 把一篇文献复制到目标分类：新建一条独立记录（不带归纳、不改动原记录），
 * 附件用硬链接/复制落到 pdfs/<新 id>/。返回新文献 id。
 */
export async function copyReferenceToFolder(
  db: ReferenceDatabase,
  sourceId: number,
  folderId: number | null,
): Promise<number> {
  const source = db.getReferenceById(sourceId);
  if (!source) throw new Error(`Reference ${sourceId} not found`);

  const created = db.addReference({
    type: source.type,
    title: source.title,
    authors: [...source.authors],
    editors: source.editors ? [...source.editors] : undefined,
    year: source.year,
    journal: source.journal,
    booktitle: source.booktitle,
    volume: source.volume,
    issue: source.issue,
    pages: source.pages,
    publisher: source.publisher,
    address: source.address,
    school: source.school,
    institution: source.institution,
    organization: source.organization,
    series: source.series,
    edition: source.edition,
    chapter: source.chapter,
    month: source.month,
    note: source.note,
    language: source.language,
    isbn: source.isbn,
    issn: source.issn,
    doi: source.doi,
    url: source.url,
    abstract: source.abstract,
    keywords: source.keywords ? [...source.keywords] : undefined,
    importedFrom: source.importedFrom,
    folderId: folderId ?? undefined,
    // 留空让数据库重新生成唯一 key，避免与原文撞车。
    bibtexKey: '',
  });
  const newId = created.id;
  if (!newId) throw new Error('Failed to create copied reference');

  const files = db.getFiles(sourceId);
  if (files.length === 0) return newId;

  const directory = path.join(PDFS_DIR, String(newId));
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    const from = resolveStoredPath(file.filePath);
    try {
      await access(from);
    } catch {
      continue; // 实体文件已丢失，跳过附件但不影响文献复制
    }
    const fileName = await availableName(directory, file.fileName || path.basename(from));
    const to = path.join(directory, fileName);
    await linkOrCopy(from, to);
    db.attachFile(newId, fileName, toStoredPath(to), file.fileType ?? 'pdf', Boolean(file.isPrimary));
  }
  return newId;
}
