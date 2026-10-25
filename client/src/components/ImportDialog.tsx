import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  FileType2,
  FolderOpen,
  Globe,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import type { Folder, ImportKind, ImportResult } from '../types';
import { flattenFolders, formatFileSize } from '../utils/format';

interface ImportDialogProps {
  open: boolean;
  initialKind: ImportKind;
  folders: Folder[];
  defaultFolderId: number | null;
  onClose: () => void;
  onImport: (kind: ImportKind, file: File, folderId: number | null) => Promise<ImportResult>;
}

const sourceTabs: Array<{
  kind: ImportKind;
  label: string;
  short: string;
  icon: typeof FileText;
  description: string;
  accept: string;
  hint: string;
}> = [
  {
    kind: 'ris',
    label: 'RIS file',
    short: 'RIS',
    icon: FileText,
    description: 'Zotero, EndNote, Mendeley',
    accept: '.ris,.txt,application/x-research-info-systems,text/plain',
    hint: 'Export your library from any reference manager as an RIS file. Authors, abstracts, keywords and DOIs are preserved.',
  },
  {
    kind: 'wos',
    label: 'Web of Science',
    short: 'WoS',
    icon: Globe,
    description: 'Plain-text record export',
    accept: '.txt,.ciw,.wos,text/plain',
    hint: 'In Web of Science, select your records and export as “Plain Text File” with Full Record and Cited References.',
  },
  {
    kind: 'pdf',
    label: 'PDF',
    short: 'PDF',
    icon: FileType2,
    description: 'Create a record from a paper',
    accept: '.pdf,application/pdf',
    hint: 'The PDF is stored with a new record in the selected collection. You can fill in missing metadata afterward.',
  },
];

export default function ImportDialog({
  open,
  initialKind,
  folders,
  defaultFolderId,
  onClose,
  onImport,
}: ImportDialogProps) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const tab = sourceTabs.find((item) => item.kind === kind) ?? sourceTabs[0];

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setFile(null);
    setFolderId(defaultFolderId);
    setDragging(false);
    setUploading(false);
    setError(null);
    setResult(null);
  }, [open, initialKind]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, uploading, onClose]);

  if (!open) return null;

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (nextFile.size > 50 * 1024 * 1024) {
      setError('That file is larger than 50 MB. Choose a smaller export.');
      return;
    }
    setFile(nextFile);
    setError(null);
    setResult(null);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const switchKind = (nextKind: ImportKind) => {
    setKind(nextKind);
    setFile(null);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const importResult = await onImport(kind, file, folderId);
      setResult(importResult);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The import could not be completed.');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const successful = result && result.success > 0;

  return (
    <div
      className="modal-backdrop import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose();
      }}
    >
      <div className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="import-header">
          <div className="import-header-copy">
            <span className="import-mark">
              <Upload size={16} />
            </span>
            <div>
              <span className="eyebrow">Add to library</span>
              <h2 id="import-title">{result ? 'Import summary' : 'Import references'}</h2>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} disabled={uploading} aria-label="Close import dialog">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="import-result">
            <span className={`result-icon ${successful ? 'is-success' : 'is-warning'}`}>
              {successful ? <CheckCircle2 size={27} /> : <AlertCircle size={27} />}
            </span>
            <h3>{successful ? 'Your references are in' : 'Nothing was imported'}</h3>
            <p className="result-summary">
              {successful
                ? `${result.success} ${result.success === 1 ? 'reference was' : 'references were'} added to ${
                    folderId != null ? flatFolders.find((folder) => folder.id === folderId)?.name ?? 'the collection' : 'All References'
                  }.`
                : 'We could not read any records from this file. Check the export format and try again.'}
            </p>
            <div className="result-stats">
              <div>
                <strong>{result.success}</strong>
                <span>Imported</span>
              </div>
              <div>
                <strong>{result.failed}</strong>
                <span>Failed</span>
              </div>
              {result.errors.length > 0 && (
                <div className="result-errors">
                  <strong>{result.errors.length}</strong>
                  <span>Notes</span>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <ul className="import-error-list">
                {result.errors.slice(0, 4).map((message, index) => (
                  <li key={`${message}-${index}`}>{message}</li>
                ))}
              </ul>
            )}
            <div className="import-result-actions">
              <button className="button button-quiet" onClick={reset}>
                Import another
              </button>
              <button className="button button-primary" onClick={onClose}>
                Done
                <Check size={15} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="import-tabs" role="tablist" aria-label="Import source">
              {sourceTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.kind}
                    className={`import-tab ${kind === item.kind ? 'is-active' : ''}`}
                    onClick={() => switchKind(item.kind)}
                    role="tab"
                    aria-selected={kind === item.kind}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="import-body">
              <input
                ref={inputRef}
                type="file"
                accept={tab.accept}
                className="visually-hidden"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />

              {file ? (
                <div className="selected-file-card">
                  <span className="selected-file-icon">
                    <FileText size={20} />
                  </span>
                  <div className="selected-file-copy">
                    <strong>{file.name}</strong>
                    <small>
                      {formatFileSize(file.size)} · Ready to import
                    </small>
                  </div>
                  <button className="icon-button" onClick={reset} aria-label="Remove selected file" disabled={uploading}>
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
                  }}
                  onDrop={handleDrop}
                >
                  <span className="dropzone-icon">
                    <Upload size={22} />
                  </span>
                  <strong>Drop your {tab.short} file here</strong>
                  <span className="dropzone-sub">
                    or <u>browse</u> from your computer
                  </span>
                  <span className="dropzone-limit">Up to 50 MB · {tab.accept.split(',')[0].replace('.', '').toUpperCase()}</span>
                </button>
              )}

              <p className="import-hint">{tab.hint}</p>

              <label className="folder-destination">
                <span className="field-label">Save to collection</span>
                <span className="select-wrap">
                  <FolderOpen size={15} />
                  <select
                    value={folderId ?? ''}
                    onChange={(event) => setFolderId(event.target.value ? Number(event.target.value) : null)}
                    disabled={uploading}
                  >
                    <option value="">All References</option>
                    {flatFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {'— '.repeat(folderDepth.get(folder.id) ?? 0)}
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </span>
              </label>

              {error && (
                <div className="import-error" role="alert">
                  <AlertCircle size={15} />
                  {error}
                </div>
              )}
            </div>

            <div className="import-footer">
              <span className="import-footer-note">Metadata stays editable after import.</span>
              <div className="import-footer-actions">
                <button className="button button-quiet" onClick={onClose} disabled={uploading}>
                  Cancel
                </button>
                <button className="button button-primary" onClick={() => void submit()} disabled={!file || uploading}>
                  {uploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                  {uploading ? 'Importing…' : `Import ${kind === 'pdf' ? 'PDF' : tab.short}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}