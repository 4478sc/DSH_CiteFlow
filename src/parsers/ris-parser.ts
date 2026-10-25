/**
 * RIS -> normalized citation parser.
 *
 * Supported input is the tagged RIS format used by IEEE Xplore and similar
 * exporters. Records are terminated by `ER`; repeated tags (authors, keywords)
 * and indented continuation lines are handled. Parsing is intentionally
 * recovery-oriented: malformed records produce diagnostics instead of aborting
 * the whole import, and only records with a usable title are returned.
 */

import type { Reference } from '../types/reference.js';
import type {
  CitationDiagnostic,
  CitationDiagnosticCode,
  CitationParseResult,
  CitationParserOptions,
  CitationRecord,
} from './types.js';

interface RisField {
  tag: string;
  value: string;
  line: number;
}

interface DiagnosticDetails {
  recordIndex?: number;
  line?: number;
  tag?: string;
}

type Reporter = (
  severity: CitationDiagnostic['severity'],
  code: CitationDiagnosticCode,
  message: string,
  details?: DiagnosticDetails,
) => void;

/** `TY  - JOUR`, with tolerance for leading spaces and tab separators. */
const RIS_TAG_PATTERN = /^\s{0,3}([A-Za-z][A-Za-z0-9])\s+-\s?(.*)$/;

/** `ER  -`, `ER -`, or a bare `ER`. */
const RIS_END_PATTERN = /^ER\s*(?:-\s*.*)?$/i;

const RIS_TYPE_MAP: Readonly<Record<string, Reference['type']>> = {
  JOUR: 'article',
  EJOUR: 'article',
  MGZN: 'article',
  NEWS: 'article',
  CONF: 'inproceedings',
  CPAPER: 'inproceedings',
  BOOK: 'book',
  EBOOK: 'book',
  EDBOOK: 'book',
  CHAP: 'incollection',
  ECHAP: 'incollection',
  THES: 'phdthesis',
  RPRT: 'misc',
  GEN: 'misc',
  UNPB: 'misc',
  ELEC: 'misc',
  BLOG: 'misc',
  WEB: 'misc',
  DATA: 'misc',
  DBASE: 'misc',
  PAT: 'misc',
};

const BOOK_LIKE_TYPES: ReadonlySet<Reference['type']> = new Set<Reference['type']>([
  'book',
  'incollection',
  'phdthesis',
  'masterthesis',
]);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Parse RIS content into normalized citations.
 *
 * A record without a non-empty title is reported as an error and omitted,
 * because the application/database requires a title.
 */
export function parseRIS(
  content: string,
  options: CitationParserOptions = {},
): CitationRecord[] {
  return parseRISWithDiagnostics(content, options).references;
}

/** Parse RIS content and return both normalized records and diagnostics. */
export function parseRISWithDiagnostics(
  content: string,
  options: CitationParserOptions = {},
): CitationParseResult {
  if (typeof content !== 'string') {
    throw new TypeError('parseRISWithDiagnostics expected file contents as a string');
  }

  const errors: CitationDiagnostic[] = [];
  const warnings: CitationDiagnostic[] = [];
  const references: CitationRecord[] = [];

  const report: Reporter = (severity, code, message, details = {}) => {
    const diagnostic: CitationDiagnostic = { severity, code, message };
    if (details.recordIndex !== undefined) diagnostic.recordIndex = details.recordIndex;
    if (details.line !== undefined) diagnostic.line = details.line;
    if (details.tag !== undefined) diagnostic.tag = details.tag;

    if (severity === 'error') errors.push(diagnostic);
    else warnings.push(diagnostic);
    options.onDiagnostic?.(diagnostic);
  };

  const lines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  let fields: RisField[] = [];
  let current: { tag: string; lines: string[]; line: number } | null = null;
  let recordStartLine = 1;
  let sawContent = false;
  let sawRecordCandidate = false;

  function flushCurrent(): void {
    if (current === null) return;
    fields.push({
      tag: current.tag,
      value: current.lines.join('\n').trim(),
      line: current.line,
    });
    current = null;
  }

  function hasSubstantiveField(candidate: readonly RisField[]): boolean {
    return candidate.some((field) => field.tag !== 'TY' && field.value.trim() !== '');
  }

  function finishRecord(reason: 'er' | 'implicit' | 'eof', line: number): void {
    flushCurrent();

    if (fields.length === 0 || !hasSubstantiveField(fields)) {
      if (reason === 'er') {
        report('warning', 'EMPTY_RECORD', 'Encountered an RIS record with no usable fields', {
          recordIndex: references.length,
          line,
        });
      }
      fields = [];
      current = null;
      recordStartLine = line + 1;
      return;
    }

    const reference = buildReference(fields, references.length, recordStartLine, report);
    if (reference !== null) references.push(reference);

    fields = [];
    current = null;
    recordStartLine = line + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').replace(/\s+$/, '');
    const lineNumber = index + 1;
    if (line.trim() !== '') sawContent = true;

    if (line.trim() === '') {
      // Preserve paragraph breaks inside abstract-like values.
      if (current !== null) current.lines.push('');
      continue;
    }

    if (RIS_END_PATTERN.test(line.trim())) {
      sawRecordCandidate = true;
      if (fields.length > 0 || current !== null) {
        finishRecord('er', lineNumber);
      } else {
        report('warning', 'EMPTY_RECORD', 'Encountered an empty RIS record', {
          recordIndex: references.length,
          line: lineNumber,
        });
      }
      continue;
    }

    const match = RIS_TAG_PATTERN.exec(line);
    if (match !== null) {
      sawRecordCandidate = true;
      const tag = (match[1] ?? '').toUpperCase();
      const value = (match[2] ?? '').trim();

      flushCurrent();

      // Recover from a missing ER rather than merging two records together.
      if (tag === 'TY' && fields.length > 0) {
        report(
          'warning',
          'MISSING_RECORD_SEPARATOR',
          'New TY tag found before the previous record was closed with ER',
          { recordIndex: references.length, line: lineNumber, tag: 'TY' },
        );
        finishRecord('implicit', lineNumber);
      }

      if (fields.length === 0) recordStartLine = lineNumber;
      current = { tag, lines: value === '' ? [] : [value], line: lineNumber };
      continue;
    }

    if (current !== null) {
      // Indented/multi-line value. For AU/A1 this is treated as an additional
      // author when the completed value is split.
      current.lines.push(line.trim());
    }
    // Non-tag content before the first field is an exporter header; ignore it.
  }

  flushCurrent();
  if (fields.length > 0) {
    report(
      'warning',
      'UNTERMINATED_RECORD',
      'End of input reached before the final RIS record was closed with ER',
      { recordIndex: references.length, line: recordStartLine },
    );
    finishRecord('eof', lines.length);
  }

  if (references.length === 0 && sawContent && !sawRecordCandidate) {
    report('error', 'NO_RECORDS', 'No RIS citation records could be found in the input', {
      line: 1,
    });
  }

  return { references, errors, warnings };
}

function buildReference(
  fields: readonly RisField[],
  recordIndex: number,
  recordStartLine: number,
  report: Reporter,
): CitationRecord | null {
  const title = getText(fields, ['TI', 'T1', 'BT']) ?? '';
  if (title === '') {
    report('error', 'MISSING_TITLE', 'RIS record has no title (TI/T1/BT)', {
      recordIndex,
      line: recordStartLine,
      tag: 'TI',
    });
    return null;
  }

  const typeCode = getText(fields, ['TY']);
  let type: Reference['type'] = 'misc';
  if (typeCode === undefined) {
    report('warning', 'MISSING_TYPE', 'RIS record has no TY (type) field', {
      recordIndex,
      line: recordStartLine,
      tag: 'TY',
    });
  } else {
    const mapped = RIS_TYPE_MAP[typeCode.toUpperCase()];
    if (mapped === undefined) {
      report('warning', 'UNKNOWN_TYPE', `Unrecognized RIS type code "${typeCode}"`, {
        recordIndex,
        line: recordStartLine,
        tag: 'TY',
      });
    } else {
      type = mapped;
    }
  }

  const reference: CitationRecord = {
    type,
    title,
    authors: getAuthors(fields),
    importedFrom: 'ris',
  };

  const yearText = getText(fields, ['PY', 'Y1', 'DA']);
  if (yearText !== undefined) {
    const year = extractYear(yearText);
    if (year === undefined) {
      report('warning', 'INVALID_YEAR', `Could not parse a valid publication year from "${yearText}"`, {
        recordIndex,
        line: recordStartLine,
        tag: 'PY',
      });
    } else {
      reference.year = year;
    }
  }

  const container = getContainer(fields, type);
  if (container !== undefined) {
    if (type === 'inproceedings' || type === 'incollection') reference.booktitle = container;
    else if (type === 'article' || type === 'misc') reference.journal = container;
    else if (type === 'book') reference.series = container;
  }

  const volume = getText(fields, ['VL', 'VO']);
  if (volume !== undefined) reference.volume = volume;
  const issue = getText(fields, ['IS']);
  if (issue !== undefined) reference.issue = issue;

  const pages = combinePages(getText(fields, ['SP']), getText(fields, ['EP']));
  if (pages !== undefined) reference.pages = pages;

  const doiText = getText(fields, ['DO', 'DI']);
  if (doiText !== undefined) {
    const doi = normalizeDoi(doiText);
    if (doi !== '') {
      reference.doi = doi;
      if (!isValidDoi(doi)) {
        report('warning', 'INVALID_DOI', `DOI does not look well-formed: "${doi}"`, {
          recordIndex,
          line: recordStartLine,
          tag: 'DO',
        });
      }
    }
  }

  const url = getText(fields, ['UR']);
  if (url !== undefined) reference.url = url;

  const abstractText = getMultilineText(fields, ['AB', 'N2']);
  if (abstractText !== undefined) {
    const abstract = normalizeAbstract(abstractText);
    if (abstract !== '') reference.abstract = abstract;
  }

  const publisher = getText(fields, ['PB']);
  if (publisher !== undefined) {
    if (type === 'phdthesis' || type === 'masterthesis') reference.school = publisher;
    else reference.publisher = publisher;
  }

  const address = getText(fields, ['CY', 'PP']);
  if (address !== undefined) reference.address = address;

  const editors = getValues(fields, ['A2', 'ED']);
  const normalizedEditors = uniqueStrings(editors.flatMap((value) => splitList(value)));
  if (normalizedEditors.length > 0) reference.editors = normalizedEditors;

  const series = getText(fields, ['T3', 'SE']);
  if (series !== undefined) reference.series = series;
  const edition = getText(fields, ['ET']);
  if (edition !== undefined) reference.edition = edition;
  const note = getText(fields, ['N1']);
  if (note !== undefined) reference.note = note;
  const language = getText(fields, ['LA']);
  if (language !== undefined) reference.language = language;
  const organization = getText(fields, ['ORG']);
  if (organization !== undefined) reference.organization = organization;

  const month = extractMonth(getText(fields, ['DA', 'Y1', 'PY']));
  if (month !== undefined) reference.month = month;

  const keywords = uniqueStrings(
    getValues(fields, ['KW'])
      .flatMap((value) => value.split(/[;\n]+/))
      .map((keyword) => collapseWhitespace(keyword)),
  );
  if (keywords.length > 0) reference.keywords = keywords;

  const serialNumber = getText(fields, ['SN']);
  if (serialNumber !== undefined) {
    if (BOOK_LIKE_TYPES.has(type) || looksLikeIsbn(serialNumber)) reference.isbn = serialNumber;
    else reference.issn = serialNumber;
  }

  return reference;
}

function getContainer(
  fields: readonly RisField[],
  type: Reference['type'],
): string | undefined {
  if (type === 'inproceedings' || type === 'incollection') {
    return getText(fields, ['T2', 'BT', 'JO', 'JF', 'JA', 'J2']);
  }
  return getText(fields, ['JO', 'JF', 'T2', 'BT', 'JA', 'J2']);
}

function getAuthors(fields: readonly RisField[]): string[] {
  const primary = getValues(fields, ['AU']);
  const values = primary.length > 0 ? primary : getValues(fields, ['A1']);
  return uniqueStrings(values.flatMap((value) => splitList(value)));
}

function getValues(fields: readonly RisField[], tags: readonly string[]): string[] {
  const tagSet = new Set(tags);
  return fields
    .filter((field) => tagSet.has(field.tag) && field.value.trim() !== '')
    .map((field) => field.value);
}

function getText(fields: readonly RisField[], tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    const field = fields.find((candidate) => candidate.tag === tag && candidate.value.trim() !== '');
    if (field !== undefined) return collapseWhitespace(field.value);
  }
  return undefined;
}

function getMultilineText(
  fields: readonly RisField[],
  tags: readonly string[],
): string | undefined {
  for (const tag of tags) {
    const field = fields.find((candidate) => candidate.tag === tag && candidate.value.trim() !== '');
    if (field !== undefined) return field.value;
  }
  return undefined;
}

function splitList(value: string): string[] {
  return value.split(/\n+/).flatMap((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return [];
    // Keep a braced organisation intact even when it contains separators.
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return [trimmed];

    return trimmed
      .split(';')
      .map((part) => collapseWhitespace(part))
      .filter((part) => part !== '');
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value === '') continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function combinePages(startText?: string, endText?: string): string | undefined {
  let start = startText === undefined ? undefined : collapseWhitespace(startText);
  let end = endText === undefined ? undefined : collapseWhitespace(endText);

  // Some exporters put the whole range in SP and leave EP empty.
  if (start !== undefined && start !== '' && (end === undefined || end === '')) {
    const range = /^(.+?)\s*[-\u2013\u2014]{1,2}\s*(.+)$/.exec(start);
    if (range?.[1] !== undefined && range[2] !== undefined) {
      start = range[1].trim();
      end = range[2].trim();
    }
  }

  if (start === undefined || start === '') return end === undefined || end === '' ? undefined : end;
  if (end === undefined || end === '' || start === end) return start;
  return `${start}\u2013${end}`;
}

function extractYear(value: string): number | undefined {
  const match = /\b(\d{4})\b/.exec(value);
  if (match?.[1] === undefined) return undefined;
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 1000 && year <= 2200 ? year : undefined;
}

function extractMonth(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (text === '') return undefined;

  const iso = /(?:^|\D)(?:19|20)\d{2}[-/](\d{1,2})(?:\D|$)/.exec(text);
  if (iso?.[1] !== undefined) {
    const month = Number(iso[1]);
    if (month >= 1 && month <= 12) return MONTH_NAMES[month - 1];
  }

  const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i.exec(text);
  if (named?.[1] === undefined) return undefined;
  const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(named[1].toLowerCase().slice(0, 3));
  return index >= 0 ? MONTH_NAMES[index] : undefined;
}

function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/[.,;]+$/, '')
    .trim();
}

function isValidDoi(value: string): boolean {
  return /^10\.\d{4,9}\/\S+$/.test(value);
}

function looksLikeIsbn(value: string): boolean {
  const digits = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 10 || digits.length === 13;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeAbstract(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => collapseWhitespace(paragraph))
    .filter((paragraph) => paragraph !== '')
    .join('\n\n');
}

/** camelCase aliases for callers that do not use the all-caps spelling. */
export const parseRis = parseRIS;
export const parseRisWithDiagnostics = parseRISWithDiagnostics;