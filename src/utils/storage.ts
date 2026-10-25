/**
 * 附件存储层：把 multer 的临时文件归档到 `pdfs/`，并迁移历史 `uploads/` 记录。
 *
 * 约定：
 * - 磁盘布局：`<repo>/pdfs/<referenceId>/<sanitized-name>`，同名时追加 `-1`、`-2`；
 * - 数据库 `files.file_path` 存**仓库相对路径**（统一正斜杠），例如 `pdfs/3/paper.pdf`；
 * - 运行时读取一律经 resolveStoredPath 转成绝对路径，因此与启动目录无关。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** 仓库根目录：本文件位于 dist/utils/（或 src/utils/），往上两级即根。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 附件最终存放目录（server.ts 的静态 /pdfs 也指向这里）。 */
export const PDFS_DIR = path.join(REPO_ROOT, 'pdfs');

/** multer 的临时落盘目录；文件处理完会立即移走，正常情况下保持为空。 */
export const UPLOADS_DIR = path.join(REPO_ROOT, 'uploads');

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const MAX_FILENAME_LENGTH = 120;

/** 去掉路径分隔符与控制字符，保留扩展名，限制长度。 */
export function sanitizeFileName(originalName: string): string {
  const base = path.basename(originalName).replace(ILLEGAL_FILENAME_CHARS, '_').replace(/^\.+/, '').trim();
  const fallback = 'attachment';
  const safe = base.length > 0 ? base : fallback;
  const extension = path.extname(safe);
  const stem = extension.length > 0 ? safe.slice(0, -extension.length) : safe;
  const maxStem = Math.max(1, MAX_FILENAME_LENGTH - extension.length);
  const trimmedStem = stem.slice(0, maxStem).trim();
  return String(trimmedStem.length > 0 ? trimmedStem : fallback) + extension;
}

/** 把绝对路径写成数据库里的仓库相对路径（正斜杠）。 */
export function toStoredPath(absolutePath: string): string {
  const absolute = path.resolve(absolutePath);
  const relative = path.relative(REPO_ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    // 不在仓库内（例如用户自选的外部 PDF），保留绝对路径。
    return absolute.replace(/\\/g, '/');
  }
  return relative.replace(/\\/g, '/');
}

/** 数据库路径 → 可直接读盘的绝对路径。 */
export function resolveStoredPath(storedPath: string): string {
  if (!storedPath) return storedPath;
  const normalized = storedPath.replace(/[\\/]+/g, path.sep);
  return path.isAbsolute(normalized) ? normalized : path.resolve(REPO_ROOT, normalized);
}

/** target 是否位于 directory 内（含子目录）。 */
function isInside(target: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(target));
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** 同目录下找一个未占用的文件名。 */
function uniqueTarget(directory: string, fileName: string): string {
  const extension = path.extname(fileName);
  const stem = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
  let candidate = path.join(directory, fileName);
  let counter = 1;
  while (existsSync(candidate)) {
    candidate = path.join(directory, stem + '-' + counter + extension);
    counter += 1;
  }
  return candidate;
}

/** rename，跨盘或占用时退化为 copy + unlink。 */
function moveFile(source: string, target: string): void {
  try {
    renameSync(source, target);
  } catch {
    copyFileSync(source, target);
    unlinkSync(source);
  }
}

export interface StoredFile {
  /** 写入数据库的仓库相对路径。 */
  filePath: string;
  fileName: string;
  fileSize: number;
}

/**
 * 把上传的临时文件归档到 pdfs/<referenceId>/，返回可写入数据库的信息。
 * 失败时抛错，调用方负责清理 tempPath。
 */
export function storeUploadedFile(
  tempPath: string,
  originalName: string,
  referenceId: number,
): StoredFile {
  const directory = path.join(PDFS_DIR, String(referenceId));
  mkdirSync(directory, { recursive: true });

  const fileName = sanitizeFileName(originalName);
  const target = uniqueTarget(directory, fileName);
  moveFile(tempPath, target);

  return {
    filePath: toStoredPath(target),
    fileName,
    fileSize: statSync(target).size,
  };
}

/** 删除附件实体文件；不存在或删除失败都静默忽略。 */
export function removeStoredFile(storedPath: string): boolean {
  try {
    const absolute = resolveStoredPath(storedPath);
    if (!existsSync(absolute)) return false;
    unlinkSync(absolute);
    return true;
  } catch {
    return false;
  }
}

/** 迁移所需的最小数据库接口（避免与 database.ts 相互依赖）。 */
interface LegacyAttachment {
  id: number;
  filePath: string;
  fileName: string;
}

interface LegacyStore {
  getReferences(): Array<{ id?: number }>;
  getFiles(referenceId: number | undefined): LegacyAttachment[];
  updateFile(id: number, patch: { filePath: string }): unknown;
}

export interface MigrationResult {
  moved: number;
  failed: number;
}

/**
 * 把历史记录里指向 uploads/ 的附件搬到 pdfs/ 并更新 file_path。
 * 幂等：已经是 pdfs/ 或文件已不存在时跳过。
 */
export function migrateLegacyUploads(db: LegacyStore): MigrationResult {
  const result: MigrationResult = { moved: 0, failed: 0 };

  for (const reference of db.getReferences()) {
    if (typeof reference.id !== 'number') continue;

    for (const file of db.getFiles(reference.id)) {
      const absolute = resolveStoredPath(file.filePath);
      if (!isInside(absolute, UPLOADS_DIR) || !existsSync(absolute)) continue;

      try {
        const stored = storeUploadedFile(absolute, file.fileName || path.basename(absolute), reference.id);
        db.updateFile(file.id, { filePath: stored.filePath });
        result.moved += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error('[storage] 迁移附件 ' + file.id + ' 失败：' + message);
      }
    }
  }

  return result;
}