import type { Folder, Reference, ReferenceType, SortKey } from '../types';

export const typeLabels: Record<ReferenceType, string> = {
  article: 'Journal article',
  inproceedings: 'Conference paper',
  book: 'Book',
  masterthesis: 'Master’s thesis',
  phdthesis: 'PhD thesis',
  incollection: 'Book chapter',
  techreport: 'Technical report',
  misc: 'Other',
};

export const typeShortLabels: Record<ReferenceType, string> = {
  article: 'Article',
  inproceedings: 'Conference',
  book: 'Book',
  masterthesis: 'Thesis',
  phdthesis: 'Thesis',
  incollection: 'Chapter',
  techreport: 'Report',
  misc: 'Other',
};

export function getVenue(reference: Reference): string {
  return reference.journal || reference.booktitle || reference.publisher || 'Unpublished';
}

export function formatAuthors(authors: string[], max = 3): string {
  if (!authors.length) return 'Unknown authors';
  if (authors.length <= max) return authors.join(', ');
  return `${authors.slice(0, max).join(', ')} +${authors.length - max}`;
}

export function authorInitials(author: string): string {
  const parts = author.trim().split(/\s+/);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function apaAuthor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const family = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}.`)
    .join(' ');
  return `${family}, ${initials}`;
}

export function formatCitation(reference: Reference): string {
  const authorPart =
    reference.authors.length > 0
      ? reference.authors.map(apaAuthor).join(', ')
      : 'Unknown author';
  const yearPart = reference.year ? ` (${reference.year}).` : '.';
  const titlePart = ` ${reference.title.replace(/\.$/, '')}.`;
  const venuePart = reference.journal ? ` ${reference.journal}` : reference.booktitle ? ` ${reference.booktitle}` : '';
  const volumePart = reference.volume ? `, ${reference.volume}` : '';
  const issuePart = reference.issue ? `(${reference.issue})` : '';
  const pagesPart = reference.pages ? `, ${reference.pages}` : '';
  const doiPart = reference.doi ? ` https://doi.org/${reference.doi}` : reference.url ? ` ${reference.url}` : '';
  return `${authorPart}${yearPart}${titlePart}${venuePart}${volumePart}${issuePart}${pagesPart}.${doiPart}`;
}

export function flattenFolders(folders: Folder[]): Folder[] {
  const result: Folder[] = [];
  const walk = (items: Folder[]) => {
    for (const folder of items) {
      result.push({ ...folder, children: undefined });
      if (folder.children?.length) walk(folder.children);
    }
  };
  walk(folders);
  return result;
}

export function findFolder(folders: Folder[], id: number | null): Folder | undefined {
  if (id == null) return undefined;
  return flattenFolders(folders).find((folder) => folder.id === id);
}

export function folderPath(folders: Folder[], id: number | null): Folder[] {
  const flat = flattenFolders(folders);
  if (id == null) return [];
  const byId = new Map(flat.map((folder) => [folder.id, folder]));
  const path: Folder[] = [];
  let current = byId.get(id);
  const guard = new Set<number>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function typeAbbreviation(reference: Reference): string {
  if (reference.type === 'inproceedings') return 'CONF';
  if (reference.type === 'article') return 'JOUR';
  if (reference.type === 'book') return 'BOOK';
  if (reference.type === 'phdthesis' || reference.type === 'masterthesis') return 'THES';
  if (reference.type === 'incollection') return 'CHAP';
  return 'MISC';
}

export function sortReferences(references: Reference[], sort: SortKey): Reference[] {
  const items = [...references];
  switch (sort) {
    case 'year-desc':
      return items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
    case 'year-asc':
      return items.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
    case 'title':
      return items.sort((a, b) => a.title.localeCompare(b.title));
    case 'author':
      return items.sort((a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''));
    case 'added':
    default:
      return items.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime() ||
          b.id - a.id,
      );
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatRelativeDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

export function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'references';
}
const bibtexType: Record<ReferenceType, string> = {
  article: 'article',
  inproceedings: 'inproceedings',
  book: 'book',
  masterthesis: 'mastersthesis',
  phdthesis: 'phdthesis',
  incollection: 'incollection',
  techreport: 'techreport',
  misc: 'misc',
};

function bibtexKey(reference: Reference): string {
  if (reference.citationKey) return reference.citationKey;
  const firstAuthor = reference.authors[0] ?? 'unknown';
  const family = firstAuthor.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z]/g, '') || 'unknown';
  const word =
    reference.title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .find((candidate) => candidate.length > 3) ?? 'untitled';
  return `${family.toLowerCase()}${reference.year ?? ''}${word.toLowerCase()}`;
}

export function formatBibtexReference(reference: Reference): string {
  const fields: Array<[string, string | undefined]> = [
    ['title', reference.title],
    ['author', reference.authors.join(' and ')],
    ['year', reference.year?.toString()],
    ['journal', reference.journal],
    ['booktitle', reference.booktitle],
    ['volume', reference.volume],
    ['number', reference.issue],
    ['pages', reference.pages],
    ['doi', reference.doi],
    ['publisher', reference.publisher],
    ['address', reference.address],
    ['school', reference.school],
    ['url', reference.url],
    ['keywords', reference.keywords?.join(', ')],
  ];
  const body = fields
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `  ${key} = {${value}}`)
    .join(',\n');
  return `@${bibtexType[reference.type]}{${bibtexKey(reference)},\n${body}\n}`;
}