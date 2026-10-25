/**
 * Parser-facing citation types.
 *
 * Both importers normalize their input to {@link CitationRecord}, which extends
 * the application's {@link Reference} model. That keeps parser output directly
 * usable by the database layer and the BibTeX exporter while giving callers a
 * common type for RIS and Web of Science records.
 */

import type { Reference } from '../types/reference.js';

/** Supported source formats. */
export type CitationFormat = 'ris' | 'wos';

/**
 * A normalized citation record.
 *
 * All fields required by the application are populated; format-specific values
 * that have no counterpart (for example an RIS `ER` terminator) are not exposed.
 */
export interface CitationRecord extends Reference {
  /** Source format, also persisted in the `imported_from` database column. */
  importedFrom: CitationFormat;
}

/** Machine-readable categories for parser diagnostics. */
export type CitationDiagnosticCode =
  | 'EMPTY_RECORD'
  | 'MISSING_TYPE'
  | 'UNKNOWN_TYPE'
  | 'MISSING_TITLE'
  | 'INVALID_YEAR'
  | 'INVALID_DOI'
  | 'UNTERMINATED_RECORD'
  | 'MISSING_RECORD_SEPARATOR'
  | 'NO_RECORDS';

/** A recoverable warning or a per-record error found while parsing. */
export interface CitationDiagnostic {
  severity: 'error' | 'warning';
  code: CitationDiagnosticCode;
  message: string;
  /** Zero-based index among successfully parsed records. */
  recordIndex?: number;
  /** One-based source line number, when known. */
  line?: number;
  /** Source tag involved, e.g. `TY`, `PT`, `PY`, or `DI`. */
  tag?: string;
}

/** Result returned by the diagnostic-aware parser entry points. */
export interface CitationParseResult {
  references: CitationRecord[];
  errors: CitationDiagnostic[];
  warnings: CitationDiagnostic[];
}

/** Options accepted by both parsers. */
export interface CitationParserOptions {
  /**
   * Called synchronously for every diagnostic. Useful for logging without
   * switching to the diagnostic-aware parser functions.
   */
  onDiagnostic?: (diagnostic: CitationDiagnostic) => void;
}