// 引文类型定义

/** BibTeX 支持的文献类型（数据库 type 列使用同一组取值）。 */
export type ReferenceType =
  | 'article'
  | 'inproceedings'
  | 'book'
  | 'masterthesis'
  | 'phdthesis'
  | 'incollection'
  | 'misc';

/** 数据库允许的所有文献类型，顺序与 schema.sql 的 CHECK 约束一致。 */
export const REFERENCE_TYPES: readonly ReferenceType[] = [
  'article',
  'inproceedings',
  'book',
  'masterthesis',
  'phdthesis',
  'incollection',
  'misc',
];

export function isReferenceType(value: unknown): value is ReferenceType {
  return typeof value === 'string' && (REFERENCE_TYPES as readonly string[]).includes(value);
}

export interface Reference {
  id?: number;
  type: ReferenceType;
  title: string;
  authors: string[];
  /** 编者；BibTeX 导出的 @book / @incollection 会使用该字段。 */
  editors?: string[];
  year?: number;
  journal?: string;
  booktitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  abstract?: string;
  keywords?: string[];
  publisher?: string;
  address?: string;
  school?: string;
  /** 学位论文授予单位（与 school 同义，导入时二选一）。 */
  institution?: string;
  /** 会议/机构组织者。 */
  organization?: string;
  series?: string;
  edition?: string;
  chapter?: string;
  /** 出版月份；可为 1-12 或 "January" / "jan"。 */
  month?: string | number;
  note?: string;
  language?: string;
  isbn?: string;
  issn?: string;
  url?: string;
  /** 非标准出版方式（@misc）。 */
  howpublished?: string;

  // 文件关联
  pdfPath?: string;

  // 分类
  folderId?: number;

  // 元数据
  importedFrom?: string;
  createdAt?: string;
  updatedAt?: string;

  // BibTeX生成需要的key
  bibtexKey?: string;
}

export interface Folder {
  id?: number;
  name: string;
  parentId?: number | null;
  description?: string;
  color?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  children?: Folder[];
  referenceCount?: number;
}

export interface ImportResult {
  success: number;
  failed: number;
  references: Reference[];
  errors: string[];
}
