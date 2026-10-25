export type ReferenceType =
  | 'article'
  | 'inproceedings'
  | 'book'
  | 'masterthesis'
  | 'phdthesis'
  | 'incollection'
  | 'techreport'
  | 'misc';

export interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  children?: Folder[];
  referenceCount?: number;
  directCount?: number;
  createdAt?: string;
}

export interface Reference {
  id: number;
  type: ReferenceType;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  booktitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  keywords?: string[];
  publisher?: string;
  address?: string;
  school?: string;
  pdfPath?: string;
  categoryId?: number | null;
  importedFrom?: string;
  createdAt?: string;
  updatedAt?: string;
  citationKey?: string;
  read?: boolean;
  starred?: boolean;
}

export interface ImportResult {
  success: number;
  failed: number;
  references: Reference[];
  errors: string[];
}

export type SortKey = 'added' | 'year-desc' | 'year-asc' | 'title' | 'author';

export interface ReferenceFilters {
  search?: string;
  sort?: SortKey;
}

export type DataSource = 'api' | 'demo';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

export type ImportKind = 'ris' | 'wos' | 'pdf';