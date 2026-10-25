-- ============================================================
-- Reference Manager - SQLite schema (MVP)
-- Target: SQLite >= 3.35 (better-sqlite3 bundles a recent SQLite)
-- Apply once with foreign_keys enabled. See docs/architecture.md.
-- NOTE: this canonical schema uses `papers` / `categories`. The current
-- scaffold uses quoted "references" / `folders`; see section 13 of the design
-- before applying this file to an existing database.
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

BEGIN;

-- ------------------------------------------------------------
-- 1. categories: adjacency-list tree (unlimited depth)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- Self-reference is never valid. Deeper cycles are rejected in the service layer.
  CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Sibling names must be unique. COALESCE makes root names unique too
-- (SQLite treats NULLs as distinct in a plain UNIQUE index).
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_parent_name
  ON categories (COALESCE(parent_id, 0), name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS ix_categories_parent
  ON categories (parent_id, sort_order, name);

-- ------------------------------------------------------------
-- 2. papers: normalized metadata from RIS / WoS / manual entry
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS papers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type           TEXT    NOT NULL DEFAULT 'article',
  title          TEXT    NOT NULL CHECK (length(trim(title)) > 0),

  -- JSON array of author strings in source order, e.g.
  -- ["Vaswani, Ashish", "Shazeer, Noam"]
  authors_json   TEXT    NOT NULL DEFAULT '[]'
                         CHECK (json_valid(authors_json)
                                AND json_type(authors_json) = 'array'),
  keywords_json  TEXT    NOT NULL DEFAULT '[]'
                         CHECK (json_valid(keywords_json)
                                AND json_type(keywords_json) = 'array'),

  year           INTEGER CHECK (year IS NULL OR year BETWEEN 1000 AND 2999),
  publication    TEXT,              -- journal / booktitle / source title
  volume         TEXT,
  issue          TEXT,
  pages          TEXT,              -- free text: "1-12", "e123", "Suppl 1"
  publisher      TEXT,
  doi            TEXT,              -- normalized: lowercase, no URL prefix
  url            TEXT,
  abstract       TEXT,
  language       TEXT,
  citation_key   TEXT,              -- persisted so BibTeX keys stay stable
  notes          TEXT,
  source_format  TEXT    NOT NULL DEFAULT 'manual'
                         CHECK (source_format IN ('ris', 'wos', 'manual')),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ix_papers_category
  ON papers (category_id, year DESC, title);

CREATE INDEX IF NOT EXISTS ix_papers_created
  ON papers (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_papers_updated
  ON papers (updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_papers_title
  ON papers (title);

CREATE INDEX IF NOT EXISTS ix_papers_year
  ON papers (year DESC);

CREATE INDEX IF NOT EXISTS ix_papers_publication
  ON papers (publication);

-- DOI is the primary deduplication key. Empty strings are allowed,
-- but only one non-empty value is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_doi
  ON papers (doi COLLATE NOCASE)
  WHERE doi IS NOT NULL AND trim(doi) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_citation_key
  ON papers (citation_key COLLATE NOCASE)
  WHERE citation_key IS NOT NULL AND trim(citation_key) <> '';

-- ------------------------------------------------------------
-- 3. files: PDFs and supplementary files attached to a paper
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id       INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL DEFAULT 'pdf'
                         CHECK (kind IN ('pdf', 'supplement', 'other')),
  original_name  TEXT    NOT NULL CHECK (length(trim(original_name)) > 0),

  -- Path relative to STORAGE_DIR. Never expose this value directly.
  -- Convention: papers/<paperId>/<uuid>.pdf
  storage_path   TEXT    NOT NULL UNIQUE,
  mime_type      TEXT    NOT NULL DEFAULT 'application/pdf',
  size_bytes     INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  sha256         TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0
                         CHECK (is_primary IN (0, 1)
                                AND (is_primary = 0 OR kind = 'pdf')),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ix_files_paper
  ON files (paper_id, is_primary DESC, created_at);

CREATE INDEX IF NOT EXISTS ix_files_sha256
  ON files (sha256);

-- At most one primary file per paper.
CREATE UNIQUE INDEX IF NOT EXISTS ux_files_one_primary
  ON files (paper_id)
  WHERE is_primary = 1;

-- 4. updated_at is maintained by the service layer on every UPDATE.

COMMIT;

-- Migration marker. The app's migration runner owns this value;
-- it is set here only when applying the schema manually.
-- PRAGMA user_version = 1;
