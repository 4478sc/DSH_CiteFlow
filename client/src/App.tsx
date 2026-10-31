import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ReferenceList from './components/ReferenceList';
import ReferenceDetail from './components/ReferenceDetail';
import ImportDialog from './components/ImportDialog';
import ConfirmDialog from './components/ConfirmDialog';
import api, { getDataSource } from './services/api';
import type {
  DataSource,
  Folder,
  ImportKind,
  ImportResult,
  Reference,
  SortKey,
  ToastKind,
  ToastMessage,
} from './types';
import {
  downloadBlob,
  findFolder,
  folderPath,
  slugifyFilename,
  sortReferences,
} from './utils/format';

let toastSequence = 0;

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [references, setReferences] = useState<Reference[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [dataSource, setDataSource] = useState<DataSource>('api');
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<ImportKind>('ris');
  const [importFolderId, setImportFolderId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const closeTimerIds = useRef<number[]>([]);
  const detailRequestSeq = useRef(0);

  const addToast = useCallback((kind: ToastKind, title: string, description?: string) => {
    const id = ++toastSequence;
    setToasts((previous) => [...previous.slice(-2), { id, kind, title, description }]);
    const timer = window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4300);
    closeTimerIds.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      closeTimerIds.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const refreshFolders = useCallback(async (): Promise<Folder[]> => {
    const list = await api.getFolders();
    setFolders(list);
    setDataSource(getDataSource());
    return list;
  }, []);

  useEffect(() => {
    let active = true;
    setFoldersLoading(true);
    refreshFolders()
      .catch((error: unknown) => {
        if (active) addToast('error', 'Could not load collections', api.errorMessage(error));
      })
      .finally(() => {
        if (active) setFoldersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshFolders, addToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setReferencesLoading(true);
    api
      .getReferences(selectedFolderId, searchTerm, sort)
      .then((list) => {
        if (!active) return;
        const sorted = sortReferences(list, sort);
        setReferences(sorted);
        setDataSource(getDataSource());
        setSelectedReferenceId((current) => {
          if (current != null && sorted.some((reference) => reference.id === current)) return current;
          if (window.innerWidth <= 1100) return null;
          return sorted[0]?.id ?? null;
        });
        setCheckedIds((current) => {
          const validIds = new Set(sorted.map((reference) => reference.id));
          return new Set([...current].filter((id) => validIds.has(id)));
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setReferences([]);
        setSelectedReferenceId(null);
        addToast('error', 'Could not load references', api.errorMessage(error));
      })
      .finally(() => {
        if (active) setReferencesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedFolderId, searchTerm, sort, reloadToken, addToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (window.innerWidth <= 1100) setSelectedReferenceId(null);
      if (window.innerWidth <= 820) setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentFolder = useMemo(
    () => findFolder(folders, selectedFolderId),
    [folders, selectedFolderId],
  );
  const folderName = selectedFolderId == null ? 'All References' : currentFolder?.name ?? 'Collection';
  const currentPath = useMemo(
    () => folderPath(folders, selectedFolderId),
    [folders, selectedFolderId],
  );
  const selectedReference = useMemo(
    () => references.find((reference) => reference.id === selectedReferenceId) ?? null,
    [references, selectedReferenceId],
  );

  const handleSelectFolder = (id: number | null) => {
    setSelectedFolderId(id);
    setSelectedReferenceId(null);
    setCheckedIds(new Set());
    setSearchInput('');
    setSearchTerm('');
    setSidebarOpen(false);
  };

  const handleCreateFolder = async (name: string, parentId: number | null) => {
    try {
      const created = await api.createFolder(name, parentId);
      await refreshFolders();
      setDataSource(getDataSource());
      setSelectedFolderId(created.id);
      setSelectedReferenceId(null);
      setCheckedIds(new Set());
      setSearchInput('');
      setSearchTerm('');
      addToast('success', 'Collection created', `“${created.name}” is ready for references.`);
    } catch (error) {
      addToast('error', 'Could not create collection', api.errorMessage(error));
      throw error;
    }
  };

  const handleRenameFolder = async (id: number, name: string) => {
    try {
      await api.renameFolder(id, name);
      await refreshFolders();
      setDataSource(getDataSource());
      addToast('success', 'Collection renamed', `Renamed to “${name}”.`);
    } catch (error) {
      addToast('error', 'Could not rename collection', api.errorMessage(error));
      throw error;
    }
  };

  const handleDeleteFolder = async (id: number) => {
    try {
      await api.deleteFolder(id);
      const nextFolders = await refreshFolders();
      setDataSource(getDataSource());
      if (selectedFolderId != null && !findFolder(nextFolders, selectedFolderId)) {
        setSelectedFolderId(null);
        setSelectedReferenceId(null);
        setCheckedIds(new Set());
        setSearchInput('');
        setSearchTerm('');
      }
      setReloadToken((current) => current + 1);
      addToast('success', 'Collection deleted', 'References were kept in your library.');
    } catch (error) {
      addToast('error', 'Could not delete collection', api.errorMessage(error));
      throw error;
    }
  };

  const handleMoveFolder = async (id: number, parentId: number | null) => {
    try {
      const moved = await api.moveFolder(id, parentId);
      await refreshFolders();
      setDataSource(getDataSource());
      const destination = parentId == null ? 'the top level' : `“${findFolder(folders, parentId)?.name ?? 'collection'}”`;
      addToast('success', 'Collection moved', `“${moved.name}” now lives in ${destination}.`);
    } catch (error) {
      addToast('error', 'Could not move collection', api.errorMessage(error));
    }
  };

  const toggleChecked = (id: number) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setCheckedIds((current) => {
      const allVisibleSelected = references.length > 0 && references.every((reference) => current.has(reference.id));
      if (allVisibleSelected) {
        const next = new Set(current);
        references.forEach((reference) => next.delete(reference.id));
        return next;
      }
      const next = new Set(current);
      references.forEach((reference) => next.add(reference.id));
      return next;
    });
  };

  const handleMoveSelected = async (folderId: number | null) => {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    try {
      await api.moveReferences(ids, folderId);
      setDataSource(getDataSource());
      setCheckedIds(new Set());
      setReloadToken((current) => current + 1);
      await refreshFolders();
      const destination = folderId == null ? 'All References' : findFolder(folders, folderId)?.name ?? 'the collection';
      addToast(
        'success',
        `${ids.length} ${ids.length === 1 ? 'reference' : 'references'} moved`,
        `Added to ${destination}.`,
      );
    } catch (error) {
      addToast('error', 'Could not move references', api.errorMessage(error));
    }
  };

  const handleCopySelected = async (folderId: number | null) => {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    try {
      const copied = await api.copyReferences(ids, folderId);
      setDataSource(getDataSource());
      setCheckedIds(new Set());
      setReloadToken((current) => current + 1);
      await refreshFolders();
      const destination = folderId == null ? 'All References' : findFolder(folders, folderId)?.name ?? 'the collection';
      addToast(
        'success',
        `${copied.length || ids.length} ${ids.length === 1 ? 'reference' : 'references'} copied`,
        `Copies added to ${destination}; originals untouched.`,
      );
    } catch (error) {
      addToast('error', 'Could not copy references', api.errorMessage(error));
    }
  };

  const handleDeleteSelected = () => {
    if (checkedIds.size > 0) setDeleteIds([...checkedIds]);
  };

  const confirmDeleteReferences = async () => {
    if (!deleteIds || deleting) return;
    setDeleting(true);
    try {
      await api.deleteReferences(deleteIds);
      setDataSource(getDataSource());
      setCheckedIds(new Set());
      setDeleteIds(null);
      setReloadToken((current) => current + 1);
      await refreshFolders();
      addToast(
        'success',
        `${deleteIds.length} ${deleteIds.length === 1 ? 'reference' : 'references'} deleted`,
        'Removed from your library.',
      );
    } catch (error) {
      addToast('error', 'Could not delete references', api.errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const openImport = (kind: ImportKind = 'ris') => {
    setImportKind(kind);
    setImportFolderId(selectedFolderId);
    setImportOpen(true);
  };

  // 附件挂到“当前打开的文献”上；不要走导入流程，否则会新建一条文献。
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const handleAttachPdf = () => {
    if (!selectedReference?.id) return;
    attachInputRef.current?.click();
  };
  const handleAttachFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const target = selectedReference;
    if (!file || !target?.id) return;
    try {
      const result = await api.attachPdfToPaper(target.id, file);
      setReloadToken((current) => current + 1);
      addToast('success', result.replaced > 0 ? 'PDF 已替换' : 'PDF 已附加', file.name);
    } catch (error) {
      addToast('error', '附加 PDF 失败', api.errorMessage(error));
    }
  };

  const handleImport = async (
    kind: ImportKind,
    file: File,
    folderId: number | null,
  ): Promise<ImportResult> => {
    try {
      const result = await api.importFile(kind, file, folderId);
      setDataSource(getDataSource());
      await refreshFolders();
      setImportFolderId(folderId);
      if (result.success > 0) {
        setSelectedFolderId(folderId);
        setSelectedReferenceId(null);
        setCheckedIds(new Set());
        setSearchInput('');
        setSearchTerm('');
        setReloadToken((current) => current + 1);
        addToast(
          'success',
          `${result.success} ${result.success === 1 ? 'reference' : 'references'} imported`,
          `Added from ${file.name}.`,
        );
      }
      return result;
    } catch (error) {
      addToast('error', 'Import failed', api.errorMessage(error));
      throw error;
    }
  };

  const handleExport = async (ids?: number[]) => {
    if (exporting) return;
    setExporting(true);
    try {
      const selectedIds = ids && ids.length > 0 ? ids : undefined;
      const exportIds = selectedIds ?? references.map((reference) => reference.id);
      const blob = await api.exportBibtex(exportIds, selectedFolderId);
      const label = selectedIds ? 'selected-references' : folderName;
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `citeflow-${slugifyFilename(label)}-${date}.bib`);
      setDataSource(getDataSource());
      addToast(
        'success',
        'BibTeX exported',
        `${exportIds.length} ${exportIds.length === 1 ? 'reference' : 'references'} saved to your download.`,
      );
    } catch (error) {
      addToast('error', 'Export failed', api.errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const handleSelectReference = (id: number) => {
    setSelectedReferenceId(id);
    if (dataSource !== 'api') return;
    const requestId = ++detailRequestSeq.current;
    void api
      .getReference(id)
      .then((reference) => {
        if (requestId !== detailRequestSeq.current) return;
        setReferences((current) =>
          current.map((item) => (item.id === reference.id ? { ...item, ...reference } : item)),
        );
      })
      .catch(() => undefined);
  };
  const dataSourceLabel = dataSource === 'demo' ? 'Demo workspace' : 'Live library';

  return (
    <div className={`app-shell ${selectedReference ? 'has-selection' : ''}`} data-source={dataSource}>
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        loading={foldersLoading}
        open={sidebarOpen}
        dataSource={dataSource}
        onCloseMobile={() => setSidebarOpen(false)}
        onSelectFolder={handleSelectFolder}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveFolder={handleMoveFolder}
      />

      <button
        className={`mobile-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-label="Close collections"
      />

      <ReferenceList
        folderName={folderName}
        folderPath={currentPath}
        folders={folders}
        references={references}
        selectedId={selectedReferenceId}
        checkedIds={checkedIds}
        loading={referencesLoading}
        sort={sort}
        search={searchInput}
        exporting={exporting}
        onSearchChange={setSearchInput}
        onSortChange={setSort}
        onSelectReference={handleSelectReference}
        onToggleChecked={toggleChecked}
        onToggleAll={toggleAll}
        onClearChecked={() => setCheckedIds(new Set())}
        onOpenImport={() => openImport('ris')}
        onAddPdf={() => openImport('pdf')}
        onExport={handleExport}
        onMoveSelected={handleMoveSelected}
        onCopySelected={handleCopySelected}
        onDeleteSelected={handleDeleteSelected}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      <button
        className={`detail-backdrop ${selectedReference ? 'is-visible' : ''}`}
        onClick={() => setSelectedReferenceId(null)}
        aria-label="Close details"
      />

      <ReferenceDetail
        reference={selectedReference}
        onClose={() => setSelectedReferenceId(null)}
        onAttachPdf={handleAttachPdf}
        onNotify={addToast}
      />

      <input
        ref={attachInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => void handleAttachFile(event)}
      />

      <ImportDialog
        open={importOpen}
        initialKind={importKind}
        folders={folders}
        defaultFolderId={importFolderId}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <ConfirmDialog
        open={Boolean(deleteIds && deleteIds.length > 0)}
        title={`Delete ${deleteIds?.length ?? 0} ${deleteIds?.length === 1 ? 'reference' : 'references'}?`}
        description="These references will be removed from your library. The original files in your collections remain untouched. This action cannot be undone."
        confirmLabel="Delete references"
        busy={deleting}
        onCancel={() => setDeleteIds(null)}
        onConfirm={confirmDeleteReferences}
      />

      <div className="toast-stack" aria-live="polite" aria-label={`${dataSourceLabel} notifications`}>
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon">
              {toast.kind === 'success' ? (
                <CheckCircle2 size={17} />
              ) : toast.kind === 'error' ? (
                <AlertCircle size={17} />
              ) : (
                <Info size={17} />
              )}
            </span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.description && <p>{toast.description}</p>}
            </div>
            <button
              className="toast-close"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}