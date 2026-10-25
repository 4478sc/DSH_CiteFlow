/**
 * Web of Science (plain-text tagged) -> normalized citation parser.
 *
 * WoS records begin with `PT` and end with `ER`. Field tags start at column
 * zero; wrapped values and additional authors continue on indented lines. The
 * parser accepts CRLF/BOM input and the `FN`/`VR`/`EF` exporter markers, and it
 * recovers from missing `ER` terminators with a diagnostic rather than losing
 * the rest of the file.
 */

import type { Reference } from '../types/reference.js';
import type {
  CitationDiagnostic,
  CitationDiagnosticCode,
  CitationParseResult,
  CitationParserOptions,
  CitationRecord,
} from './types.js';

interface WosField {
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

/**
 * Capture the entire value, not just the first token. Tags start at column zero
 * so indented continuation lines never match this pattern.
 */
const WOS_TAG_PATTERN = /^([A-Z0-9]{2})\s+(.*)$/;

const WOS_END_PATTERN = /^\s{0,3}ER[ \t]*$/;
const WOS_EOF_PATTERN = /^\s{0,3}EF[ \t]*$/;
const WOS_PREAMBLE_TAGS: ReadonlySet<string> = new Set(['FN', 'VR']);

const WOS_TYPE_MAP: Readonly<Record<string, Reference['type']>> = {
  J: 'article',
  JOUR: 'article',
  C: 'inproceedings',
  CONF: 'inproceedings',
  B: 'book',
  BOOK: 'book',
  S: 'incollection',
  R: 'misc',
  P: 'misc',
  D: 'misc',
  E: 'misc',
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
 * Parse Web of Science content into normalized citations.
 *
 * Records without a usable title are reported and omitted because downstream
 * database writes require a title.
 */
export function parseWoS(
  content: string,
  options: CitationParserOptions = {},
): CitationRecord[] {
  return parseWoSWithDiagnostics(content, options).references;
}

/** Parse WoS content and return both normalized records and diagnostics. */
export function parseWoSWithDiagnostics(
  content: string,
  options: CitationParserOptions = {},
): CitationParseResult {
  if (typeof content !== 'string') {
    throw new TypeError('parseWoSWithDiagnostics expected file contents as a string');
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

  // Normalizing CRLF here makes ER detection and line continuation handling
  // work identically for Unix and Windows exports.
  const lines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  let fields: WosField[] = [];
  let current: { tag: string; lines: string[]; line: number } | null = null;
  let started = false;
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

  function hasSubstantiveField(candidate: readonly WosField[]): boolean {
    return candidate.some((field) => field.tag !== 'PT' && field.value.trim() !== '');
  }

  function finishRecord(reason: 'er' | 'implicit' | 'eof', line: number): void {
    flushCurrent();

    if (fields.length === 0 || !hasSubstantiveField(fields)) {
      if (reason === 'er') {
        report('warning', 'EMPTY_RECORD', 'Encountered a WoS record with no usable fields', {
          recordIndex: references.length,
          line,
        });
      }
      fields = [];
      current = null;
      started = false;
      recordStartLine = line + 1;
      return;
    }

    const reference = buildReference(fields, references.length, recordStartLine, report);
    if (reference !== null) references.push(reference);

    fields = [];
    current = null;
    started = false;
    recordStartLine = line + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').replace(/[ \t]+$/, '');
    const lineNumber = index + 1;
    if (line.trim() !== '') sawContent = true;

    if (line.trim() === '') {
      if (current !== null) current.lines.push('');
      continue;
    }

    if (WOS_END_PATTERN.test(line)) {
      sawRecordCandidate = true;
      if (started || fields.length > 0 || current !== null) {
        finishRecord('er', lineNumber);
      } else {
        report('warning', 'EMPTY_RECORD', 'Encountered an empty WoS record', {
          recordIndex: references.length,
          line: lineNumber,
        });
      }
      continue;
    }

    if (WOS_EOF_PATTERN.test(line)) continue;

    const match = WOS_TAG_PATTERN.exec(line);
    if (match !== null) {
      const tag = (match[1] ?? '').toUpperCase();
      const value = (match[2] ?? '').trim();

      if (!started) {
        if (WOS_PREAMBLE_TAGS.has(tag)) continue;
        started = true;
        recordStartLine = lineNumber;
      }
      sawRecordCandidate = true;

      if (tag === 'PT') {
        flushCurrent();

        if (fields.length > 0) {
          report(
            'warning',
            'MISSING_RECORD_SEPARATOR',
            'New PT tag found before the previous record was closed with ER',
            { recordIndex: references.length, line: lineNumber, tag: 'PT' },
          );
          finishRecord('implicit', lineNumber);
        }

        started = true;
        recordStartLine = lineNumber;
        current = { tag, lines: [value], line: lineNumber };
        continue;
      }

      flushCurrent();
      if (fields.length === 0) recordStartLine = lineNumber;
      current = { tag, lines: [value], line: lineNumber };
      continue;
    }

    if (!started || current === null) continue;

    // Continuation line. AU/AF values are later split on newlines, so the real
    // WoS layout (one author per indented line) becomes one author per entry
    // while wrapped titles/abstracts are joined by the field accessors.
    current.lines.push(line.trim());
  }

  flushCurrent();
  if (fields.length > 0) {
    report(
      'warning',
      'UNTERMINATED_RECORD',
      'End of input reached before the final WoS record was closed with ER',
      { recordIndex: references.length, line: recordStartLine },
    );
    finishRecord('eof', lines.length);
  }

  if (references.length === 0 && sawContent && !sawRecordCandidate) {
    report('error', 'NO_RECORDS', 'No WoS citation records could be found in the input', {
      line: 1,
    });
  }

  return { references, errors, warnings };
}

function buildReference(
  fields: readonly WosField[],
  recordIndex: number,
  recordStartLine: number,
  report: Reporter,
): CitationRecord | null {
  const title = getText(fields, ['TI', 'T1']) ?? '';
  if (title === '') {
    report('error', 'MISSING_TITLE', 'WoS record has no title (TI/T1)', {
      recordIndex,
      line: recordStartLine,
      tag: 'TI',
    });
    return null;
  }

  const typeCode = getText(fields, ['PT']);
  let type: Reference['type'] = 'misc';
  if (typeCode === undefined) {
    report('warning', 'MISSING_TYPE', 'WoS record has no PT (type) field', {
      recordIndex,
      line: recordStartLine,
      tag: 'PT',
    });
  } else {
    const mapped = WOS_TYPE_MAP[typeCode.toUpperCase()];
    if (mapped === undefined) {
      report('warning', 'UNKNOWN_TYPE', `Unrecognized WoS type code "${typeCode}"`, {
        recordIndex,
        line: recordStartLine,
        tag: 'PT',
      });
    } else {
      type = mapped;
    }
  }

  const reference: CitationRecord = {
    type,
    title,
    authors: getAuthors(fields),
    importedFrom: 'wos',
  };

  const yearText = getText(fields, ['PY', 'Y1']);
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

  const volume = getText(fields, ['VL']);
  if (volume !== undefined) reference.volume = volume;
  const issue = getText(fields, ['IS']);
  if (issue !== undefined) reference.issue = issue;

  const pages = combinePages(
    getText(fields, ['BP', 'SP']),
    getText(fields, ['EP']),
    getText(fields, ['AR']),
  );
  if (pages !== undefined) reference.pages = pages;

  const doiText = getText(fields, ['DI', 'DO']);
  if (doiText !== undefined) {
    const doi = normalizeDoi(doiText);
    if (doi !== '') {
      reference.doi = doi;
      if (!isValidDoi(doi)) {
        report('warning', 'INVALID_DOI', `DOI does not look well-formed: "${doi}"`, {
          recordIndex,
          line: recordStartLine,
          tag: 'DI',
        });
      }
    }
  }

  const url = getText(fields, ['UR']);
  if (url !== undefined) reference.url = url;

  const abstractText = getMultilineText(fields, ['AB']);
  if (abstractText !== undefined) {
    const abstract = normalizeAbstract(abstractText);
    if (abstract !== '') reference.abstract = abstract;
  }

  const publisher = getText(fields, ['PU', 'PB']);
  if (publisher !== undefined) {
    if (type === 'phdthesis' || type === 'masterthesis') reference.school = publisher;
    else reference.publisher = publisher;
  }

  const address = getText(fields, ['PA', 'CY', 'PI']);
  if (address !== undefined) reference.address = address;

  const editors = uniqueStrings(
    getValues(fields, ['BE', 'ED'])
      .flatMap((value) => splitList(value)),
  );
  if (editors.length > 0) reference.editors = editors;

  const series = getText(fields, ['SE']);
  if (series !== undefined) reference.series = series;
  const language = getText(fields, ['LA']);
  if (language !== undefined) reference.language = language;

  const month = extractMonth(getText(fields, ['PD']));
  if (month !== undefined) reference.month = month;

  const authorKeywords = getValues(fields, ['DE']);
  const keywordValues = authorKeywords.length > 0 ? authorKeywords : getValues(fields, ['ID']);
  const keywords = uniqueStrings(
    keywordValues
      .flatMap((value) => collapseWhitespace(value).split(';'))
      .map((keyword) => collapseWhitespace(keyword)),
  );
  if (keywords.length > 0) reference.keywords = keywords;

  const sn = getText(fields, ['SN']);
  const ei = getText(fields, ['EI']);
  if (sn !== undefined) {
    if (BOOK_LIKE_TYPES.has(type) || looksLikeIsbn(sn)) reference.isbn = sn;
    else reference.issn = sn;
  } else if (ei !== undefined) {
    reference.issn = ei;
  }

  const bn = getText(fields, ['BN']);
  if (bn !== undefined) reference.isbn = bn;

  return reference;
}

function getContainer(
  fields: readonly WosField[],
  type: Reference['type'],
): string | undefined {
  if (type === 'inproceedings' || type === 'incollection') {
    return getText(fields, ['SO', 'BT', 'CT', 'J9', 'JI']);
  }
  return getText(fields, ['SO', 'J9', 'JI', 'BT']);
}

function getAuthors(fields: readonly WosField[]): string[] {
  // AF contains full names; AU is the abbreviated fallback.
  const full = getValues(fields, ['AF']);
  const values = full.length > 0 ? full : getValues(fields, ['AU']);
  return uniqueStrings(values.flatMap((value) => splitList(value)));
}

function getValues(fields: readonly WosField[], tags: readonly string[]): string[] {
  const tagSet = new Set(tags);
  return fields
    .filter((field) => tagSet.has(field.tag) && field.value.trim() !== '')
    .map((field) => field.value);
}

function getText(fields: readonly WosField[], tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    const field = fields.find((candidate) => candidate.tag === tag && candidate.value.trim() !== '');
    if (field !== undefined) return collapseWhitespace(field.value);
  }
  return undefined;
}

function getMultilineText(
  fields: readonly WosField[],
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

function combinePages(
  startText?: string,
  endText?: string,
  articleNumber?: string,
): string | undefined {
  let start = startText === undefined ? undefined : collapseWhitespace(startText);
  let end = endText === undefined ? undefined : collapseWhitespace(endText);

  if (start !== undefined && start !== '' && (end === undefined || end === '')) {
    const range = /^(.+?)\s*[-\u2013\u2014]{1,2}\s*(.+)$/.exec(start);
    if (range?.[1] !== undefined && range[2] !== undefined) {
      start = range[1].trim();
      end = range[2].trim();
    }
  }

  if ((start === undefined || start === '') && (end === undefined || end === '')) {
    return articleNumber === undefined || articleNumber === '' ? undefined : articleNumber;
  }
  if (start === undefined || start === '') return end;
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

/** camelCase alias for callers that do not use the all-caps spelling. */
export const parseWos = parseWoS;
export const parseWosWithDiagnostics = parseWoSWithDiagnostics;