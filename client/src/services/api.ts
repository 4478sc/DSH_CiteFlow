import axios, { AxiosError } from 'axios';
import { demoStore } from '../data/demoStore';
import type {
  DataSource,
  Folder,
  ImportKind,
  ImportResult,
  Reference,
  ReferenceType,
  SortKey,
} from '../types';

/**
 * The v1 API is the canonical contract:
 *   /api/v1/categories, /api/v1/papers, /api/v1/imports,
 *   /api/v1/papers/:id/files, /api/v1/exports/bibtex
 *
 * The legacy /api/folders and /api/references routes are kept as a
 * compatibility fallback while the backend finishes its v1 migration.
 */
const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 12000,
  headers: { Accept: 'application/json' },
});

let demoMode = false;

export const getDataSource = (): DataSource => (demoMode ? 'demo' : 'api');
export const isDemoMode = (): boolean => demoMode;

class UnavailableApi extends Error {
  constructor(message = 'Reference service is unavailable') {
    super(message);
    this.name = 'UnavailableApi';
  }
}

function statusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? (error as AxiosError).response?.status : undefined;
}

function isMissingRoute(error: unknown): boolean {
  if (error instanceof UnavailableApi) return true;
  return [404, 405].includes(statusOf(error) ?? 0);
}

function isOffline(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = statusOf(error);
  return !status || [502, 503, 504].includes(status);
}

/**
 * Try the canonical endpoint first, then a legacy endpoint. Only fall back to
 * demo data when no route exists (404/405) or the server cannot be reached.
 */
async function withCandidates<T>(
  attempts: Array<() => Promise<T>>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  if (demoMode) return fallback();
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const value = await attempt();
      demoMode = false;
      return value;
    } catch (error) {
      lastError = error;
      if (isMissingRoute(error)) continue;
      if (isOffline(error)) {
        demoMode = true;
        return fallback();
      }
      throw error;
    }
  }
  if (isOffline(lastError) || isMissingRoute(lastError) || lastError == null) {
    demoMode = true;
    return fallback();
  }
  throw lastError;
}

/**
 * Batch routes are allowed to fail (older servers may match them against
 * `/:id` first). Treat those failures as "try the next strategy" rather than
 * surfacing them to the user, while still preserving connectivity failures.
 */
async function softAttempt(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isOffline(error)) throw error;
    throw new UnavailableApi('Batch endpoint unavailable');
  }
}
function unwrap(value: unknown, keys: string[]): unknown {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (key in record) return record[key];
    }
  }
  return value;
}

function asString(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

function normalizeAuthors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((author) => {
        if (typeof author === 'string') return author;
        if (author && typeof author === 'object') {
          const item = author as Record<string, unknown>;
          return (
            asString(item.name) ||
            [item.given, item.family].filter(Boolean).join(' ') ||
            asString(item.value) ||
            ''
          );
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+and\s+|;/i)
      .map((author) => author.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeReferenceType(value: unknown): ReferenceType {
  const type = String(value ?? 'article').toLowerCase();
  if (type.includes('conference') || type.includes('proceedings')) return 'inproceedings';
  if (type.includes('journal') || type === 'article' || type === 'paper') return 'article';
  if (type.includes('phd')) return 'phdthesis';
  if (type.includes('master') || type.includes('thesis')) return 'masterthesis';
  if (type === 'incollection' || type.includes('chapter')) return 'incollection';
  if (type.includes('tech') || type.includes('report')) return 'techreport';
  if (type.includes('book')) return 'book';
  return 'misc';
}

function normalizeReference(input: Record<string, unknown>, index: number): Reference {
  const rawYear = input.year ?? input.publishYear ?? input.publicationYear;
  const parsedYear = Number(rawYear);
  const rawId = input.id ?? input.paperId ?? input._id ?? index + 1;
  const files = Array.isArray(input.files) ? input.files : [];
  const primaryFile = files.find((file) => {
    if (!file || typeof file !== 'object') return false;
    return Boolean((file as Record<string, unknown>).isPrimary);
  }) as Record<string, unknown> | undefined;
  const firstFile = (files[0] ?? primaryFile) as Record<string, unknown> | undefined;
  const fileUrl =
    primaryFile?.id != null || firstFile?.id != null
      ? `/api/v1/files/${primaryFile?.id ?? firstFile?.id}/content`
      : undefined;
  const rawCategoryId =
    input.categoryId ?? input.category_id ?? input.folderId ?? input.folder_id;
  const rawKeywords = input.keywords;
  return {
    id: Number(rawId),
    type: normalizeReferenceType(input.type),
    title: asString(input.title) ?? 'Untitled reference',
    authors: normalizeAuthors(input.authors ?? input.author),
    year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : undefined,
    journal: asString(input.journal ?? input.publication ?? input.source),
    booktitle: asString(input.booktitle ?? input.conference ?? input.proceedings),
    volume: asString(input.volume),
    issue: asString(input.issue ?? input.number),
    pages: asString(input.pages ?? input.page),
    doi: asString(input.doi),
    url: asString(input.url),
    abstract: asString(input.abstract ?? input.summary),
    keywords: Array.isArray(rawKeywords)
      ? rawKeywords.map(String)
      : typeof rawKeywords === 'string'
        ? rawKeywords
            .split(/[,;]/)
            .map((keyword) => keyword.trim())
            .filter(Boolean)
        : undefined,
    publisher: asString(input.publisher),
    address: asString(input.address),
    school: asString(input.school ?? input.institution),
    pdfPath: asString(
      input.pdfPath ??
        input.pdf_path ??
        fileUrl ??
        primaryFile?.filePath ??
        primaryFile?.path ??
        firstFile?.filePath ??
        firstFile?.path,
    ),
    categoryId: rawCategoryId != null ? Number(rawCategoryId) : null,
    importedFrom: asString(input.importedFrom ?? input.imported_from ?? input.importSource),
    createdAt: asString(input.createdAt ?? input.created_at),
    updatedAt: asString(input.updatedAt ?? input.updated_at),
    citationKey: asString(input.citationKey ?? input.citation_key ?? input.bibtexKey ?? input.bibtex_key),
    read: Boolean(input.read ?? input.isRead),
    starred: Boolean(input.starred ?? input.favorite ?? input.isStarred),
  };
}

function normalizeReferenceList(payload: unknown): Reference[] {
  const raw = Array.isArray(payload)
    ? payload
    : unwrap(payload, ['papers', 'references', 'items', 'results', 'data']);
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(normalizeReference);
  }
  if (raw && typeof raw === 'object') {
    const nested = unwrap(raw, ['papers', 'references', 'items', 'results']);
    if (Array.isArray(nested)) {
      return nested
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map(normalizeReference);
    }
  }
  throw new UnavailableApi('Unexpected paper response');
}

function normalizeFolder(
  input: Record<string, unknown>,
  parentId: number | null,
  output: Folder[],
): Folder {
  const rawId = Number(input.id ?? input.categoryId ?? input._id);
  const id = Number.isFinite(rawId) ? rawId : output.length + 1;
  const childrenRaw = Array.isArray(input.children) ? input.children : [];
  const rawCount =
    input.referenceCount ?? input.paperCount ?? input.count ?? input.papersCount ?? input.total;
  const rawDirect = input.directCount ?? input.direct_count;
  const rawParentId =
    input.parentId != null ? input.parentId : input.parent_id != null ? input.parent_id : parentId;
  const folder: Folder = {
    id,
    name: asString(input.name) ?? 'Untitled collection',
    parentId: rawParentId != null ? Number(rawParentId) : null,
    referenceCount: rawCount != null ? Number(rawCount) : undefined,
    directCount: rawDirect != null ? Number(rawDirect) : rawCount != null ? Number(rawCount) : undefined,
    createdAt: asString(input.createdAt ?? input.created_at),
    children: [],
  };
  output.push(folder);
  childrenRaw.forEach((child) => {
    if (child && typeof child === 'object') {
      normalizeFolder(child as Record<string, unknown>, id, output);
    }
  });
  return folder;
}

function normalizeFolderList(payload: unknown): Folder[] {
  let raw = unwrap(payload, ['categories', 'folders', 'items', 'data']);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = unwrap(raw, ['categories', 'folders', 'items']);
  }
  if (!Array.isArray(raw)) throw new UnavailableApi('Unexpected category response');
  const output: Folder[] = [];
  raw.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    normalizeFolder(item as Record<string, unknown>, null, output);
  });
  return output;
}

function extractCreatedFolder(
  payload: unknown,
  fallbackName: string,
  parentId: number | null,
): Folder {
  const raw = unwrap(payload, ['category', 'folder', 'data', 'result']);
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (record.id != null || record.categoryId != null) {
      const folder = normalizeFolder(record, parentId, []);
      if (!record.name) folder.name = fallbackName;
      return folder;
    }
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.id != null || record.categoryId != null) {
      const folder = normalizeFolder(record, parentId, []);
      if (!record.name) folder.name = fallbackName;
      return folder;
    }
  }
  throw new UnavailableApi('Category was not returned by the server');
}

function extractCreatedPaper(payload: unknown, fallbackTitle: string, categoryId: number | null): Reference {
  const raw = unwrap(payload, ['paper', 'reference', 'data', 'result']);
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (record.id != null || record.paperId != null) {
      return normalizeReference(record, 0);
    }
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.id != null || record.paperId != null) {
      return normalizeReference(record, 0);
    }
  }
  const id = Number((payload as Record<string, unknown> | null)?.id);
  if (Number.isFinite(id) && id > 0) {
    return {
      id,
      type: 'misc',
      title: fallbackTitle,
      authors: [],
      categoryId,
      importedFrom: 'PDF',
    };
  }
  throw new UnavailableApi('Paper was not returned by the server');
}

function normalizeImportResult(payload: unknown): ImportResult {
  const root =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const nested =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.result && typeof root.result === 'object'
        ? (root.result as Record<string, unknown>)
        : root;
  const meta =
    root.meta && typeof root.meta === 'object'
      ? (root.meta as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const importedRows = Array.isArray(nested.imported) ? (nested.imported as unknown[]) : [];
  const updatedRows = Array.isArray(nested.updated) ? (nested.updated as unknown[]) : [];
  const skippedRows = Array.isArray(nested.skipped) ? (nested.skipped as unknown[]) : [];
  const errorRows = Array.isArray(nested.errors) ? (nested.errors as unknown[]) : [];
  const paperRows = Array.isArray(nested.papers)
    ? (nested.papers as unknown[])
    : Array.isArray(nested.references)
      ? (nested.references as unknown[])
      : importedRows;

  const references = paperRows
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(normalizeReference);

  const importCount =
    typeof nested.imported === 'number'
      ? nested.imported
      : Number(meta.totalImported ?? importedRows.length) || 0;
  const updateCount =
    typeof nested.updated === 'number'
      ? nested.updated
      : Number(meta.totalUpdated ?? updatedRows.length) || 0;
  const success = Math.max(importCount, 0) + Math.max(updateCount, 0) || references.length;
  const skippedCount = Number(meta.totalSkipped ?? skippedRows.length) || 0;
  const errorCount = Number(meta.totalErrors ?? errorRows.length) || 0;

  const messages: string[] = [];
  errorRows.forEach((item) => {
    if (typeof item === 'string') {
      messages.push(item);
      return;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const message =
        asString(record.message) ?? asString(record.error) ?? 'Could not import this record';
      const source = asString(record.file) ?? asString(record.title);
      messages.push(source ? `${source}: ${message}` : message);
    }
  });
  skippedRows.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const title = asString(record.title) ?? 'Record';
    const reason = asString(record.reason) ?? 'Duplicate record';
    messages.push(`Skipped “${title}”: ${reason}`);
  });
  if (Array.isArray(nested.warnings)) {
    nested.warnings.forEach((warning) => {
      if (warning && typeof warning === 'object') {
        const record = warning as Record<string, unknown>;
        const message = asString(record.message) ?? asString(record.error);
        if (message) messages.push(message);
      } else if (warning) {
        messages.push(String(warning));
      }
    });
  }

  return {
    success,
    failed: skippedCount + errorCount,
    references,
    errors: messages,
  };
}
function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | {
          message?: string;
          error?: string | { message?: string; code?: string };
          errors?: Array<{ message?: string } | string>;
        }
      | undefined;
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const messages = data.errors
        .map((item) => (typeof item === 'string' ? item : item.message))
        .filter(Boolean);
      if (messages.length > 0) return messages.join(' · ');
    }
    if (typeof data?.error === 'object' && data.error?.message) return data.error.message;
    if (typeof data?.error === 'string') return data.error;
    if (data?.message) return data.message;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}
function assertBlob(blob: Blob): Blob {
  if (!blob || blob.size === 0) throw new UnavailableApi('Empty BibTeX response');
  if (blob.type.includes('json')) {
    throw new Error('The server could not generate a BibTeX export.');
  }
  return blob;
}

async function importPdfLive(file: File, categoryId: number | null): Promise<ImportResult> {
  const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled PDF';
  const createdPayload = (
    await http.post('/v1/papers', {
      type: 'misc',
      title,
      authors: [],
      categoryId,
      folderId: categoryId,
      importedFrom: 'PDF',
    })
  ).data;
  const paper = extractCreatedPaper(createdPayload, title, categoryId);
  const uploadedResult = (payload: unknown): ImportResult => {
    const uploaded = unwrap(payload, ['file', 'paper', 'reference', 'data']);
    if (uploaded && typeof uploaded === 'object') {
      const record = uploaded as Record<string, unknown>;
      if (record.fileName || record.filePath || record.referenceId) {
        const fileUrl =
          record.id != null
            ? `/api/v1/files/${record.id}/content`
            : asString(record.filePath);
        return {
          success: 1,
          failed: 0,
          references: [{ ...paper, pdfPath: fileUrl ?? file.name }],
          errors: [],
        };
      }
      if (record.title || record.paperId) {
        return { success: 1, failed: 0, references: [normalizeReference(record, 0)], errors: [] };
      }
    }
    return {
      success: 1,
      failed: 0,
      references: [{ ...paper, pdfPath: file.name }],
      errors: [],
    };
  };

  const uploadForm = () => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'pdf');
    form.append('isPrimary', 'true');
    return form;
  };

  const uploadEndpoints = [
    `/v1/papers/${paper.id}/files`,
    `/v1/files/${paper.id}/files`,
  ];
  let lastUploadError: unknown;
  for (const endpoint of uploadEndpoints) {
    try {
      const response = await http.post(endpoint, uploadForm(), {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      return uploadedResult(response.data);
    } catch (error) {
      lastUploadError = error;
      if (isMissingRoute(error)) continue;
      await http.delete(`/v1/papers/${paper.id}`).catch(() => undefined);
      throw error;
    }
  }

  await http.delete(`/v1/papers/${paper.id}`).catch(() => undefined);
  throw lastUploadError ?? new UnavailableApi('File upload endpoint is unavailable');
}
function normalizeSingleReference(payload: unknown): Reference {
  const raw = unwrap(payload, ['paper', 'reference', 'data', 'result']);
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (record.id != null || record.paperId != null || record.title) {
      return normalizeReference(record, 0);
    }
    const nested = unwrap(record, ['paper', 'reference']);
    if (nested && typeof nested === 'object') {
      return normalizeReference(nested as Record<string, unknown>, 0);
    }
  }
  throw new UnavailableApi('Unexpected paper detail response');
}
export const api = {
  async getFolders(): Promise<Folder[]> {
    return withCandidates(
      [
        async () => normalizeFolderList((await http.get('/v1/categories')).data),
        async () => normalizeFolderList((await http.get('/folders')).data),
      ],
      () => demoStore.getFolders(),
    );
  },

  async getReference(id: number): Promise<Reference> {
    return withCandidates(
      [
        async () => normalizeSingleReference((await http.get(`/v1/papers/${id}`)).data),
        async () => normalizeSingleReference((await http.get(`/references/${id}`)).data),
      ],
      () => {
        const reference = demoStore.getReference(id);
        if (!reference) throw new Error('Reference not found');
        return reference;
      },
    );
  },

  async getReferences(
    categoryId?: number | null,
    search = '',
    _sort: SortKey = 'added',
  ): Promise<Reference[]> {
    return withCandidates(
      [
        async () => {
          const params: Record<string, string | number> = {
            includeDescendants: 'true',
            page: 1,
            pageSize: 500,
          };
          if (categoryId != null) params.categoryId = categoryId;
          if (search.trim()) {
            params.search = search.trim();
            params.q = search.trim();
          }
          return normalizeReferenceList((await http.get('/v1/papers', { params })).data);
        },
        async () => {
          const params: Record<string, string | number> = {};
          if (categoryId != null) params.folderId = categoryId;
          if (search.trim()) params.search = search.trim();
          return normalizeReferenceList((await http.get('/references', { params })).data);
        },
      ],
      () => demoStore.getReferences(categoryId, search, _sort),
    );
  },

  async createFolder(name: string, parentId?: number | null): Promise<Folder> {
    return withCandidates(
      [
        async () => {
          const response = await http.post('/v1/categories', { name, parentId: parentId ?? null });
          return extractCreatedFolder(response.data, name, parentId ?? null);
        },
        async () => {
          const response = await http.post('/folders', { name, parentId: parentId ?? null });
          return extractCreatedFolder(response.data, name, parentId ?? null);
        },
      ],
      () => demoStore.createFolder(name, parentId),
    );
  },

  async renameFolder(id: number, name: string): Promise<Folder> {
    return withCandidates(
      [
        async () => {
          const response = await http.patch(`/v1/categories/${id}`, { name });
          return extractCreatedFolder(response.data, name, null);
        },
        async () => {
          const response = await http.patch(`/folders/${id}`, { name });
          return extractCreatedFolder(response.data, name, null);
        },
      ],
      () => demoStore.renameFolder(id, name),
    );
  },

  async deleteFolder(id: number): Promise<void> {
    return withCandidates(
      [
        async () => {
          await http.delete(`/v1/categories/${id}`);
        },
        async () => {
          await http.delete(`/folders/${id}`);
        },
      ],
      () => demoStore.deleteFolder(id),
    );
  },

  async moveFolder(id: number, parentId: number | null): Promise<Folder> {
    return withCandidates(
      [
        async () => {
          const response = await http.patch(`/v1/categories/${id}`, { parentId });
          return extractCreatedFolder(response.data, 'Collection', parentId);
        },
        async () => {
          const response = await http.patch(`/folders/${id}`, { parentId });
          return extractCreatedFolder(response.data, 'Collection', parentId);
        },
      ],
      () => demoStore.moveFolder(id, parentId),
    );
  },

  async deleteReferences(ids: number[]): Promise<void> {
    return withCandidates(
      [
        async () => {
          await softAttempt(() =>
            http.delete('/v1/papers/batch-delete', { data: { paperIds: ids } }),
          );
        },
        async () => {
          await softAttempt(() => http.post('/v1/papers/batch/delete', { paperIds: ids }));
        },
        async () => {
          await Promise.all(ids.map((id) => http.delete(`/v1/papers/${id}`)));
        },
        async () => {
          await http.post('/references/bulk-delete', { ids });
        },
      ],
      () => demoStore.deleteReferences(ids),
    );
  },

  async moveReferences(ids: number[], categoryId: number | null): Promise<void> {
    return withCandidates(
      [
        async () => {
          await softAttempt(() =>
            http.patch('/v1/papers/batch-move', { paperIds: ids, categoryId }),
          );
        },
        async () => {
          await softAttempt(() =>
            http.post('/v1/papers/batch/move', { paperIds: ids, categoryId }),
          );
        },
        async () => {
          await Promise.all(ids.map((id) => http.patch(`/v1/papers/${id}`, { categoryId })));
        },
        async () => {
          await http.post('/references/bulk-move', { ids, folderId: categoryId });
        },
      ],
      () => demoStore.moveReferences(ids, categoryId),
    );
  },
  async importFile(
    kind: ImportKind,
    file: File,
    categoryId?: number | null,
  ): Promise<ImportResult> {
    if (demoMode) return demoStore.importFile(kind, file, categoryId);

    if (kind === 'pdf') {
      try {
        return await importPdfLive(file, categoryId ?? null);
      } catch (error) {
        if (isMissingRoute(error) || isOffline(error)) {
          demoMode = true;
          return demoStore.importFile(kind, file, categoryId);
        }
        throw error;
      }
    }

    return withCandidates(
      [
        async () => {
          const form = new FormData();
          form.append('files', file);
          if (categoryId != null) form.append('categoryId', String(categoryId));
          form.append('dryRun', 'false');
          const response = await http.post('/v1/imports', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
          });
          return normalizeImportResult(response.data);
        },
        async () => {
          const form = new FormData();
          form.append('file', file);
          if (categoryId != null) form.append('folderId', String(categoryId));
          const endpoint = kind === 'ris' ? '/import/ris' : '/import/wos';
          const response = await http.post(endpoint, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
          });
          return normalizeImportResult(response.data);
        },
      ],
      () => demoStore.importFile(kind, file, categoryId),
    );
  },

  async exportBibtex(ids: number[], categoryId?: number | null): Promise<Blob> {
    return withCandidates(
      [
        async () => {
          const payload =
            ids.length > 0
              ? { paperIds: ids, includeAbstract: true }
              : categoryId != null
                ? { categoryId, includeDescendants: true, includeAbstract: true }
                : null;
          if (!payload) throw new UnavailableApi('Nothing to export');
          const response = await http.post('/v1/exports/bibtex', payload, {
            responseType: 'blob',
            timeout: 30000,
          });
          return assertBlob(response.data as Blob);
        },
        async () => {
          if (ids.length === 0) throw new UnavailableApi('Nothing to export');
          const response = await http.post(
            '/export/bibtex',
            { referenceIds: ids },
            { responseType: 'blob', timeout: 30000 },
          );
          return assertBlob(response.data as Blob);
        },
      ],
      () =>
        new Blob([demoStore.exportBibtex(ids.length ? ids : undefined, categoryId)], {
          type: 'application/x-bibtex',
        }),
    );
  },

  errorMessage,
};

export default api;