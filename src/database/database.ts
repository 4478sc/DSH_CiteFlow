/**
 * SQLite 数据访问层（better-sqlite3）。
 *
 * 设计要点：
 *  - 同步 API：better-sqlite3 本身同步，在 Express / Electron 主进程中调用简单；
 *  - 预编译语句缓存：同一个 SQL 只 prepare 一次；
 *  - 事务：写操作使用 better-sqlite3 transaction（自动 BEGIN/COMMIT/ROLLBACK，
 *    嵌套时使用 SAVEPOINT），批量导入要么全部成功要么全部回滚；
 *  - 行 <-> 对象映射：SQLite 的 snake_case 列映射为 camelCase，
 *    authors / editors / keywords 以 JSON 文本存储；
 *  - 错误：所有异常归一化为 DatabaseError 的子类，并带机器可读的 code。
 *
 * 兼容性：保留了 routes 层正在使用的旧方法签名
 * （createFolder(name, parentId) -> id、createReference(ref) -> id、
 *  attachFile(...) -> id、getFiles / getFolders / getReferences ...），
 * 同时提供返回完整对象的类型化方法（addReference / addFile / listReferences）。
 *
 * 典型用法：
 * ```ts
 * const db = new ReferenceDatabase();
 * const folder = db.createFolder({ name: 'Deep Learning' });
 * const ref = db.addReference({
 *   type: 'article',
 *   title: 'Sift flow: Dense correspondence across scenes and its applications',
 *   authors: ['Liu, Ce', 'Yuen, Jenny', 'Torralba, Antonio'],
 *   journal: 'IEEE Transactions on Pattern Analysis and Machine Intelligence',
 *   volume: '33',
 *   issue: '5',
 *   pages: '978-994',
 *   year: 2011,
 *   publisher: 'IEEE',
 *   folderId: folder.id,
 * });
 * db.close();
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Folder, Reference, ReferenceType } from '../types/reference.js';
import {
  generateBibtexKey,
  normalizeDoi,
  normalizeReferenceType,
  sanitizeBibtexKey,
} from '../utils/bibtex-exporter.js';

/* -------------------------------------------------------------------------- */
/* 常量                                                                        */
/* -------------------------------------------------------------------------- */

export const SCHEMA_VERSION = 1;

/** 默认数据库文件位置：<工作目录>/data/references.sqlite，可用环境变量覆盖。 */
export function resolveDefaultDatabasePath(): string {
  const fromEnvironment = process.env.REFERENCE_MANAGER_DB;
  if (fromEnvironment && fromEnvironment.trim()) return path.resolve(fromEnvironment);
  return path.resolve(process.cwd(), 'data', 'references.sqlite');
}

export const DEFAULT_DATABASE_PATH = resolveDefaultDatabasePath();

const REQUIRED_REFERENCE_COLUMNS = [
  'id', 'type', 'title', 'authors', 'editors', 'year', 'journal', 'booktitle',
  'volume', 'issue', 'pages', 'publisher', 'address', 'school', 'institution',
  'organization', 'series', 'edition', 'chapter', 'month', 'note', 'language',
  'isbn', 'issn', 'doi', 'url', 'abstract', 'keywords', 'bibtex_key', 'pdf_path',
  'folder_id', 'imported_from', 'created_at', 'updated_at',
] as const;

const REQUIRED_FOLDER_COLUMNS = [
  'id', 'name', 'parent_id', 'description', 'color', 'sort_order', 'created_at', 'updated_at',
] as const;

const REQUIRED_FILE_COLUMNS = [
  'id', 'reference_id', 'file_name', 'file_path', 'file_type', 'mime_type',
  'file_size', 'checksum', 'is_primary', 'created_at', 'updated_at',
] as const;

export const FILE_TYPES = ['pdf', 'html', 'txt', 'doc', 'docx', 'epub', 'other'] as const;
export type FileType = (typeof FILE_TYPES)[number];

const MIME_TYPES: Readonly<Record<FileType, string | null>> = Object.freeze({
  pdf: 'application/pdf',
  html: 'text/html',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  other: null,
});

/* -------------------------------------------------------------------------- */
/* 错误类型                                                                    */
/* -------------------------------------------------------------------------- */

/** 数据库层错误基类；`code` 可用于 API 层映射状态码。 */
export class DatabaseError extends Error {
  readonly code: string;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.code = options.code ?? 'DATABASE_ERROR';
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 输入校验失败（空标题、非法年份、循环目录等）。 */
export class ValidationError extends DatabaseError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'VALIDATION_ERROR', cause: options.cause });
    this.name = 'ValidationError';
  }
}

/** 记录不存在。 */
export class NotFoundError extends DatabaseError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'NOT_FOUND', cause: options.cause });
    this.name = 'NotFoundError';
  }
}

/** 唯一约束冲突（同名文件夹、重复附件）。 */
export class DuplicateError extends DatabaseError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'DUPLICATE', cause: options.cause });
    this.name = 'DuplicateError';
  }
}

/** 其他约束失败（外键、CHECK 等）。 */
export class ConstraintError extends DatabaseError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: 'CONSTRAINT', cause: options.cause });
    this.name = 'ConstraintError';
  }
}

function wrapSqliteError(operation: string, error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error;

  const candidate = error as { code?: unknown; message?: unknown };
  const sqliteCode = typeof candidate?.code === 'string' ? candidate.code : '';
  const detail = typeof candidate?.message === 'string' ? candidate.message : String(error);
  const message = `${operation}: ${detail}`;

  if (sqliteCode === 'SQLITE_CONSTRAINT_UNIQUE' || sqliteCode === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return new DuplicateError(message, { cause: error });
  }
  if (sqliteCode.indexOf('SQLITE_CONSTRAINT') === 0) {
    return new ConstraintError(message, { cause: error });
  }
  if (/UNIQUE constraint failed/i.test(detail)) {
    return new DuplicateError(message, { cause: error });
  }
  if (/FOREIGN KEY constraint failed|CHECK constraint failed/i.test(detail)) {
    return new ConstraintError(message, { cause: error });
  }
  return new DatabaseError(message, { code: 'DATABASE_ERROR', cause: error });
}

/* -------------------------------------------------------------------------- */
/* 值规范化                                                                    */
/* -------------------------------------------------------------------------- */

function nowIso(): string {
  return new Date().toISOString();
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${field} must not be empty`);
  }
  return trimmed;
}

function normalizeOptionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new ValidationError(`${field} must be a string`);
}

function normalizeStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    return value
      .split(/\s+and\s+|;/i)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array of strings`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) result.push(trimmed);
      continue;
    }
    if (typeof item === 'number') {
      result.push(String(item));
      continue;
    }
    throw new ValidationError(`${field} must contain only strings`);
  }
  return result;
}

function normalizeYear(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const text = typeof value === 'string' ? value.trim() : value;
  const numeric = typeof text === 'number' ? text : Number(text);
  if (!Number.isInteger(numeric)) {
    throw new ValidationError(`year must be an integer, received "${String(value)}"`);
  }
  if (numeric < 1000 || numeric > 2200) {
    throw new ValidationError(`year must be between 1000 and 2200, received ${numeric}`);
  }
  return numeric;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return numeric;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  return numeric;
}

function normalizeOptionalInteger(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  return requireNonNegativeInteger(value, field);
}

function normalizeOptionalId(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  return requirePositiveInteger(value, field);
}

function normalizeTypeSafe(value: unknown, field: string): ReferenceType {
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`);
  }
  try {
    return normalizeReferenceType(typeof value === 'string' ? value : String(value));
  } catch (error) {
    throw new ValidationError(`${field}: ${(error as Error).message}`);
  }
}

function normalizeFileType(value: unknown): FileType {
  const raw = typeof value === 'string' ? value.trim().toLowerCase().replace(/^\./, '') : '';
  if (raw === 'htm') return 'html';
  if (raw === 'text') return 'txt';
  if ((FILE_TYPES as readonly string[]).includes(raw)) return raw as FileType;
  return 'other';
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function alphabeticSuffix(index: number): string {
  let value = index;
  let suffix = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    suffix = String.fromCharCode(97 + remainder) + suffix;
    value = Math.floor((value - 1) / 26);
  }
  return suffix;
}

/* -------------------------------------------------------------------------- */
/* 行类型与映射                                                                */
/* -------------------------------------------------------------------------- */

interface ReferenceRow {
  id: number;
  type: string;
  title: string;
  authors: string;
  editors: string;
  year: number | null;
  journal: string | null;
  booktitle: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  address: string | null;
  school: string | null;
  institution: string | null;
  organization: string | null;
  series: string | null;
  edition: string | null;
  chapter: string | null;
  month: string | null;
  note: string | null;
  language: string | null;
  isbn: string | null;
  issn: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  keywords: string;
  bibtex_key: string;
  pdf_path: string | null;
  folder_id: number | null;
  imported_from: string | null;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  reference_count?: number;
}

interface FileRow {
  id: number;
  reference_id: number;
  file_name: string;
  file_path: string;
  file_type: string;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function rowToReference(row: ReferenceRow): Reference {
  return {
    id: row.id,
    type: row.type as ReferenceType,
    title: row.title,
    authors: parseJsonStringArray(row.authors),
    editors: parseJsonStringArray(row.editors),
    year: row.year ?? undefined,
    journal: row.journal ?? undefined,
    booktitle: row.booktitle ?? undefined,
    volume: row.volume ?? undefined,
    issue: row.issue ?? undefined,
    pages: row.pages ?? undefined,
    publisher: row.publisher ?? undefined,
    address: row.address ?? undefined,
    school: row.school ?? undefined,
    institution: row.institution ?? undefined,
    organization: row.organization ?? undefined,
    series: row.series ?? undefined,
    edition: row.edition ?? undefined,
    chapter: row.chapter ?? undefined,
    month: row.month ?? undefined,
    note: row.note ?? undefined,
    language: row.language ?? undefined,
    isbn: row.isbn ?? undefined,
    issn: row.issn ?? undefined,
    doi: row.doi ?? undefined,
    url: row.url ?? undefined,
    abstract: row.abstract ?? undefined,
    keywords: parseJsonStringArray(row.keywords),
    bibtexKey: row.bibtex_key,
    pdfPath: row.pdf_path ?? undefined,
    folderId: row.folder_id ?? undefined,
    importedFrom: row.imported_from ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    referenceCount: row.reference_count ?? 0,
  };
}

function rowToFile(row: FileRow): AttachedFile {
  return {
    id: row.id,
    referenceId: row.reference_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type as FileType,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    checksum: row.checksum ?? undefined,
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* 输入 / 查询类型                                                             */
/* -------------------------------------------------------------------------- */

export type ReferenceInput = Omit<
  Reference,
  'id' | 'createdAt' | 'updatedAt' | 'type' | 'authors' | 'bibtexKey'
> & {
  type: ReferenceType | string;
  authors: string[] | string;
  bibtexKey?: string | null;
};

export type ReferencePatch = {
  [Key in keyof ReferenceInput]?: ReferenceInput[Key] | null;
};

export interface ReferenceQuery {
  /** 目录 id；null 表示“未分类”，undefined 表示不限制。 */
  folderId?: number | null;
  /** 指定目录时是否包含子目录（递归）。默认 false。 */
  includeSubfolders?: boolean;
  type?: ReferenceType | readonly ReferenceType[];
  year?: number;
  search?: string;
  author?: string;
  keyword?: string;
  ids?: readonly number[];
  hasPdf?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'year' | 'type';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface FolderInput {
  name: string;
  parentId?: number | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export type FolderPatch = Partial<FolderInput>;

export interface FileInput {
  referenceId: number;
  fileName?: string;
  filePath: string;
  fileType?: FileType | string;
  mimeType?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  /** 不传时：该文献的第一个附件自动成为主附件。 */
  isPrimary?: boolean;
}

export interface FilePatch {
  fileName?: string;
  filePath?: string;
  fileType?: FileType | string;
  mimeType?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
}

export interface AttachedFile {
  id: number;
  referenceId: number;
  fileName: string;
  filePath: string;
  fileType: FileType;
  mimeType?: string;
  fileSize?: number;
  checksum?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseStatistics {
  references: number;
  folders: number;
  files: number;
  totalFileSize: number;
  byType: Array<{ type: string; count: number }>;
  byYear: Array<{ year: number; count: number }>;
}

export interface ReferenceDatabaseOptions {
  /** 数据库文件路径，或 ":memory:"。 */
  filename?: string;
  /** 只读模式（不建表、不写 WAL）。 */
  readonly?: boolean;
  /** 显式指定 schema.sql 路径（默认自动查找）。 */
  schemaPath?: string;
  /** SQLite busy timeout，毫秒，默认 5000。 */
  busyTimeout?: number;
  verbose?: (message?: unknown) => void;
}

interface NormalizedReference {
  type: ReferenceType;
  title: string;
  authors: string[];
  editors: string[];
  year: number | null;
  journal: string | null;
  booktitle: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  address: string | null;
  school: string | null;
  institution: string | null;
  organization: string | null;
  series: string | null;
  edition: string | null;
  chapter: string | null;
  month: string | null;
  note: string | null;
  language: string | null;
  isbn: string | null;
  issn: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  keywords: string[];
  bibtexKey: string;
  pdfPath: string | null;
  folderId: number | null;
  importedFrom: string | null;
}

function normalizeReferenceInput(
  input: Record<string, unknown>,
  options: { fallbackBibtexKey?: string } = {},
): NormalizedReference {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Reference must be an object');
  }

  const type = normalizeTypeSafe(input.type, 'type');
  const title = assertNonEmptyString(input.title, 'title');
  const authors = normalizeStringArray(input.authors, 'authors');
  const editors = normalizeStringArray(input.editors, 'editors');
  const year = normalizeYear(input.year);

  const doi = normalizeOptionalString(input.doi, 'doi');

  const rawBibtexKey = typeof input.bibtexKey === 'string' ? input.bibtexKey.trim() : '';
  let bibtexKey = sanitizeBibtexKey(rawBibtexKey);
  if (rawBibtexKey && !bibtexKey) {
    throw new ValidationError('bibtexKey contains no valid characters');
  }
  if (!bibtexKey && options.fallbackBibtexKey) {
    bibtexKey = sanitizeBibtexKey(options.fallbackBibtexKey);
  }
  if (!bibtexKey) {
    bibtexKey = generateBibtexKey({
      authors,
      year: year ?? undefined,
      title,
    });
  }
  if (!bibtexKey) {
    // generateBibtexKey 永远不会返回空串；此处仅作为防御。
    bibtexKey = `reference${Date.now()}`;
  }

  return {
    type,
    title,
    authors,
    editors,
    year,
    journal: normalizeOptionalString(input.journal, 'journal'),
    booktitle: normalizeOptionalString(input.booktitle, 'booktitle'),
    volume: normalizeOptionalString(input.volume, 'volume'),
    issue: normalizeOptionalString(input.issue, 'issue'),
    pages: normalizeOptionalString(input.pages, 'pages'),
    publisher: normalizeOptionalString(input.publisher, 'publisher'),
    address: normalizeOptionalString(input.address, 'address'),
    school: normalizeOptionalString(input.school, 'school'),
    institution: normalizeOptionalString(input.institution, 'institution'),
    organization: normalizeOptionalString(input.organization, 'organization'),
    series: normalizeOptionalString(input.series, 'series'),
    edition: normalizeOptionalString(input.edition, 'edition'),
    chapter: normalizeOptionalString(input.chapter, 'chapter'),
    month: normalizeOptionalString(input.month, 'month'),
    note: normalizeOptionalString(input.note, 'note'),
    language: normalizeOptionalString(input.language, 'language'),
    isbn: normalizeOptionalString(input.isbn, 'isbn'),
    issn: normalizeOptionalString(input.issn, 'issn'),
    doi: doi ? normalizeDoi(doi) || null : null,
    url: normalizeOptionalString(input.url, 'url'),
    abstract: normalizeOptionalString(input.abstract, 'abstract'),
    keywords: normalizeStringArray(input.keywords, 'keywords'),
    bibtexKey,
    pdfPath: normalizeOptionalString(input.pdfPath, 'pdfPath'),
    folderId: normalizeOptionalId(input.folderId, 'folderId'),
    // 兼容 v1 导入层使用的 sourceFormat 字段名。
    importedFrom: normalizeOptionalString(input.importedFrom ?? input.sourceFormat, 'importedFrom'),
  };
}

function referenceColumns(value: NormalizedReference, timestamp: string): Record<string, unknown> {
  return {
    type: value.type,
    title: value.title,
    authors: JSON.stringify(value.authors),
    editors: JSON.stringify(value.editors),
    year: value.year,
    journal: value.journal,
    booktitle: value.booktitle,
    volume: value.volume,
    issue: value.issue,
    pages: value.pages,
    publisher: value.publisher,
    address: value.address,
    school: value.school,
    institution: value.institution,
    organization: value.organization,
    series: value.series,
    edition: value.edition,
    chapter: value.chapter,
    month: value.month,
    note: value.note,
    language: value.language,
    isbn: value.isbn,
    issn: value.issn,
    doi: value.doi,
    url: value.url,
    abstract: value.abstract,
    keywords: JSON.stringify(value.keywords),
    bibtex_key: value.bibtexKey,
    pdf_path: value.pdfPath,
    folder_id: value.folderId,
    imported_from: value.importedFrom,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function referenceToRecord(reference: Reference): Record<string, unknown> {
  return {
    type: reference.type,
    title: reference.title,
    authors: reference.authors,
    editors: reference.editors,
    year: reference.year,
    journal: reference.journal,
    booktitle: reference.booktitle,
    volume: reference.volume,
    issue: reference.issue,
    pages: reference.pages,
    publisher: reference.publisher,
    address: reference.address,
    school: reference.school,
    institution: reference.institution,
    organization: reference.organization,
    series: reference.series,
    edition: reference.edition,
    chapter: reference.chapter,
    month: reference.month,
    note: reference.note,
    language: reference.language,
    isbn: reference.isbn,
    issn: reference.issn,
    doi: reference.doi,
    url: reference.url,
    abstract: reference.abstract,
    keywords: reference.keywords,
    bibtexKey: reference.bibtexKey,
    pdfPath: reference.pdfPath,
    folderId: reference.folderId,
    importedFrom: reference.importedFrom,
  };
}

const SORTABLE_COLUMNS: Readonly<Record<NonNullable<ReferenceQuery['sortBy']>, string>> =
  Object.freeze({
    createdAt: 'r.created_at',
    updatedAt: 'r.updated_at',
    title: 'r.title COLLATE NOCASE',
    year: 'r.year',
    type: 'r.type',
  });

function buildOrderBy(query: ReferenceQuery): string {
  const sortBy = query.sortBy ?? 'createdAt';
  const column = SORTABLE_COLUMNS[sortBy];
  if (!column) {
    throw new ValidationError(`Unsupported sortBy value: "${String(sortBy)}"`);
  }
  const directionInput = String(query.sortOrder ?? 'desc').toLowerCase();
  if (directionInput !== 'asc' && directionInput !== 'desc') {
    throw new ValidationError('sortOrder must be "asc" or "desc"');
  }
  const direction = directionInput === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}, r.id ${direction}`;
}

/* -------------------------------------------------------------------------- */
/* 主类                                                                        */
/* -------------------------------------------------------------------------- */

export class ReferenceDatabase {
  /** 进程内共享实例：同一个数据库文件只保留一个连接。 */
  private static readonly sharedInstances = new Map<string, ReferenceDatabase>();

  /**
   * 获取进程级单例（按数据库文件路径区分）。
   *
   * API 路由应统一使用该方法，避免每个路由文件各开一个 SQLite 连接、
   * 重复执行 schema。测试/脚本需要隔离连接时仍可直接 new。
   */
  static getInstance(
    filenameOrOptions?: string | ReferenceDatabaseOptions,
    maybeOptions: ReferenceDatabaseOptions = {},
  ): ReferenceDatabase {
    const settings =
      typeof filenameOrOptions === 'string'
        ? { ...maybeOptions, filename: filenameOrOptions }
        : { ...(filenameOrOptions ?? {}) };
    const rawFilename = settings.filename?.trim() || resolveDefaultDatabasePath();
    const key = rawFilename === ':memory:' ? ':memory:' : path.resolve(rawFilename);

    const existing = ReferenceDatabase.sharedInstances.get(key);
    if (existing && existing.isOpen) return existing;

    const created = new ReferenceDatabase({ ...settings, filename: key });
    ReferenceDatabase.sharedInstances.set(key, created);
    return created;
  }

  /** 关闭并清空所有单例连接（进程退出/测试 teardown 时调用）。 */
  static closeAll(): void {
    for (const instance of ReferenceDatabase.sharedInstances.values()) {
      if (instance.isOpen) instance.close();
    }
    ReferenceDatabase.sharedInstances.clear();
  }

  private db!: Database.Database;
  private readonly settings: ReferenceDatabaseOptions;
  private readonly filename: string;
  private readonly statements = new Map<string, Database.Statement>();
  private closed = false;

  /**
   * 打开（必要时创建）数据库并初始化 schema。
   * 兼容旧调用方式：new ReferenceDatabase('path/to.db')。
   */
  constructor(
    filenameOrOptions?: string | ReferenceDatabaseOptions,
    maybeOptions: ReferenceDatabaseOptions = {},
  ) {
    this.settings =
      typeof filenameOrOptions === 'string'
        ? { ...maybeOptions, filename: filenameOrOptions }
        : { ...(filenameOrOptions ?? {}) };

    this.filename = this.settings.filename?.trim() || resolveDefaultDatabasePath();
    const isMemory = this.filename === ':memory:';

    if (!isMemory && !this.settings.readonly) {
      try {
        fs.mkdirSync(path.dirname(path.resolve(this.filename)), { recursive: true });
      } catch (error) {
        throw wrapSqliteError(`Failed to create database directory for "${this.filename}"`, error);
      }
    }

    try {
      this.db = new Database(this.filename, {
        readonly: this.settings.readonly ?? false,
        fileMustExist: (this.settings.readonly ?? false) && !isMemory,
        timeout: this.settings.busyTimeout ?? 5000,
        ...(this.settings.verbose ? { verbose: this.settings.verbose } : {}),
      });
    } catch (error) {
      throw wrapSqliteError(`Failed to open database "${this.filename}"`, error);
    }

    try {
      this.db.pragma('foreign_keys = ON');
      this.db.pragma(`busy_timeout = ${this.settings.busyTimeout ?? 5000}`);
      if (!this.settings.readonly && !isMemory) {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
      }
      if (!this.settings.readonly) {
        this.initializeSchema();
      }
    } catch (error) {
      try {
        this.db.close();
      } catch {
        // 忽略关闭时的二次异常
      }
      this.closed = true;
      throw wrapSqliteError('Failed to initialize database', error);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 基础设施                                                                */
  /* ---------------------------------------------------------------------- */

  /** 底层 better-sqlite3 连接，供高级查询/迁移使用。 */
  get connection(): Database.Database {
    this.assertOpen();
    return this.db;
  }

  /** 当前 schema 版本（PRAGMA user_version）。 */
  getSchemaVersion(): number {
    const row = this.getOne<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  }

  /**
   * 在事务中执行任意操作：异常自动回滚，嵌套调用使用 SAVEPOINT。
   * 返回值原样透传。
   */
  transaction<T>(work: () => T): T {
    this.assertOpen();
    try {
      return this.db.transaction(work)();
    } catch (error) {
      throw wrapSqliteError('Transaction failed', error);
    }
  }

  /** 关闭连接；可重复调用。 */
  close(): void {
    if (this.closed) return;
    this.statements.clear();
    this.db.close();
    this.closed = true;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** 整理数据库文件（回收空间）。 */
  vacuum(): void {
    this.assertOpen();
    this.execute('VACUUM', () => this.db.exec('VACUUM'));
  }

  /** 让 SQLite 更新查询计划统计信息。 */
  optimize(): void {
    this.assertOpen();
    this.execute('PRAGMA optimize', () => this.db.exec('PRAGMA optimize'));
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new DatabaseError('Database connection is closed', { code: 'CLOSED' });
    }
  }

  private prepare(sql: string): Database.Statement {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  private all<T>(sql: string, params?: Record<string, unknown>): T[] {
    const statement = this.prepare(sql);
    const rows =
      params && Object.keys(params).length > 0 ? statement.all(params) : statement.all();
    return rows as unknown as T[];
  }

  private getOne<T>(sql: string, params?: Record<string, unknown>): T | undefined {
    const statement = this.prepare(sql);
    const row = params && Object.keys(params).length > 0 ? statement.get(params) : statement.get();
    return row as T | undefined;
  }

  private run(sql: string, params?: Record<string, unknown>): Database.RunResult {
    const statement = this.prepare(sql);
    return params && Object.keys(params).length > 0 ? statement.run(params) : statement.run();
  }

  private execute<T>(operation: string, work: () => T): T {
    try {
      return work();
    } catch (error) {
      throw wrapSqliteError(operation, error);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* schema                                                                  */
  /* ---------------------------------------------------------------------- */

  private initializeSchema(): void {
    const currentVersion = this.getSchemaVersion();
    if (currentVersion > SCHEMA_VERSION) {
      throw new DatabaseError(
        `Database schema version ${currentVersion} is newer than the supported version ${SCHEMA_VERSION}`,
        { code: 'SCHEMA_MISMATCH' },
      );
    }

    const schemaPath = this.resolveSchemaPath();
    let schemaSql: string;
    try {
      schemaSql = fs.readFileSync(schemaPath, 'utf8');
    } catch (error) {
      throw new DatabaseError(`Failed to read schema file "${schemaPath}"`, {
        code: 'SCHEMA_NOT_FOUND',
        cause: error,
      });
    }

    this.db.exec(schemaSql);
    this.assertSchemaColumns();
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    this.run(
      `INSERT INTO meta (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      { key: 'schema_version', value: String(SCHEMA_VERSION) },
    );
  }

  private resolveSchemaPath(): string {
    if (this.settings.schemaPath) {
      return path.resolve(this.settings.schemaPath);
    }

    const candidates: string[] = [];
    const environmentPath = process.env.REFERENCE_MANAGER_SCHEMA;
    if (environmentPath && environmentPath.trim()) {
      candidates.push(path.resolve(environmentPath));
    }

    const directories = new Set<string>();
    // CJS 下可直接拿到 __dirname；ESM（package.json type=module）下 typeof 为
    // "undefined"，不会抛 ReferenceError。
    if (typeof __dirname === 'string' && __dirname) {
      directories.add(__dirname);
      directories.add(path.resolve(__dirname, '..', '..', 'src', 'database'));
    }
    const entry = process.argv[1];
    if (entry) {
      const entryDirectory = path.dirname(path.resolve(entry));
      directories.add(entryDirectory);
      directories.add(path.resolve(entryDirectory, 'src', 'database'));
      directories.add(path.resolve(entryDirectory, '..', 'src', 'database'));
      directories.add(path.resolve(entryDirectory, '..', '..', 'src', 'database'));
    }
    directories.add(process.cwd());
    directories.add(path.resolve(process.cwd(), 'src', 'database'));
    directories.add(path.resolve(process.cwd(), 'dist', 'database'));

    for (const directory of directories) {
      candidates.push(path.join(directory, 'schema.sql'));
    }

    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // 继续尝试下一个候选路径
      }
    }

    throw new DatabaseError(
      `Unable to locate schema.sql. Searched:\n${candidates
        .map((candidate) => `  - ${candidate}`)
        .join('\n')}`,
      { code: 'SCHEMA_NOT_FOUND' },
    );
  }

  private assertSchemaColumns(): void {
    const tables: Array<[string, readonly string[]]> = [
      ['"references"', REQUIRED_REFERENCE_COLUMNS],
      ['folders', REQUIRED_FOLDER_COLUMNS],
      ['files', REQUIRED_FILE_COLUMNS],
    ];

    for (const [table, requiredColumns] of tables) {
      const rows = this.all<{ name: string }>(`PRAGMA table_info(${table})`);
      if (rows.length === 0) {
        throw new DatabaseError(
          `Database schema is incomplete: table ${table} does not exist. Delete "${this.filename}" or run a migration.`,
          { code: 'SCHEMA_MISMATCH' },
        );
      }
      const present = new Set(rows.map((row) => row.name));
      const missing = requiredColumns.filter((column) => !present.has(column));
      if (missing.length > 0) {
        throw new DatabaseError(
          `Database schema is outdated: ${table} is missing column(s) ${missing.join(', ')}. ` +
            `Delete "${this.filename}" and let the application recreate it, or run a migration.`,
          { code: 'SCHEMA_MISMATCH' },
        );
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 文件夹                                                                  */
  /* ---------------------------------------------------------------------- */

  /** 新建文件夹（旧签名）：返回新文件夹 id。 */
  createFolder(name: string, parentId?: number | null): number;
  /** 新建文件夹（类型化 API）：返回完整对象。 */
  createFolder(input: FolderInput): Folder;
  createFolder(input: string | FolderInput, parentId?: number | null): number | Folder {
    this.assertOpen();
    return this.transaction(() => {
      const data: FolderInput =
        typeof input === 'string' ? { name: input, parentId: parentId ?? null } : input;
      const name = assertNonEmptyString(data.name, 'name');
      const resolvedParentId = normalizeOptionalId(data.parentId, 'parentId');

      if (resolvedParentId !== null) {
        this.assertFolderExists(resolvedParentId);
      }
      this.assertSiblingNameAvailable(name, resolvedParentId);

      const timestamp = nowIso();
      const info = this.run(
        `INSERT INTO folders (name, parent_id, description, color, sort_order, created_at, updated_at)
         VALUES (@name, @parentId, @description, @color, @sortOrder, @createdAt, @updatedAt)`,
        {
          name,
          parentId: resolvedParentId,
          description: normalizeOptionalString(data.description, 'description'),
          color: normalizeOptionalString(data.color, 'color'),
          sortOrder: normalizeOptionalInteger(data.sortOrder, 'sortOrder') ?? 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      );

      const folder = this.getFolder(Number(info.lastInsertRowid));
      if (!folder) {
        throw new DatabaseError('Inserted folder could not be read back', { code: 'DATABASE_ERROR' });
      }
      return typeof input === 'string' ? (folder.id as number) : folder;
    });
  }

  getFolder(id: number): Folder | null {
    this.assertOpen();
    const folderId = requirePositiveInteger(id, 'id');
    const row = this.getOne<FolderRow>(
      `SELECT f.id, f.name, f.parent_id, f.description, f.color, f.sort_order,
              f.created_at, f.updated_at,
              (SELECT COUNT(*) FROM "references" r WHERE r.folder_id = f.id) AS reference_count
         FROM folders f
        WHERE f.id = @id`,
      { id: folderId },
    );
    return row ? rowToFolder(row) : null;
  }

  /** 扁平列表（含直接文献数），按 sort_order、名称排序。 */
  listFolders(): Folder[] {
    this.assertOpen();
    return this.execute('List folders', () => {
      const rows = this.all<FolderRow>(
        `SELECT f.id, f.name, f.parent_id, f.description, f.color, f.sort_order,
                f.created_at, f.updated_at,
                (SELECT COUNT(*) FROM "references" r WHERE r.folder_id = f.id) AS reference_count
           FROM folders f
          ORDER BY f.sort_order ASC, f.name COLLATE NOCASE ASC`,
      );
      return rows.map(rowToFolder);
    });
  }

  /** 兼容旧接口：getFolders() === listFolders()。 */
  getFolders(): Folder[] {
    return this.listFolders();
  }

  /** 树形结构；children 始终为数组（叶子节点为空数组）。 */
  getFolderTree(): Folder[] {
    const folders = this.listFolders();
    const byId = new Map<number, Folder>();
    for (const folder of folders) {
      folder.children = [];
      byId.set(folder.id as number, folder);
    }

    const roots: Folder[] = [];
    for (const folder of folders) {
      const parentId = folder.parentId ?? null;
      if (parentId !== null && byId.has(parentId)) {
        (byId.get(parentId) as Folder).children?.push(folder);
      } else {
        roots.push(folder);
      }
    }
    return roots;
  }

  /** 从根到当前文件夹的路径（含自身）。 */
  getFolderPath(id: number): Folder[] {
    this.assertOpen();
    const folderId = requirePositiveInteger(id, 'id');
    const rows = this.all<{ id: number; name: string }>(
      `WITH RECURSIVE chain(id, name, parent_id, depth) AS (
         SELECT id, name, parent_id, 0 FROM folders WHERE id = @id
         UNION ALL
         SELECT f.id, f.name, f.parent_id, chain.depth + 1
           FROM folders f
           JOIN chain ON f.id = chain.parent_id
       )
       SELECT id, name FROM chain ORDER BY depth DESC`,
      { id: folderId },
    );
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  /** 子文件夹 id 列表（含自身，递归）。 */
  getFolderDescendantIds(id: number): number[] {
    this.assertOpen();
    const folderId = requirePositiveInteger(id, 'id');
    const rows = this.all<{ id: number }>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM folders WHERE id = @id
         UNION ALL
         SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
       )
       SELECT id FROM subtree`,
      { id: folderId },
    );
    return rows.map((row) => row.id);
  }

  /** 更新文件夹；支持改名、移动、描述、颜色、排序。 */
  updateFolder(id: number, patch: FolderPatch): Folder {
    this.assertOpen();
    return this.transaction(() => {
      const folderId = requirePositiveInteger(id, 'id');
      const current = this.getFolder(folderId);
      if (!current) {
        throw new NotFoundError(`Folder ${folderId} does not exist`);
      }
      if (!patch || typeof patch !== 'object') {
        throw new ValidationError('Folder patch must be an object');
      }

      const columns: Record<string, unknown> = {};
      if (patch.name !== undefined) {
        columns.name = assertNonEmptyString(patch.name, 'name');
      }
      if (patch.parentId !== undefined) {
        columns.parent_id = normalizeOptionalId(patch.parentId, 'parentId');
      }
      if (patch.description !== undefined) {
        columns.description = normalizeOptionalString(patch.description, 'description');
      }
      if (patch.color !== undefined) {
        columns.color = normalizeOptionalString(patch.color, 'color');
      }
      if (patch.sortOrder !== undefined) {
        columns.sort_order = requireNonNegativeInteger(patch.sortOrder, 'sortOrder');
      }

      if (Object.keys(columns).length === 0) return current;

      const effectiveParentId =
        'parent_id' in columns
          ? (columns.parent_id as number | null)
          : (current.parentId ?? null);
      const effectiveName = columns.name !== undefined ? String(columns.name) : current.name;

      if ('parent_id' in columns && effectiveParentId !== null) {
        if (effectiveParentId === folderId) {
          throw new ValidationError('A folder cannot be its own parent');
        }
        this.assertFolderExists(effectiveParentId);
        if (this.isFolderDescendant(effectiveParentId, folderId)) {
          throw new ValidationError('Cannot move a folder into one of its own descendants');
        }
      }

      this.assertSiblingNameAvailable(effectiveName, effectiveParentId, folderId);

      columns.updated_at = nowIso();
      const assignments = Object.keys(columns)
        .map((column) => `${column} = @${column}`)
        .join(', ');
      this.run(`UPDATE folders SET ${assignments} WHERE id = @__id`, {
        ...columns,
        __id: folderId,
      });

      const updated = this.getFolder(folderId);
      if (!updated) {
        throw new DatabaseError(`Folder ${folderId} disappeared during update`, {
          code: 'DATABASE_ERROR',
        });
      }
      return updated;
    });
  }

  /** 移动文件夹到新父节点（null 表示根）。 */
  moveFolder(id: number, parentId: number | null): Folder {
    return this.updateFolder(id, { parentId });
  }

  /**
   * 删除文件夹。
   *
   * 默认删除整棵子树，子树中的文献变为“未分类”（folder_id = NULL）。
   * 传入 deleteChildren: false 时，直接子文件夹会被提升到当前父节点。
   * 传入 moveReferencesTo 可把文献移到指定文件夹（默认 null）。
   */
  deleteFolder(
    id: number,
    options: { deleteChildren?: boolean; moveReferencesTo?: number | null } = {},
  ): boolean {
    this.assertOpen();
    return this.transaction(() => {
      const folderId = requirePositiveInteger(id, 'id');
      const folder = this.getFolder(folderId);
      if (!folder) return false;

      const deleteChildren = options.deleteChildren ?? true;
      const destination =
        options.moveReferencesTo === undefined
          ? null
          : normalizeOptionalId(options.moveReferencesTo, 'moveReferencesTo');

      if (destination !== null) {
        this.assertFolderExists(destination);
        if (destination === folderId || this.isFolderDescendant(destination, folderId)) {
          throw new ValidationError(
            'moveReferencesTo must not point to the folder being deleted or one of its descendants',
          );
        }
      }

      const timestamp = nowIso();

      if (deleteChildren) {
        this.run(
          `WITH RECURSIVE subtree(id) AS (
             SELECT id FROM folders WHERE id = @id
             UNION ALL
             SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
           )
           UPDATE "references"
              SET folder_id = @destination, updated_at = @updatedAt
            WHERE folder_id IN (SELECT id FROM subtree)`,
          { id: folderId, destination, updatedAt: timestamp },
        );
      } else {
        this.run(
          `UPDATE "references" SET folder_id = @destination, updated_at = @updatedAt
            WHERE folder_id = @id`,
          { id: folderId, destination, updatedAt: timestamp },
        );
        this.run(
          `UPDATE folders SET parent_id = @parentId, updated_at = @updatedAt
            WHERE parent_id = @id`,
          { id: folderId, parentId: folder.parentId ?? null, updatedAt: timestamp },
        );
      }

      const info = this.run('DELETE FROM folders WHERE id = @id', { id: folderId });
      return info.changes > 0;
    });
  }

  private assertFolderExists(id: number): void {
    const row = this.getOne<{ id: number }>('SELECT id FROM folders WHERE id = @id', { id });
    if (!row) {
      throw new NotFoundError(`Folder ${id} does not exist`);
    }
  }

  private assertSiblingNameAvailable(
    name: string,
    parentId: number | null,
    excludeId?: number,
  ): void {
    const row = this.getOne<{ id: number }>(
      `SELECT id FROM folders
        WHERE name = @name COLLATE NOCASE
          AND ((@parentId IS NULL AND parent_id IS NULL) OR parent_id = @parentId)
          AND (@excludeId IS NULL OR id <> @excludeId)`,
      { name, parentId, excludeId: excludeId ?? null },
    );
    if (row) {
      throw new DuplicateError(`A folder named "${name}" already exists at this level`);
    }
  }

  private isFolderDescendant(candidateId: number, ancestorId: number): boolean {
    const row = this.getOne<{ found: number }>(
      `WITH RECURSIVE ancestors(id) AS (
         SELECT id FROM folders WHERE id = @candidateId
         UNION ALL
         SELECT f.parent_id FROM folders f JOIN ancestors a ON f.id = a.id
          WHERE f.parent_id IS NOT NULL
       )
       SELECT 1 AS found FROM ancestors WHERE id = @ancestorId LIMIT 1`,
      { candidateId, ancestorId },
    );
    return row !== undefined;
  }

  /* ---------------------------------------------------------------------- */
  /* 文献                                                                    */
  /* ---------------------------------------------------------------------- */

  /** 新建文献（旧签名）：返回新文献 id。 */
  createReference(input: ReferenceInput): number {
    return this.addReference(input).id as number;
  }

  /** 新建文献（类型化 API）：返回完整对象，自动生成唯一 bibtexKey。 */
  addReference(input: ReferenceInput): Reference {
    this.assertOpen();
    return this.transaction(() => this.persistReference(input));
  }

  /**
   * 批量新建文献（单事务，任一失败全部回滚）。
   * 适合导入 RIS / WoS / BibTeX 时使用。
   */
  createReferences(inputs: readonly ReferenceInput[]): Reference[] {
    this.assertOpen();
    if (!Array.isArray(inputs) || inputs.length === 0) return [];
    return this.transaction(() => inputs.map((input) => this.persistReference(input)));
  }

  private persistReference(input: ReferenceInput): Reference {
    const normalized = normalizeReferenceInput(input as unknown as Record<string, unknown>);
    if (normalized.folderId !== null) {
      this.assertFolderExists(normalized.folderId);
    }
    normalized.bibtexKey = this.uniqueBibtexKey(normalized.bibtexKey);

    const columns = referenceColumns(normalized, nowIso());
    const names = Object.keys(columns);
    const info = this.run(
      `INSERT INTO "references" (${names.join(', ')})
       VALUES (${names.map((name) => `@${name}`).join(', ')})`,
      columns,
    );

    const created = this.getReferenceById(Number(info.lastInsertRowid));
    if (!created) {
      throw new DatabaseError('Inserted reference could not be read back', {
        code: 'DATABASE_ERROR',
      });
    }
    return created;
  }

  getReferenceById(id: number): Reference | null {
    this.assertOpen();
    const referenceId = requirePositiveInteger(id, 'id');
    const row = this.getOne<ReferenceRow>('SELECT * FROM "references" WHERE id = @id', {
      id: referenceId,
    });
    return row ? rowToReference(row) : null;
  }

  getReferenceByBibtexKey(key: string): Reference | null {
    this.assertOpen();
    const sanitized = sanitizeBibtexKey(key);
    if (!sanitized) return null;
    const row = this.getOne<ReferenceRow>(
      'SELECT * FROM "references" WHERE bibtex_key = @key COLLATE NOCASE',
      { key: sanitized },
    );
    return row ? rowToReference(row) : null;
  }

  findReferencesByDoi(doi: string): Reference[] {
    this.assertOpen();
    const normalized = normalizeDoi(doi);
    if (!normalized) return [];
    return this.execute('Find references by DOI', () => {
      const rows = this.all<ReferenceRow>(
        'SELECT * FROM "references" WHERE lower(doi) = lower(@doi) ORDER BY year DESC, id DESC',
        { doi: normalized },
      );
      return rows.map(rowToReference);
    });
  }

  hasReference(id: number): boolean {
    this.assertOpen();
    const referenceId = requirePositiveInteger(id, 'id');
    return (
      this.getOne<{ id: number }>('SELECT id FROM "references" WHERE id = @id', {
        id: referenceId,
      }) !== undefined
    );
  }

  /**
   * 查询文献列表。
   * 兼容旧签名：getReferences(folderId?, search?)。
   */
  getReferences(folderIdOrQuery?: number | ReferenceQuery, search?: string): Reference[] {
    if (typeof folderIdOrQuery === 'number') {
      return this.listReferences({ folderId: folderIdOrQuery, search });
    }
    return this.listReferences({
      ...(folderIdOrQuery ?? {}),
      ...(search ? { search } : {}),
    });
  }

  listReferences(query: ReferenceQuery = {}): Reference[] {
    this.assertOpen();
    return this.execute('List references', () => {
      const filter = this.buildReferenceFilter(query);
      const params: Record<string, unknown> = { ...filter.params };

      let sql = filter.cte ? `${filter.cte} ` : '';
      sql += 'SELECT r.* FROM "references" r';
      if (filter.where) sql += ` WHERE ${filter.where}`;
      sql += ` ORDER BY ${buildOrderBy(query)}`;

      if (query.limit !== undefined) {
        params.limit = requirePositiveInteger(query.limit, 'limit');
        sql += ' LIMIT @limit';
      } else if (query.offset !== undefined) {
        sql += ' LIMIT -1';
      }
      if (query.offset !== undefined) {
        params.offset = requireNonNegativeInteger(query.offset, 'offset');
        sql += ' OFFSET @offset';
      }

      const rows = this.all<ReferenceRow>(sql, params);
      return rows.map(rowToReference);
    });
  }

  countReferences(query: ReferenceQuery = {}): number {
    this.assertOpen();
    return this.execute('Count references', () => {
      const filter = this.buildReferenceFilter(query);
      let sql = filter.cte ? `${filter.cte} ` : '';
      sql += 'SELECT COUNT(*) AS count FROM "references" r';
      if (filter.where) sql += ` WHERE ${filter.where}`;
      const row = this.getOne<{ count: number }>(sql, filter.params);
      return row?.count ?? 0;
    });
  }

  /** 局部更新文献；未提供的字段保持不变，显式 null 表示清空。 */
  updateReference(id: number, patch: ReferencePatch): Reference {
    this.assertOpen();
    return this.transaction(() => {
      const referenceId = requirePositiveInteger(id, 'id');
      const current = this.getReferenceById(referenceId);
      if (!current) {
        throw new NotFoundError(`Reference ${referenceId} does not exist`);
      }
      if (!patch || typeof patch !== 'object') {
        throw new ValidationError('Reference patch must be an object');
      }

      const merged = referenceToRecord(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) merged[key] = value;
      }

      const normalized = normalizeReferenceInput(merged, {
        fallbackBibtexKey: current.bibtexKey,
      });
      if (normalized.folderId !== null) {
        this.assertFolderExists(normalized.folderId);
      }
      normalized.bibtexKey = this.uniqueBibtexKey(normalized.bibtexKey, referenceId);

      const columns = referenceColumns(normalized, nowIso());
      delete columns.created_at;
      const assignments = Object.keys(columns)
        .map((column) => `${column} = @${column}`)
        .join(', ');
      this.run(`UPDATE "references" SET ${assignments} WHERE id = @__id`, {
        ...columns,
        __id: referenceId,
      });

      const updated = this.getReferenceById(referenceId);
      if (!updated) {
        throw new DatabaseError(`Reference ${referenceId} disappeared during update`, {
          code: 'DATABASE_ERROR',
        });
      }
      return updated;
    });
  }

  /** 删除单条文献；附件由外键级联删除。返回是否真的有记录被删除。 */
  deleteReference(id: number): boolean {
    this.assertOpen();
    const referenceId = requirePositiveInteger(id, 'id');
    const info = this.execute('Delete reference', () =>
      this.run('DELETE FROM "references" WHERE id = @id', { id: referenceId }),
    );
    return info.changes > 0;
  }

  /** 批量删除文献（单事务），返回删除条数。 */
  deleteReferences(ids: readonly number[]): number {
    this.assertOpen();
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    return this.transaction(() => {
      const params: Record<string, unknown> = {};
      const placeholders = ids.map((id, index) => {
        const key = `id${index}`;
        params[key] = requirePositiveInteger(id, 'id');
        return `@${key}`;
      });
      return this.run(
        `DELETE FROM "references" WHERE id IN (${placeholders.join(', ')})`,
        params,
      ).changes;
    });
  }

  /** 批量移动文献到指定文件夹（null 表示未分类），返回受影响行数。 */
  moveReferences(ids: readonly number[], folderId: number | null): number {
    this.assertOpen();
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const destination = normalizeOptionalId(folderId, 'folderId');
    if (destination !== null) {
      this.assertFolderExists(destination);
    }
    return this.transaction(() => {
      const params: Record<string, unknown> = {
        folderId: destination,
        updatedAt: nowIso(),
      };
      const placeholders = ids.map((id, index) => {
        const key = `id${index}`;
        params[key] = requirePositiveInteger(id, 'id');
        return `@${key}`;
      });
      return this.run(
        `UPDATE "references" SET folder_id = @folderId, updated_at = @updatedAt
          WHERE id IN (${placeholders.join(', ')})`,
        params,
      ).changes;
    });
  }

  private buildReferenceFilter(query: ReferenceQuery): {
    cte: string;
    where: string;
    params: Record<string, unknown>;
  } {
    if (!query || typeof query !== 'object') {
      throw new ValidationError('Reference query must be an object');
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    let cte = '';

    if (query.folderId !== undefined) {
      if (query.folderId === null) {
        conditions.push('r.folder_id IS NULL');
      } else {
        params.folderId = requirePositiveInteger(query.folderId, 'folderId');
        if (query.includeSubfolders) {
          cte = `WITH RECURSIVE folder_subtree(id) AS (
            SELECT id FROM folders WHERE id = @folderId
            UNION ALL
            SELECT f.id FROM folders f JOIN folder_subtree s ON f.parent_id = s.id
          )`;
          conditions.push('r.folder_id IN (SELECT id FROM folder_subtree)');
        } else {
          conditions.push('r.folder_id = @folderId');
        }
      }
    }

    const rawType = query.type;
    const requestedTypes: Array<ReferenceType | string> =
      rawType === undefined
        ? []
        : Array.isArray(rawType)
          ? (rawType as readonly ReferenceType[]).slice()
          : [rawType as ReferenceType];

    if (requestedTypes.length > 0) {
      const placeholders = requestedTypes.map((type, index) => {
        const key = `type${index}`;
        params[key] = normalizeTypeSafe(type, 'type');
        return `@${key}`;
      });
      conditions.push(`r.type IN (${placeholders.join(', ')})`);
    }

    if (query.year !== undefined) {
      params.year = normalizeYear(query.year);
      conditions.push('r.year = @year');
    }

    if (query.search !== undefined && String(query.search).trim() !== '') {
      params.search = `%${escapeLike(String(query.search).trim())}%`;
      const searchable = [
        'r.title',
        'r.authors',
        'r.journal',
        'r.booktitle',
        'r.keywords',
        'r.doi',
        'r.abstract',
        'r.publisher',
      ];
      conditions.push(
        `(${searchable.map((column) => `${column} LIKE @search ESCAPE '\\'`).join(' OR ')})`,
      );
    }

    if (query.author !== undefined && String(query.author).trim() !== '') {
      params.author = `%${escapeLike(String(query.author).trim())}%`;
      conditions.push(
        `EXISTS (SELECT 1 FROM json_each(r.authors) AS author
                  WHERE author.value LIKE @author ESCAPE '\\')`,
      );
    }

    if (query.keyword !== undefined && String(query.keyword).trim() !== '') {
      params.keyword = String(query.keyword).trim();
      conditions.push(
        `EXISTS (SELECT 1 FROM json_each(r.keywords) AS keyword
                  WHERE lower(keyword.value) = lower(@keyword))`,
      );
    }

    if (query.ids !== undefined) {
      if (query.ids.length === 0) {
        conditions.push('0 = 1');
      } else {
        const placeholders = query.ids.map((id, index) => {
          const key = `filterId${index}`;
          params[key] = requirePositiveInteger(id, 'id');
          return `@${key}`;
        });
        conditions.push(`r.id IN (${placeholders.join(', ')})`);
      }
    }

    if (query.hasPdf !== undefined) {
      conditions.push(query.hasPdf ? 'r.pdf_path IS NOT NULL' : 'r.pdf_path IS NULL');
    }

    return {
      cte,
      where: conditions.join(' AND '),
      params,
    };
  }

  private uniqueBibtexKey(base: string, excludeId?: number): string {
    const normalizedBase = sanitizeBibtexKey(base) || 'reference';
    let candidate = normalizedBase;
    let suffixIndex = 0;

    const exists = (key: string): boolean => {
      if (excludeId === undefined) {
        return (
          this.getOne<{ id: number }>(
            'SELECT id FROM "references" WHERE bibtex_key = @key COLLATE NOCASE',
            { key },
          ) !== undefined
        );
      }
      return (
        this.getOne<{ id: number }>(
          'SELECT id FROM "references" WHERE bibtex_key = @key COLLATE NOCASE AND id <> @excludeId',
          { key, excludeId },
        ) !== undefined
      );
    };

    while (exists(candidate)) {
      suffixIndex += 1;
      candidate = `${normalizedBase}${alphabeticSuffix(suffixIndex)}`;
    }
    return candidate;
  }

  /* ---------------------------------------------------------------------- */
  /* 附件                                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * 添加附件（旧签名）：返回附件 id。
   * 第一个附件自动成为主附件。
   */
  attachFile(
    referenceId: number,
    fileName: string,
    filePath: string,
    fileType: string = 'pdf',
    isPrimary: boolean = false,
  ): number {
    return this.addFile({ referenceId, fileName, filePath, fileType, isPrimary }).id;
  }

  /**
   * 添加附件（类型化 API）。第一个附件自动设为主附件，并同步
   * references.pdf_path。同一文献下路径重复会抛 DuplicateError。
   */
  addFile(input: FileInput): AttachedFile {
    this.assertOpen();
    return this.transaction(() => {
      if (!input || typeof input !== 'object') {
        throw new ValidationError('File input must be an object');
      }
      const referenceId = requirePositiveInteger(input.referenceId, 'referenceId');
      this.assertReferenceExists(referenceId);

      const filePath = assertNonEmptyString(input.filePath, 'filePath');
      const fileName = assertNonEmptyString(
        input.fileName ?? path.basename(filePath),
        'fileName',
      );
      const fileType = normalizeFileType(input.fileType ?? inferFileType(filePath));
      const fileSize =
        input.fileSize === undefined
          ? inferFileSize(filePath)
          : normalizeOptionalInteger(input.fileSize, 'fileSize');
      const mimeType =
        input.mimeType === undefined
          ? (MIME_TYPES[fileType] ?? null)
          : normalizeOptionalString(input.mimeType, 'mimeType');
      const checksum = normalizeOptionalString(input.checksum, 'checksum');

      const duplicate = this.getOne<{ id: number }>(
        `SELECT id FROM files WHERE reference_id = @referenceId AND file_path = @filePath`,
        { referenceId, filePath },
      );
      if (duplicate) {
        throw new DuplicateError(
          `File "${filePath}" is already attached to reference ${referenceId}`,
        );
      }

      const countRow = this.getOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM files WHERE reference_id = @referenceId',
        { referenceId },
      );
      const isPrimary = input.isPrimary ?? (countRow?.count ?? 0) === 0;
      const timestamp = nowIso();

      if (isPrimary) {
        this.clearPrimaryFile(referenceId, timestamp);
      }

      const info = this.run(
        `INSERT INTO files
           (reference_id, file_name, file_path, file_type, mime_type, file_size,
            checksum, is_primary, created_at, updated_at)
         VALUES
           (@referenceId, @fileName, @filePath, @fileType, @mimeType, @fileSize,
            @checksum, @isPrimary, @createdAt, @updatedAt)`,
        {
          referenceId,
          fileName,
          filePath,
          fileType,
          mimeType,
          fileSize,
          checksum,
          isPrimary: isPrimary ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      );

      if (isPrimary) {
        this.syncPdfPath(referenceId);
      }

      const attached = this.getFile(Number(info.lastInsertRowid));
      if (!attached) {
        throw new DatabaseError('Inserted file could not be read back', {
          code: 'DATABASE_ERROR',
        });
      }
      return attached;
    });
  }

  getFile(id: number): AttachedFile | null {
    this.assertOpen();
    const fileId = requirePositiveInteger(id, 'id');
    const row = this.getOne<FileRow>('SELECT * FROM files WHERE id = @id', { id: fileId });
    return row ? rowToFile(row) : null;
  }

  getFileByPath(filePath: string): AttachedFile | null {
    this.assertOpen();
    const normalized = assertNonEmptyString(filePath, 'filePath');
    const row = this.getOne<FileRow>('SELECT * FROM files WHERE file_path = @filePath', {
      filePath: normalized,
    });
    return row ? rowToFile(row) : null;
  }

  listFiles(referenceId: number): AttachedFile[] {
    this.assertOpen();
    const id = requirePositiveInteger(referenceId, 'referenceId');
    return this.execute('List files', () => {
      const rows = this.all<FileRow>(
        'SELECT * FROM files WHERE reference_id = @referenceId ORDER BY is_primary DESC, id ASC',
        { referenceId: id },
      );
      return rows.map(rowToFile);
    });
  }

  /** 兼容旧接口：getFiles() === listFiles()。 */
  getFiles(referenceId: number | undefined): AttachedFile[] {
    if (referenceId === undefined || referenceId === null) {
      throw new ValidationError('referenceId is required');
    }
    return this.listFiles(referenceId);
  }

  /** 设为主附件（同一文献其他附件自动取消主状态）。 */
  setPrimaryFile(fileId: number): AttachedFile {
    this.assertOpen();
    return this.transaction(() => {
      const id = requirePositiveInteger(fileId, 'id');
      const file = this.getFile(id);
      if (!file) {
        throw new NotFoundError(`File ${id} does not exist`);
      }
      this.clearPrimaryFile(file.referenceId, nowIso());
      this.run('UPDATE files SET is_primary = 1, updated_at = @updatedAt WHERE id = @id', {
        id,
        updatedAt: nowIso(),
      });
      this.syncPdfPath(file.referenceId);

      const updated = this.getFile(id);
      if (!updated) {
        throw new DatabaseError(`File ${id} disappeared during update`, {
          code: 'DATABASE_ERROR',
        });
      }
      return updated;
    });
  }

  updateFile(id: number, patch: FilePatch): AttachedFile {
    this.assertOpen();
    return this.transaction(() => {
      const fileId = requirePositiveInteger(id, 'id');
      const file = this.getFile(fileId);
      if (!file) {
        throw new NotFoundError(`File ${fileId} does not exist`);
      }
      if (!patch || typeof patch !== 'object') {
        throw new ValidationError('File patch must be an object');
      }

      const columns: Record<string, unknown> = {};
      if (patch.fileName !== undefined) {
        columns.file_name = assertNonEmptyString(patch.fileName, 'fileName');
      }
      if (patch.filePath !== undefined) {
        columns.file_path = assertNonEmptyString(patch.filePath, 'filePath');
      }
      if (patch.fileType !== undefined) {
        columns.file_type = normalizeFileType(patch.fileType);
      }
      if (patch.mimeType !== undefined) {
        columns.mime_type = normalizeOptionalString(patch.mimeType, 'mimeType');
      }
      if (patch.fileSize !== undefined) {
        columns.file_size = normalizeOptionalInteger(patch.fileSize, 'fileSize');
      }
      if (patch.checksum !== undefined) {
        columns.checksum = normalizeOptionalString(patch.checksum, 'checksum');
      }

      if (Object.keys(columns).length === 0) return file;

      if (columns.file_path !== undefined) {
        const duplicate = this.getOne<{ id: number }>(
          `SELECT id FROM files
            WHERE reference_id = @referenceId AND file_path = @filePath AND id <> @id`,
          {
            referenceId: file.referenceId,
            filePath: columns.file_path,
            id: fileId,
          },
        );
        if (duplicate) {
          throw new DuplicateError(
            `File "${String(columns.file_path)}" is already attached to reference ${file.referenceId}`,
          );
        }
      }

      columns.updated_at = nowIso();
      const assignments = Object.keys(columns)
        .map((column) => `${column} = @${column}`)
        .join(', ');
      this.run(`UPDATE files SET ${assignments} WHERE id = @__id`, {
        ...columns,
        __id: fileId,
      });

      this.syncPdfPath(file.referenceId);

      const updated = this.getFile(fileId);
      if (!updated) {
        throw new DatabaseError(`File ${fileId} disappeared during update`, {
          code: 'DATABASE_ERROR',
        });
      }
      return updated;
    });
  }

  /** 删除附件；若删除的是主附件，自动把下一个附件设为主附件。 */
  deleteFile(id: number): boolean {
    this.assertOpen();
    return this.transaction(() => {
      const fileId = requirePositiveInteger(id, 'id');
      const file = this.getFile(fileId);
      if (!file) return false;

      this.run('DELETE FROM files WHERE id = @id', { id: fileId });

      if (file.isPrimary) {
        const next = this.getOne<{ id: number }>(
          `SELECT id FROM files WHERE reference_id = @referenceId
            ORDER BY created_at ASC, id ASC LIMIT 1`,
          { referenceId: file.referenceId },
        );
        if (next) {
          this.run('UPDATE files SET is_primary = 1 WHERE id = @id', { id: next.id });
        }
      }

      this.syncPdfPath(file.referenceId);
      return true;
    });
  }

  private clearPrimaryFile(referenceId: number, timestamp: string): void {
    this.run(
      `UPDATE files SET is_primary = 0, updated_at = @updatedAt
        WHERE reference_id = @referenceId AND is_primary = 1`,
      { referenceId, updatedAt: timestamp },
    );
  }

  /** 让 references.pdf_path 始终指向主附件（没有附件则置空）。 */
  private syncPdfPath(referenceId: number): void {
    this.run(
      `UPDATE "references"
          SET pdf_path = (SELECT file_path FROM files
                           WHERE reference_id = @referenceId
                           ORDER BY is_primary DESC, id ASC LIMIT 1),
              updated_at = @updatedAt
        WHERE id = @referenceId`,
      { referenceId, updatedAt: nowIso() },
    );
  }

  private assertReferenceExists(id: number): void {
    const row = this.getOne<{ id: number }>('SELECT id FROM "references" WHERE id = @id', {
      id,
    });
    if (!row) {
      throw new NotFoundError(`Reference ${id} does not exist`);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 统计                                                                    */
  /* ---------------------------------------------------------------------- */

  getStatistics(): DatabaseStatistics {
    this.assertOpen();
    return this.execute('Compute statistics', () => {
      const references =
        this.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM "references"')?.count ?? 0;
      const folders =
        this.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM folders')?.count ?? 0;
      const fileStats =
        this.getOne<{ count: number; total: number | null }>(
          'SELECT COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS total FROM files',
        ) ?? { count: 0, total: 0 };

      const byType = this.all<{ type: string; count: number }>(
        `SELECT type, COUNT(*) AS count FROM "references"
          GROUP BY type ORDER BY count DESC, type ASC`,
      );
      const byYear = this.all<{ year: number; count: number }>(
        `SELECT year, COUNT(*) AS count FROM "references"
          WHERE year IS NOT NULL GROUP BY year ORDER BY year DESC`,
      );

      return {
        references,
        folders,
        files: fileStats.count,
        totalFileSize: fileStats.total ?? 0,
        byType,
        byYear,
      };
    });
  }
}

/* -------------------------------------------------------------------------- */
/* 文件元数据推断                                                              */
/* -------------------------------------------------------------------------- */

function inferFileType(filePath: string): FileType {
  const extension = path.extname(filePath).toLowerCase().replace(/^\./, '');
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'htm':
    case 'html':
      return 'html';
    case 'txt':
    case 'text':
      return 'txt';
    case 'doc':
      return 'doc';
    case 'docx':
      return 'docx';
    case 'epub':
      return 'epub';
    default:
      return 'other';
  }
}

function inferFileSize(filePath: string): number | null {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

export default ReferenceDatabase;
