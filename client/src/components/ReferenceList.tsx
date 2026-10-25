import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus2,
  FolderInput,
  FolderOpen,
  Library,
  Menu,
  Minus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Folder, Reference, SortKey } from '../types';
import {
  flattenFolders,
  formatAuthors,
  getVenue,
  typeShortLabels,
  typeLabels,
} from '../utils/format';

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'added', label: 'Recently added' },
  { value: 'year-desc', label: 'Year · newest' },
  { value: 'year-asc', label: 'Year · oldest' },
  { value: 'title', label: 'Title · A–Z' },
  { value: 'author', label: 'First author' },
];

interface ReferenceListProps {
  folderName: string;
  folderPath: Folder[];
  folders: Folder[];
  references: Reference[];
  selectedId: number | null;
  checkedIds: Set<number>;
  loading: boolean;
  sort: SortKey;
  search: string;
  exporting: boolean;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
  onSelectReference: (id: number) => void;
  onToggleChecked: (id: number) => void;
  onToggleAll: () => void;
  onClearChecked: () => void;
  onOpenImport: () => void;
  onAddPdf: () => void;
  onExport: (ids?: number[]) => void;
  onMoveSelected: (folderId: number | null) => Promise<void>;
  onDeleteSelected: () => void;
  onOpenSidebar: () => void;
}

export default function ReferenceList({
  folderName,
  folderPath,
  folders,
  references,
  selectedId,
  checkedIds,
  loading,
  sort,
  search,
  exporting,
  onSearchChange,
  onSortChange,
  onSelectReference,
  onToggleChecked,
  onToggleAll,
  onClearChecked,
  onOpenImport,
  onAddPdf,
  onExport,
  onMoveSelected,
  onDeleteSelected,
  onOpenSidebar,
}: ReferenceListProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<'sort' | 'move' | null>(null);
  const [moving, setMoving] = useState(false);

  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const folderDepth = useMemo(() => {
    const byId = new Map(flatFolders.map((folder) => [folder.id, folder]));
    const depths = new Map<number, number>();
    flatFolders.forEach((folder) => {
      let depth = 0;
      let current = folder;
      const guard = new Set<number>();
      while (current.parentId != null && !guard.has(current.id)) {
        guard.add(current.id);
        depth += 1;
        const parent = byId.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
      depths.set(folder.id, depth);
    });
    return depths;
  }, [flatFolders]);
  const allChecked = references.length > 0 && references.every((reference) => checkedIds.has(reference.id));
  const someChecked = references.some((reference) => checkedIds.has(reference.id));
  const checkedCount = checkedIds.size;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openMenu]);

  const chooseMoveTarget = async (folderId: number | null) => {
    setMoving(true);
    try {
      await onMoveSelected(folderId);
      setOpenMenu(null);
    } finally {
      setMoving(false);
    }
  };

  const currentSort = sortOptions.find((option) => option.value === sort)?.label ?? 'Recently added';

  const handleSelectAllClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleAll();
  };

  return (
    <main className="library-pane">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button sidebar-toggle" onClick={onOpenSidebar} aria-label="Open collections">
            <Menu size={18} />
          </button>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span className="breadcrumb-root">
              <Library size={13} />
              Library
            </span>
            {folderPath.length === 0 ? (
              <>
                <ChevronRight size={12} className="breadcrumb-separator" />
                <span className="breadcrumb-current">All References</span>
              </>
            ) : (
              folderPath.map((folder, index) => (
                <span className="breadcrumb-part" key={folder.id}>
                  <ChevronRight size={12} className="breadcrumb-separator" />
                  <span className={index === folderPath.length - 1 ? 'breadcrumb-current' : undefined}>
                    {folder.name}
                  </span>
                </span>
              ))
            )}
          </nav>
        </div>

        <div className="topbar-actions">
          <button
            className="button button-quiet"
            onClick={() => onExport()}
            disabled={exporting || references.length === 0}
            title="Export the current collection as BibTeX"
          >
            <Download size={15} className={exporting ? 'spin' : undefined} />
            <span>{exporting ? 'Exporting' : 'Export'}</span>
          </button>
          <button className="button button-quiet" onClick={onAddPdf} title="Attach a PDF to the library">
            <FilePlus2 size={15} />
            <span>Add PDF</span>
          </button>
          <button className="button button-primary" onClick={onOpenImport}>
            <Upload size={15} />
            <span>Import</span>
          </button>
        </div>
      </header>

      <div className="library-body">
        <section className="library-heading">
          <div className="heading-copy">
            <span className="eyebrow">
              {folderPath.length > 0 ? 'Collection' : 'Workspace overview'}
            </span>
            <h1>{folderName}</h1>
            <p className="heading-meta">
              {loading && references.length === 0 ? (
                'Loading references…'
              ) : search ? (
                <>
                  <strong>{references.length}</strong> matches for “{search}”
                </>
              ) : (
                <>
                  <strong>{references.length}</strong> {references.length === 1 ? 'reference' : 'references'}
                  <span className="meta-dot" />
                  Updated for your reading
                </>
              )}
            </p>
          </div>

          <div className="search-field">
            <Search size={15} className="search-icon" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search title, author, DOI…"
              aria-label="Search references"
              spellCheck={false}
            />
            {search ? (
              <button className="search-clear" onClick={() => onSearchChange('')} aria-label="Clear search">
                <X size={13} />
              </button>
            ) : (
              <kbd className="key-hint">/</kbd>
            )}
          </div>
        </section>

        {checkedCount > 0 ? (
          <div className="bulk-bar" role="region" aria-label="Bulk actions" ref={menuRef}>
            <div className="bulk-selection">
              <span className="bulk-check">
                <Check size={12} />
              </span>
              <strong>{checkedCount}</strong> selected
              <button className="bulk-clear" onClick={onClearChecked} aria-label="Clear selection">
                <X size={13} />
              </button>
            </div>
            <div className="bulk-actions">
              <button className="bulk-button" onClick={() => onExport([...checkedIds])} disabled={exporting}>
                <Download size={14} />
                BibTeX
              </button>
              <div className="menu-anchor">
                <button
                  className="bulk-button"
                  onClick={() => setOpenMenu((current) => (current === 'move' ? null : 'move'))}
                  aria-expanded={openMenu === 'move'}
                >
                  <FolderInput size={14} />
                  Move to
                  <ChevronDown size={12} />
                </button>
                {openMenu === 'move' && (
                  <div className="control-dropdown move-dropdown" ref={menuRef}>
                    <div className="dropdown-label">Move {checkedCount} to</div>
                    <button className="move-option" onClick={() => void chooseMoveTarget(null)} disabled={moving}>
                      <Library size={14} />
                      All References
                    </button>
                    <div className="dropdown-separator" />
                    {flatFolders.map((folder) => (
                      <button
                        key={folder.id}
                        className="move-option"
                        style={{ paddingLeft: `${12 + (folderDepth.get(folder.id) ?? 0) * 14}px` }}
                        onClick={() => void chooseMoveTarget(folder.id)}
                        disabled={moving}
                      >
                        <FolderOpen size={14} />
                        {folder.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="bulk-button is-danger" onClick={onDeleteSelected}>
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="list-controls">
            <div className="list-summary">
              <span className="summary-pill">
                <BookOpen size={13} />
                {search ? 'Filtered view' : 'All types'}
              </span>
              {loading && <span className="sync-label">Refreshing…</span>}
            </div>
            <div className="control-actions" ref={menuRef}>
              <div className="menu-anchor">
                <button
                  className="sort-button"
                  onClick={() => setOpenMenu((current) => (current === 'sort' ? null : 'sort'))}
                  aria-expanded={openMenu === 'sort'}
                  aria-label="Sort references"
                >
                  <ArrowUpDown size={14} />
                  <span>{currentSort}</span>
                  <ChevronDown size={12} />
                </button>
                {openMenu === 'sort' && (
                  <div className="control-dropdown sort-dropdown">
                    <div className="dropdown-label">Sort by</div>
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`sort-option ${sort === option.value ? 'is-active' : ''}`}
                        onClick={() => {
                          onSortChange(option.value);
                          setOpenMenu(null);
                        }}
                      >
                        <span>{option.label}</span>
                        {sort === option.value && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="reference-table-wrap">
          {loading && <div className="table-loading-line" />}
          <div className="reference-table" role="table" aria-label="References" aria-busy={loading}>
            <div className="reference-table-head" role="row">
              <button
                className={`check-button ${allChecked ? 'is-checked' : someChecked ? 'is-mixed' : ''}`}
                role="checkbox"
                aria-checked={allChecked ? true : someChecked ? 'mixed' : false}
                aria-label="Select all references"
                onClick={handleSelectAllClick}
              >
                {allChecked ? <Check size={12} /> : someChecked ? <Minus size={12} /> : null}
              </button>
              <span className="head-title" role="columnheader">
                Reference
              </span>
              <span className="head-source" role="columnheader">
                Source
              </span>
              <span className="head-year" role="columnheader">
                Year
              </span>
            </div>

            <div className="reference-rows">
              {loading && references.length === 0
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div className="reference-row skeleton-row" key={index}>
                      <span className="skeleton-check" />
                      <div className="skeleton-title-group">
                        <span className="skeleton-line skeleton-title" />
                        <span className="skeleton-line skeleton-author" />
                      </div>
                      <span className="skeleton-line skeleton-venue" />
                      <span className="skeleton-line skeleton-year" />
                    </div>
                  ))
                : references.map((reference) => {
                    const isChecked = checkedIds.has(reference.id);
                    const isSelected = selectedId === reference.id;
                    return (
                      <div
                        className={`reference-row ${isSelected ? 'is-selected' : ''} ${
                          isChecked ? 'is-checked' : ''
                        }`}
                        key={reference.id}
                        role="row"
                        tabIndex={0}
                        onClick={() => onSelectReference(reference.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectReference(reference.id);
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        <button
                          className={`check-button ${isChecked ? 'is-checked' : ''}`}
                          role="checkbox"
                          aria-checked={isChecked}
                          aria-label={`Select ${reference.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleChecked(reference.id);
                          }}
                        >
                          {isChecked ? <Check size={12} /> : null}
                        </button>

                        <div className="row-main" role="cell">
                          <div className="row-title-line">
                            {reference.starred && (
                              <Star size={12} className="row-star" fill="currentColor" aria-label="Starred" />
                            )}
                            <span className="row-title" title={reference.title}>
                              {reference.title}
                            </span>
                          </div>
                          <div className="row-subline">
                            <span className={`type-dot type-${reference.type}`} aria-hidden="true" />
                            <span className="row-authors">{formatAuthors(reference.authors, 3)}</span>
                            <span className="row-divider">·</span>
                            <span className="row-type">{typeShortLabels[reference.type]}</span>
                          </div>
                        </div>

                        <div className="row-source" role="cell">
                          <span className="venue" title={getVenue(reference)}>
                            {getVenue(reference)}
                          </span>
                          <span className="venue-sub" title={typeLabels[reference.type]}>
                            {typeLabels[reference.type]}
                          </span>
                        </div>

                        <span className="row-year" role="cell">
                          {reference.year ?? '—'}
                        </span>
                      </div>
                    );
                  })}
            </div>

            {!loading && references.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">
                  {search ? <Search size={24} /> : <Sparkles size={24} />}
                </span>
                <h2>{search ? 'No matching references' : 'A quiet collection'}</h2>
                <p>
                  {search
                    ? `Nothing in this collection matches “${search}”. Try a broader search or clear the filter.`
                    : 'Import a RIS or Web of Science file, or add a PDF to begin building this collection.'}
                </p>
                {search ? (
                  <button className="button button-secondary" onClick={() => onSearchChange('')}>
                    Clear search
                  </button>
                ) : (
                  <button className="button button-primary" onClick={onOpenImport}>
                    <Upload size={15} />
                    Import references
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="list-footer">
          <span>
            {references.length === 0 ? 'No references to show' : `${references.length} ${references.length === 1 ? 'reference' : 'references'} shown`}
          </span>
          <span className="footer-note">
            <span className="footer-dot" />
            BibTeX ready
            <span className="shortcut-note">
              <kbd>/</kbd> to search
            </span>
          </span>
        </footer>
      </div>
    </main>
  );
}