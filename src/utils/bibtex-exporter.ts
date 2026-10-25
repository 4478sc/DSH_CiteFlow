/**
 * BibTeX 导出工具。
 *
 * 职责：
 *  1. 把 {@link Reference} 渲染成标准 BibTeX 条目（字段顺序与常见学术工具一致）；
 *  2. 自动生成稳定的 citation key：`第一作者姓 + 年份 + 标题首单词`，例如 `liu2011sift`；
 *  3. 处理引文类型别名（conference -> inproceedings、mastersthesis -> masterthesis 等）；
 *  4. 转义 LaTeX 特殊字符，并把页码范围 `978-994` 规范成 `978--994`。
 *
 * 该模块不依赖数据库，可单独用于导入/导出脚本。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reference, ReferenceType } from '../types/reference.js';

export type { ReferenceType };

/* -------------------------------------------------------------------------- */
/* 错误类型                                                                    */
/* -------------------------------------------------------------------------- */

export interface BibtexExportErrorOptions {
  cause?: unknown;
  referenceId?: number;
}

export class BibtexExportError extends Error {
  /** 机器可读的错误码，便于上层 API 映射 HTTP 状态码。 */
  readonly code: string;
  /** 触发错误的文献 id（若可用）。 */
  readonly referenceId?: number;

  constructor(message: string, code = 'BIBTEX_EXPORT_ERROR', options: BibtexExportErrorOptions = {}) {
    super(message);
    this.name = 'BibtexExportError';
    this.code = code;
    this.referenceId = options.referenceId;
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
    // 兼容 ES5 目标下的 instanceof 判断。
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/* -------------------------------------------------------------------------- */
/* 类型映射                                                                    */
/* -------------------------------------------------------------------------- */

/** 数据库内部类型 -> BibTeX 条目类型。 */
export const BIBTEX_ENTRY_TYPES: Readonly<Record<ReferenceType, string>> = Object.freeze({
  article: 'article',
  inproceedings: 'inproceedings',
  book: 'book',
  // 注意：数据库/TypeScript 使用 masterthesis，BibTeX 标准拼写是 mastersthesis。
  masterthesis: 'mastersthesis',
  phdthesis: 'phdthesis',
  incollection: 'incollection',
  misc: 'misc',
});

/**
 * 常见别名 -> 规范类型。键是去掉空格/下划线/连字符并转小写后的形式，
 * 因此 "In Proceedings"、"in_proceedings"、"inproceedings" 都能解析。
 */
const REFERENCE_TYPE_ALIASES: Readonly<Record<string, ReferenceType>> = Object.freeze({
  article: 'article',
  journal: 'article',
  journalarticle: 'article',
  inproceedings: 'inproceedings',
  conference: 'inproceedings',
  conferencepaper: 'inproceedings',
  proceedings: 'inproceedings',
  paper: 'inproceedings',
  book: 'book',
  monograph: 'book',
  masterthesis: 'masterthesis',
  mastersthesis: 'masterthesis',
  masters: 'masterthesis',
  phdthesis: 'phdthesis',
  thesis: 'phdthesis',
  doctorathesis: 'phdthesis',
  doctoralthesis: 'phdthesis',
  incollection: 'incollection',
  inbook: 'incollection',
  chapter: 'incollection',
  bookchapter: 'incollection',
  misc: 'misc',
  online: 'misc',
  webpage: 'misc',
  website: 'misc',
  techreport: 'misc',
  technicalreport: 'misc',
  manual: 'misc',
  unpublished: 'misc',
  preprint: 'misc',
});

/**
 * 把任意来源的类型字符串归一化为数据库支持的 {@link ReferenceType}。
 * 未知类型会抛出 {@link BibtexExportError}，避免静默生成错误条目。
 */
export function normalizeReferenceType(type: string | null | undefined): ReferenceType {
  if (type === null || type === undefined || String(type).trim() === '') {
    throw new BibtexExportError('Reference type is required', 'INVALID_REFERENCE_TYPE');
  }
  const token = String(type)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  const normalized = REFERENCE_TYPE_ALIASES[token];
  if (!normalized) {
    throw new BibtexExportError(`Unsupported reference type: "${type}"`, 'INVALID_REFERENCE_TYPE');
  }
  return normalized;
}

/* -------------------------------------------------------------------------- */
/* 文本工具                                                                    */
/* -------------------------------------------------------------------------- */

const LATEX_SPECIALS: Readonly<Record<string, string>> = Object.freeze({
  '$': '\\$',
  '&': '\\&',
  '#': '\\#',
  '_': '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '{': '\\{',
  '}': '\\}',
  '\\': '\\textbackslash{}',
});

/** 无法通过 Unicode 分解得到 ASCII 基字符的特殊字母/符号。 */
const SPECIAL_LATEX: Readonly<Record<string, string>> = Object.freeze({
  'ß': '\\ss{}',
  'æ': '\\ae{}',
  'Æ': '\\AE{}',
  'œ': '\\oe{}',
  'Œ': '\\OE{}',
  'ø': '\\o{}',
  'Ø': '\\O{}',
  'ł': '\\l{}',
  'Ł': '\\L{}',
  'đ': '\\dj{}',
  'Đ': '\\DJ{}',
  'ð': '\\dh{}',
  'Ð': '\\DH{}',
  'þ': '\\th{}',
  'Þ': '\\TH{}',
  'ı': '\\i{}',
  'ȷ': '\\j{}',
  '€': '\\texteuro{}',
  '£': '\\pounds{}',
  '¥': '\\textyen{}',
  '©': '\\textcopyright{}',
  '®': '\\textregistered{}',
  '™': '\\texttrademark{}',
  '°': '\\textdegree{}',
  'µ': '\\textmu{}',
  '§': '\\S{}',
  '¶': '\\P{}',
  '±': '$\\pm$',
  '×': '$\\times$',
  '÷': '$\\div$',
  '–': '--',
  '—': '---',
  '‘': '`',
  '’': "'",
  '“': '``',
  '”': "''",
  '…': '\\ldots{}',
  '†': '\\dag{}',
  '‡': '\\ddag{}',
  '‰': '\\textperthousand{}',
});

/**
 * 可由“基字符 + 组合附加符”分解的字符 -> LaTeX 重音命令。
 * 例如 é -> \'{e}，ç -> \c{c}。
 */
const LATEX_UNICODE: Record<string, string> = (() => {
  const table: Record<string, string> = {};
  const accents: ReadonlyArray<readonly [string, string]> = [
    ["'", 'áéíóúýÁÉÍÓÚÝ'],
    ['`', 'àèìòùÀÈÌÒÙ'],
    ['^', 'âêîôûÂÊÎÔÛ'],
    ['"', 'äëïöüÿÄËÏÖÜŸ'],
    ['~', 'ãñõÃÑÕ'],
    ['c', 'çÇşŞţŢ'],
    ['v', 'čšžČŠŽřŘěĚ'],
    ['=', 'āēīōūĀĒĪŌŪ'],
    ['u', 'ăĕğĂĞ'],
    ['.', 'żŻėĖ'],
    ['k', 'ąęĄĘ'],
    ['r', 'åůÅŮ'],
    ['H', 'őűŐŰ'],
  ];

  for (const [accent, characters] of accents) {
    for (const character of characters) {
      const base = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      table[character] = `\\${accent}{${base}}`;
    }
  }
  Object.assign(table, SPECIAL_LATEX);
  return table;
})();

/** ASCII 化时使用的兜底映射（用于生成 key）。 */
const ASCII_FALLBACK: Readonly<Record<string, string>> = Object.freeze({
  'ß': 'ss',
  'æ': 'ae',
  'œ': 'oe',
  'ø': 'o',
  'ł': 'l',
  'đ': 'd',
  'ð': 'd',
  'þ': 'th',
  'ı': 'i',
  'å': 'a',
  'ń': 'n',
  'ś': 's',
  'ź': 'z',
  'ż': 'z',
  'ç': 'c',
  'ñ': 'n',
  'ș': 's',
  'ț': 't',
  'ğ': 'g',
});

/** 归一化空白：换行变空格、压缩连续空白，去掉首尾空格。 */
function cleanText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
}

/** 判断花括号是否配对（跳过 `\{`、`\}` 与命令名）。 */
function hasBalancedBraces(value: string): boolean {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

export interface EscapeOptions {
  /** `preserve` 保留 UTF-8 字符；`latex` 转成 LaTeX 重音命令。默认 `preserve`。 */
  unicode?: 'preserve' | 'latex';
  /** 是否转义 & % $ # _ ~ ^ \ 等特殊字符。默认 true。 */
  escapeSpecialCharacters?: boolean;
  /** 是否保留成对的 `{...}`（BibTeX 中用于保护大小写）。默认 true。 */
  preserveBraces?: boolean;
}

/**
 * 转义 BibTeX 字段值。
 *
 * - 已有的 `\&`、`\%` 等不会被二次转义；
 * - 成对花括号默认保留，用于保护专有名词大小写（如 `{SIFT}`）；
 * - 不配对的括号会被转义，保证输出始终是合法 BibTeX。
 */
export function escapeBibtex(value: string | null | undefined, options: EscapeOptions = {}): string {
  if (value === null || value === undefined || value === '') return '';

  const unicode = options.unicode ?? 'preserve';
  const escapeSpecial = options.escapeSpecialCharacters ?? true;
  const keepBraces = (options.preserveBraces ?? true) && hasBalancedBraces(value);

  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '\\') {
      if (!escapeSpecial) {
        output += character;
        continue;
      }
      const next = value[index + 1];
      // 已经是转义序列（\&、\%、\{ ...）或 LaTeX 命令（\'{e}、\textit ...）。
      if (next !== undefined && /["&%$#_{}]/.test(next)) {
        output += character + next;
        index += 1;
        continue;
      }
      if (next !== undefined && /[A-Za-z]/.test(next)) {
        output += character + next;
        index += 1;
        continue;
      }
      output += LATEX_SPECIALS['\\'];
      continue;
    }

    if (unicode === 'latex') {
      const mapped = LATEX_UNICODE[character];
      if (mapped !== undefined) {
        output += mapped;
        continue;
      }
    }

    if (character === '{' || character === '}') {
      output += keepBraces ? character : `\\${character}`;
      continue;
    }

    if (escapeSpecial) {
      const mapped = LATEX_SPECIALS[character];
      if (mapped !== undefined) {
        output += mapped;
        continue;
      }
    }

    output += character;
  }

  return output;
}

/** `escapeBibtex` 的别名，语义更直白。 */
export const escapeLatex = escapeBibtex;

/* -------------------------------------------------------------------------- */
/* 作者 / 页码 / 年月 / DOI                                                     */
/* -------------------------------------------------------------------------- */

const NAME_PARTICLES = new Set([
  'van', 'von', 'der', 'den', 'de', 'del', 'della', 'der', 'di', 'da', 'das',
  'dos', 'du', 'la', 'le', 'lo', 'bin', 'ibn', 'ter', 'ten', 'af', 'av', 'zu',
  'zum', 'zur', 'el', 'al', 'op', 'het',
]);

const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

/**
 * 把单个作者名规范成 BibTeX 的 `Last, First` 形式。
 *
 * - "Liu, Ce"        -> "Liu, Ce"
 * - "Ce Liu"         -> "Liu, Ce"
 * - "Ludwig van Beethoven" -> "van Beethoven, Ludwig"
 * - "{IEEE}"         -> "{IEEE}"（机构作者原样保留）
 */
export function formatAuthorName(name: string): string {
  const raw = cleanText(String(name ?? ''));
  if (!raw) return '';

  // 机构作者：{IEEE Computer Society}
  if (raw.startsWith('{') && raw.endsWith('}')) return raw;

  // 已经带有逗号：只规范空白。
  if (raw.includes(',')) {
    const [surnamePart, ...rest] = raw.split(',');
    const surname = surnamePart.trim();
    const given = rest.join(',').trim().replace(/\s+/g, ' ');
    return given ? `${surname}, ${given}` : surname;
  }

  const tokens = raw.split(' ').filter(Boolean);
  if (tokens.length <= 1) return raw;

  let lastIndex = tokens.length - 1;
  let suffix = '';
  if (NAME_SUFFIXES.has(tokens[lastIndex].toLowerCase())) {
    suffix = tokens[lastIndex];
    lastIndex -= 1;
    if (lastIndex < 0) return raw;
  }

  let firstIndex = lastIndex;
  while (firstIndex > 0 && NAME_PARTICLES.has(tokens[firstIndex - 1].toLowerCase())) {
    firstIndex -= 1;
  }

  const surname = tokens.slice(firstIndex, lastIndex + 1).join(' ');
  const given = tokens.slice(0, firstIndex).join(' ');
  const surnameWithSuffix = suffix ? `${surname}, ${suffix}` : surname;
  return given ? `${surnameWithSuffix}, ${given}` : surnameWithSuffix;
}

function toAuthorList(authors: readonly string[] | string | null | undefined): string[] {
  if (authors === null || authors === undefined) return [];
  if (typeof authors === 'string') {
    return authors
      .split(/\s+and\s+|;/i)
      .map((author) => author.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(authors)) return [];
  return authors
    .filter((author): author is string => typeof author === 'string')
    .map((author) => author.trim())
    .filter(Boolean);
}

/** 格式化作者列表："Liu, Ce and Yuen, Jenny and Torralba, Antonio"。 */
export function formatAuthors(authors: readonly string[] | string | null | undefined): string {
  return toAuthorList(authors)
    .map(formatAuthorName)
    .filter(Boolean)
    .join(' and ');
}

/**
 * 规范页码：单连字符/短破折号表示的页码范围转成 BibTeX 的 `--`。
 * "978-994" -> "978--994"，"3001–3008" -> "3001--3008"。
 */
export function formatPages(pages: string | number | null | undefined): string {
  if (pages === null || pages === undefined) return '';
  const text = String(pages).trim();
  if (!text) return '';
  return text.replace(/(\d)\s*[–—-]\s*(\d)/g, '$1--$2');
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  jan: 'January', january: 'January',
  feb: 'February', february: 'February',
  mar: 'March', march: 'March',
  apr: 'April', april: 'April',
  may: 'May',
  jun: 'June', june: 'June',
  jul: 'July', july: 'July',
  aug: 'August', august: 'August',
  sep: 'September', sept: 'September', september: 'September',
  oct: 'October', october: 'October',
  nov: 'November', november: 'November',
  dec: 'December', december: 'December',
});

/** 月份规范成英文全称：1 / "jan" / "January" -> "January"。无法识别返回空串。 */
export function formatMonth(month: string | number | null | undefined): string {
  if (month === null || month === undefined) return '';
  const text = String(month).trim();
  if (!text) return '';
  if (/^\d{1,2}$/.test(text)) {
    const index = Number(text) - 1;
    return MONTH_NAMES[index] ?? '';
  }
  return MONTH_ALIASES[text.toLowerCase().replace(/\.$/, '')] ?? text;
}

/** 年份规范化；非法年份返回空串（导出时直接省略该字段）。 */
export function formatYear(year: number | string | null | undefined): string {
  if (year === null || year === undefined || year === '') return '';
  const text = String(year).trim();
  if (/^\d{4}[a-z]?$/i.test(text)) return text;
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1000 && numeric <= 2200) return String(numeric);
  return '';
}

/** 去掉 DOI 的 URL / "doi:" 前缀。 */
export function normalizeDoi(doi: string | null | undefined): string {
  if (!doi) return '';
  return String(doi)
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Citation key 生成                                                           */
/* -------------------------------------------------------------------------- */

export interface BibtexKeyOptions {
  /** 标题以 A/An/The 开头时跳过，取下一个单词。默认 true（与 Google Scholar 一致）。 */
  skipLeadingArticles?: boolean;
  /** 缺少年份时使用的占位符，默认 "nd"。 */
  fallbackYear?: string;
  /** 标题没有可用单词时的占位符，默认 "untitled"。 */
  fallbackWord?: string;
  /** key 最大长度，默认 64。 */
  maxLength?: number;
}

function toAsciiToken(value: string): string {
  const decomposed = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let output = '';
  for (const character of decomposed) {
    if (/[A-Za-z0-9]/.test(character)) {
      output += character.toLowerCase();
      continue;
    }
    const fallback = ASCII_FALLBACK[character];
    if (fallback) output += fallback;
  }
  return output;
}

/** 从 "Liu, Ce" / "Ce Liu" / "van der Berg, Jan" 中取出姓。 */
function extractSurname(name: string): string {
  const raw = cleanText(String(name ?? '').replace(/[{}]/g, ''));
  if (!raw) return '';
  if (raw.includes(',')) return raw.split(',')[0].trim();

  const tokens = raw.split(' ').filter(Boolean);
  if (tokens.length <= 1) return raw;

  let lastIndex = tokens.length - 1;
  if (NAME_SUFFIXES.has(tokens[lastIndex].toLowerCase()) && lastIndex > 0) {
    lastIndex -= 1;
  }
  let firstIndex = lastIndex;
  while (firstIndex > 0 && NAME_PARTICLES.has(tokens[firstIndex - 1].toLowerCase())) {
    firstIndex -= 1;
  }
  return tokens.slice(firstIndex, lastIndex + 1).join(' ');
}

const TITLE_ARTICLES = new Set(['a', 'an', 'the']);

/** 提取标题中用于 key 的第一个单词（默认跳过开头的冠词）。 */
function firstTitleWord(title: string, skipArticles: boolean): string {
  const text = title
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/[\\{}]/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const words = text.split(/[\s:;,.\-–—_/()[\]"']+/u).filter(Boolean);

  let index = 0;
  while (
    skipArticles &&
    index < words.length - 1 &&
    TITLE_ARTICLES.has(words[index].toLowerCase())
  ) {
    index += 1;
  }

  for (; index < words.length; index += 1) {
    const token = toAsciiToken(words[index]);
    if (token) return token;
  }
  return '';
}

function sanitizeKeyCharacters(key: string): string {
  return String(key ?? '').trim().replace(/[^A-Za-z0-9:_.-]/g, '');
}

/** 清洗用户提供的 key（去掉非法字符）；清洗后可能为空字符串。 */
export function sanitizeBibtexKey(key: string | null | undefined): string {
  return sanitizeKeyCharacters(key ?? '');
}

/**
 * 生成 citation key：`第一作者姓 + 年份 + 标题首单词`，全部小写。
 *
 * 例：Liu, Ce et al. (2011) "Sift flow: Dense correspondence..." -> `liu2011sift`
 *
 * 注意：该函数是纯函数，不查重；批量导出时请用 {@link assignBibtexKeys}。
 */
export function generateBibtexKey(
  reference: Pick<Reference, 'authors' | 'year' | 'title'>,
  options: BibtexKeyOptions = {},
): string {
  const skipArticles = options.skipLeadingArticles ?? true;
  const fallbackYear = options.fallbackYear ?? 'nd';
  const fallbackWord = options.fallbackWord ?? 'untitled';
  const maxLength = options.maxLength ?? 64;

  const authors = toAuthorList(reference?.authors);
  let surname = '';
  for (const author of authors) {
    surname = extractSurname(author);
    if (surname) break;
  }

  const surnamePart = toAsciiToken(surname) || 'anon';
  const yearPart = formatYear(reference?.year) || fallbackYear;
  const wordPart = firstTitleWord(String(reference?.title ?? ''), skipArticles) || fallbackWord;

  const key = `${surnamePart}${yearPart}${wordPart}`;
  return key.slice(0, maxLength);
}

/** 优先使用文献自带的 bibtexKey，否则自动生成。 */
export function resolveBibtexKey(reference: Reference, options: BibtexKeyOptions = {}): string {
  const explicit = sanitizeBibtexKey(reference.bibtexKey);
  return explicit || generateBibtexKey(reference, options);
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

/**
 * 为一组文献分配互不冲突的 key。
 * 冲突时追加字母后缀：liu2011sift、liu2011sifta、liu2011siftb ...
 *
 * @param existingKeys 已经占用的 key（例如数据库中已有的 key）。
 */
export function assignBibtexKeys(
  references: readonly Reference[],
  existingKeys: Iterable<string> = [],
  keyOptions: BibtexKeyOptions = {},
): string[] {
  const used = new Set<string>();
  for (const key of existingKeys) {
    const sanitized = sanitizeBibtexKey(key);
    if (sanitized) used.add(sanitized.toLowerCase());
  }

  return references.map((reference) => {
    const base = resolveBibtexKey(reference, keyOptions);
    let candidate = base;
    let suffixIndex = 0;
    while (used.has(candidate.toLowerCase())) {
      suffixIndex += 1;
      candidate = `${base}${alphabeticSuffix(suffixIndex)}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/* -------------------------------------------------------------------------- */
/* 字段顺序                                                                    */
/* -------------------------------------------------------------------------- */

const FIELD_ORDER: Readonly<Record<ReferenceType, readonly string[]>> = Object.freeze({
  article: [
    'title', 'author', 'journal', 'volume', 'number', 'pages', 'year', 'month',
    'publisher', 'address', 'doi', 'url', 'issn', 'note', 'language',
  ],
  inproceedings: [
    'title', 'author', 'booktitle', 'pages', 'year', 'month', 'address',
    'publisher', 'organization', 'editor', 'series', 'volume', 'doi', 'url',
    'note', 'language',
  ],
  book: [
    'title', 'author', 'editor', 'publisher', 'address', 'year', 'month',
    'volume', 'number', 'series', 'edition', 'isbn', 'doi', 'url', 'note',
    'language',
  ],
  masterthesis: [
    'title', 'author', 'school', 'institution', 'address', 'year', 'month',
    'doi', 'url', 'note', 'language',
  ],
  phdthesis: [
    'title', 'author', 'school', 'institution', 'address', 'year', 'month',
    'doi', 'url', 'note', 'language',
  ],
  incollection: [
    'title', 'author', 'booktitle', 'editor', 'publisher', 'address', 'year',
    'pages', 'chapter', 'volume', 'series', 'edition', 'doi', 'url', 'note',
    'language',
  ],
  misc: [
    'title', 'author', 'howpublished', 'year', 'month', 'note', 'doi', 'url',
    'keywords',
  ],
});

/* -------------------------------------------------------------------------- */
/* 导出选项与渲染                                                              */
/* -------------------------------------------------------------------------- */

export interface BibtexExportOptions extends EscapeOptions, BibtexKeyOptions {
  /** 是否导出 abstract 字段，默认 false。 */
  includeAbstract?: boolean;
  /** 是否导出 keywords 字段，默认 false。 */
  includeKeywords?: boolean;
  /** 字段缩进，默认制表符。 */
  indent?: string;
  /** 换行符，默认 "\n"（Windows 文件可传 "\r\n"）。 */
  lineEnding?: '\n' | '\r\n';
  /** 已占用的 key，用于批量导出时避免冲突。 */
  existingKeys?: Iterable<string>;
}

interface ResolvedBibtexOptions {
  unicode: 'preserve' | 'latex';
  escapeSpecialCharacters: boolean;
  preserveBraces: boolean;
  includeAbstract: boolean;
  includeKeywords: boolean;
  indent: string;
  lineEnding: '\n' | '\r\n';
  existingKeys: Iterable<string>;
  keyOptions: BibtexKeyOptions;
}

function resolveOptions(options: BibtexExportOptions = {}): ResolvedBibtexOptions {
  return {
    unicode: options.unicode ?? 'preserve',
    escapeSpecialCharacters: options.escapeSpecialCharacters ?? true,
    preserveBraces: options.preserveBraces ?? true,
    includeAbstract: options.includeAbstract ?? false,
    includeKeywords: options.includeKeywords ?? false,
    indent: options.indent ?? '\t',
    lineEnding: options.lineEnding ?? '\n',
    existingKeys: options.existingKeys ?? [],
    keyOptions: {
      skipLeadingArticles: options.skipLeadingArticles,
      fallbackYear: options.fallbackYear,
      fallbackWord: options.fallbackWord,
      maxLength: options.maxLength,
    },
  };
}

function validateReference(reference: Reference): ReferenceType {
  if (!reference || typeof reference !== 'object') {
    throw new BibtexExportError('Reference must be an object', 'INVALID_REFERENCE');
  }
  if (typeof reference.title !== 'string' || !reference.title.trim()) {
    throw new BibtexExportError(
      `Cannot export reference${reference.id !== undefined ? ` #${reference.id}` : ''}: title is required`,
      'INVALID_REFERENCE',
      { referenceId: reference.id },
    );
  }
  if (!reference.type) {
    throw new BibtexExportError(
      `Cannot export reference${reference.id !== undefined ? ` #${reference.id}` : ''}: type is required`,
      'INVALID_REFERENCE',
      { referenceId: reference.id },
    );
  }
  return normalizeReferenceType(reference.type);
}

function collectFields(
  reference: Reference,
  type: ReferenceType,
  options: ResolvedBibtexOptions,
): Array<[string, string]> {
  const values = new Map<string, string>();

  const escape = (value: string | null | undefined): string =>
    escapeBibtex(cleanText(value ?? ''), options);

  const put = (name: string, value: string | null | undefined): void => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (text) values.set(name, text);
  };

  put('title', escape(reference.title));
  put('author', escape(formatAuthors(reference.authors)));
  put('editor', escape(formatAuthors(reference.editors)));
  put('journal', escape(reference.journal));
  put('booktitle', escape(reference.booktitle));
  put('publisher', escape(reference.publisher));
  put('address', escape(reference.address));
  put('school', escape(reference.school));
  put('institution', escape(reference.institution));
  put('organization', escape(reference.organization));
  put('series', escape(reference.series));
  put('edition', escape(reference.edition));
  put('chapter', escape(reference.chapter));
  put('volume', escape(reference.volume));
  put('number', escape(reference.issue));
  put('pages', escape(formatPages(reference.pages)));
  put('year', formatYear(reference.year));
  put('month', escape(formatMonth(reference.month)));
  put('doi', escape(normalizeDoi(reference.doi)));
  put('url', escape(reference.url));
  put('isbn', escape(reference.isbn));
  put('issn', escape(reference.issn));
  put('note', escape(reference.note));
  put('language', escape(reference.language));
  put('howpublished', escape(reference.howpublished));

  if (options.includeKeywords && Array.isArray(reference.keywords) && reference.keywords.length > 0) {
    put(
      'keywords',
      reference.keywords
        .map((keyword) => escape(keyword))
        .filter(Boolean)
        .join(', '),
    );
  }

  if (options.includeAbstract) {
    put('abstract', escape(reference.abstract));
  }

  const ordered: Array<[string, string]> = [];
  const emitted = new Set<string>();
  for (const field of FIELD_ORDER[type]) {
    const value = values.get(field);
    if (value !== undefined) {
      ordered.push([field, value]);
      emitted.add(field);
    }
  }
  for (const [field, value] of values) {
    if (!emitted.has(field)) ordered.push([field, value]);
  }
  return ordered;
}

function renderEntry(reference: Reference, key: string, options: ResolvedBibtexOptions): string {
  const type = validateReference(reference);
  const entryType = BIBTEX_ENTRY_TYPES[type];
  const fields = collectFields(reference, type, options);

  const lines: string[] = [`@${entryType}{${key},`];
  fields.forEach(([name, value], index) => {
    // BibTeX 惯例：最后一个字段不带尾逗号（与目标样例一致）。
    const separator = index < fields.length - 1 ? ',' : '';
    lines.push(`${options.indent}${name}={${value}}${separator}`);
  });
  lines.push('}');
  return lines.join(options.lineEnding);
}

/* -------------------------------------------------------------------------- */
/* 导出器                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * BibTeX 导出器。
 *
 * ```ts
 * const exporter = new BibtexExporter({ unicode: 'latex' });
 * const bib = exporter.exportReferences(references);
 * ```
 */
export class BibtexExporter {
  private readonly defaults: BibtexExportOptions;

  constructor(options: BibtexExportOptions = {}) {
    this.defaults = { ...options };
  }

  /** 为单条文献生成 key（考虑 explicit key 与 existingKeys）。 */
  generateKey(reference: Reference, options: BibtexExportOptions = {}): string {
    const resolved = resolveOptions({ ...this.defaults, ...options });
    return assignBibtexKeys([reference], resolved.existingKeys, resolved.keyOptions)[0];
  }

  /** 为一批文献生成互不冲突的 key。 */
  keysFor(references: readonly Reference[], options: BibtexExportOptions = {}): string[] {
    const resolved = resolveOptions({ ...this.defaults, ...options });
    return assignBibtexKeys(references, resolved.existingKeys, resolved.keyOptions);
  }

  /** 渲染单条文献。 */
  exportReference(reference: Reference, options: BibtexExportOptions = {}): string {
    const resolved = resolveOptions({ ...this.defaults, ...options });
    const [key] = assignBibtexKeys([reference], resolved.existingKeys, resolved.keyOptions);
    return renderEntry(reference, key, resolved);
  }

  /** 渲染多条文献，条目之间空一行。 */
  exportReferences(references: readonly Reference[], options: BibtexExportOptions = {}): string {
    const resolved = resolveOptions({ ...this.defaults, ...options });
    if (!Array.isArray(references) || references.length === 0) return '';
    const keys = assignBibtexKeys(references, resolved.existingKeys, resolved.keyOptions);
    return references
      .map((reference, index) => renderEntry(reference, keys[index], resolved))
      .join(resolved.lineEnding + resolved.lineEnding);
  }
}

/** 便捷函数：导出多条文献（忽略 null / undefined 项）。 */
export function exportToBibtex(
  references: readonly (Reference | null | undefined)[],
  options: BibtexExportOptions = {},
): string {
  const valid = references.filter((reference): reference is Reference => Boolean(reference));
  return new BibtexExporter(options).exportReferences(valid);
}

/** 便捷函数：导出单条文献。 */
export function exportReferenceToBibtex(
  reference: Reference,
  options: BibtexExportOptions = {},
): string {
  return new BibtexExporter(options).exportReference(reference);
}

/** 便捷函数：导出多条文献（v1 API 使用该名称）。 */
export function exportBibTeX(
  references: readonly (Reference | null | undefined)[],
  options: BibtexExportOptions = {},
): string {
  return exportToBibtex(references, options);
}

/** 兼容旧接口名。 */
export function referenceToBibtex(reference: Reference, options: BibtexExportOptions = {}): string {
  return exportReferenceToBibtex(reference, options);
}

/** 兼容旧接口名。 */
export function referencesToBibtex(
  references: readonly (Reference | null | undefined)[],
  options: BibtexExportOptions = {},
): string {
  return exportToBibtex(references, options);
}

/**
 * 把文献写入 .bib 文件（UTF-8，自动创建父目录，末尾补换行）。
 * 返回实际写入的绝对路径。
 */
export function writeBibtexFile(
  filePath: string,
  references: readonly Reference[],
  options: BibtexExportOptions = {},
): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new BibtexExportError('A destination file path is required', 'INVALID_PATH');
  }
  const exporter = new BibtexExporter(options);
  const content = exporter.exportReferences(references);
  const lineEnding = options.lineEnding ?? '\n';
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content ? content + lineEnding : '', 'utf8');
  } catch (error) {
    throw new BibtexExportError(
      `Failed to write BibTeX file "${filePath}": ${(error as Error).message}`,
      'IO_ERROR',
      { cause: error },
    );
  }
  return filePath;
}

export default BibtexExporter;
