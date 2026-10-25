-- ============================================================================
-- Reference Manager - SQLite schema
--
-- Design notes
-- * `"references"` is quoted everywhere because REFERENCES is a reserved word
--   in SQLite.
-- * Array-like values (authors / editors / keywords) are stored as JSON text so
--   a single row round-trips without extra join tables. JSON1 is built into
--   every SQLite version bundled with better-sqlite3, so `json_valid()` can be
--   used for integrity checks.
-- * All timestamps are UTC ISO-8601 strings ("2024-01-31T08:12:33.123Z") so they
--   sort lexicographically and survive JSON transport unchanged.
-- * Every statement is idempotent (IF NOT EXISTS / INSERT OR IGNORE), which
--   makes this file safe to run on every application start.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- meta: schema bookkeeping (version, creation time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO meta (key, value)
VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- ---------------------------------------------------------------------------
-- folders: self-referencing tree of collections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  parent_id   INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  description TEXT,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (parent_id IS NULL OR id IS NULL OR id <> parent_id)
);

-- Names must be unique among siblings (case-insensitive). Two partial indexes
-- are needed because SQLite treats NULLs as distinct in UNIQUE constraints.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_root
  ON folders (name COLLATE NOCASE) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_child
  ON folders (parent_id, name COLLATE NOCASE) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);

-- ---------------------------------------------------------------------------
-- "references": bibliographic records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "references" (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL DEFAULT 'article'
                        CHECK (type IN ('article', 'inproceedings', 'book',
                                        'masterthesis', 'phdthesis',
                                        'incollection', 'misc')),
  title         TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  authors       TEXT    NOT NULL DEFAULT '[]'
                        CHECK (json_valid(authors) AND json_type(authors) = 'array'),
  editors       TEXT    NOT NULL DEFAULT '[]'
                        CHECK (json_valid(editors) AND json_type(editors) = 'array'),
  year          INTEGER CHECK (year IS NULL OR (year BETWEEN 1000 AND 2200)),
  journal       TEXT,
  booktitle     TEXT,
  volume        TEXT,
  issue         TEXT,
  pages         TEXT,
  publisher     TEXT,
  address       TEXT,
  school        TEXT,
  institution   TEXT,
  organization  TEXT,
  series        TEXT,
  edition       TEXT,
  chapter       TEXT,
  month         TEXT,
  note          TEXT,
  language      TEXT,
  isbn          TEXT,
  issn          TEXT,
  doi           TEXT,
  url           TEXT,
  abstract      TEXT,
  keywords      TEXT    NOT NULL DEFAULT '[]'
                        CHECK (json_valid(keywords) AND json_type(keywords) = 'array'),
  bibtex_key    TEXT    NOT NULL CHECK (length(trim(bibtex_key)) > 0),
  pdf_path      TEXT,
  folder_id     INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  imported_from TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_references_bibtex_key
  ON "references" (bibtex_key COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_references_folder_id ON "references" (folder_id);
CREATE INDEX IF NOT EXISTS idx_references_type ON "references" (type);
CREATE INDEX IF NOT EXISTS idx_references_year ON "references" (year);
CREATE INDEX IF NOT EXISTS idx_references_doi ON "references" (doi);
CREATE INDEX IF NOT EXISTS idx_references_title ON "references" (title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_references_updated_at ON "references" (updated_at DESC);

-- ---------------------------------------------------------------------------
-- files: PDF (and other) attachments of a reference
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id INTEGER NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  file_name    TEXT    NOT NULL CHECK (length(trim(file_name)) > 0),
  file_path    TEXT    NOT NULL CHECK (length(trim(file_path)) > 0),
  file_type    TEXT    NOT NULL DEFAULT 'pdf'
                       CHECK (file_type IN ('pdf', 'html', 'txt', 'doc', 'docx',
                                            'epub', 'other')),
  mime_type    TEXT,
  file_size    INTEGER CHECK (file_size IS NULL OR file_size >= 0),
  checksum     TEXT,
  is_primary   INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (reference_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_files_reference_id ON files (reference_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files (file_path);
-- At most one primary attachment per reference.
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_single_primary
  ON files (reference_id) WHERE is_primary = 1;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS folder_reference_counts AS
SELECT f.id        AS folder_id,
       COUNT(r.id) AS reference_count
FROM folders f
LEFT JOIN "references" r ON r.folder_id = f.id
GROUP BY f.id;

CREATE VIEW IF NOT EXISTS reference_details AS
SELECT r.*,
       f.name AS folder_name
FROM "references" r
LEFT JOIN folders f ON f.id = r.folder_id;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
--
-- The triggers only fire when a statement does not set updated_at itself, so
-- the TypeScript layer stays in control while ad-hoc SQL still behaves.
-- (recursive_triggers is OFF by default, so the inner UPDATE cannot re-enter.)
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_references_touch_updated_at
AFTER UPDATE ON "references"
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE "references"
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_folders_touch_updated_at
AFTER UPDATE ON folders
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE folders
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_files_touch_updated_at
AFTER UPDATE ON files
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE files
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Guard against folder cycles introduced through ad-hoc SQL. The TypeScript
-- layer performs the same check with a clearer error message.
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_folders_prevent_cycle
BEFORE UPDATE OF parent_id ON folders
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'folder hierarchy cycle detected')
  WHERE NEW.parent_id = NEW.id
     OR NEW.parent_id IN (
          WITH RECURSIVE descendants(id) AS (
            SELECT id FROM folders WHERE parent_id = NEW.id
            UNION ALL
            SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
          )
          SELECT id FROM descendants
        );
END;
