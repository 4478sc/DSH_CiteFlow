import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import {
  ChevronRight,
  Cloud,
  CloudOff,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { DataSource, Folder } from '../types';
import { findFolder, flattenFolders, folderPath } from '../utils/format';
import ConfirmDialog from './ConfirmDialog';

type TreeNode = Omit<Folder, 'children'> & { children: TreeNode[] };

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: number | null;
  loading: boolean;
  open: boolean;
  dataSource: DataSource;
  onCloseMobile: () => void;
  onSelectFolder: (id: number | null) => void;
  onCreateFolder: (name: string, parentId: number | null) => Promise<void>;
  onRenameFolder: (id: number, name: string) => Promise<void>;
  onDeleteFolder: (id: number) => Promise<void>;
  onMoveFolder: (id: number, parentId: number | null) => Promise<void>;
}

export default function Sidebar({
  folders,
  selectedFolderId,
  loading,
  open,
  dataSource,
  onCloseMobile,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
}: SidebarProps) {
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const folderById = useMemo(
    () => new Map(flatFolders.map((folder) => [folder.id, folder])),
    [flatFolders],
  );

  const tree = useMemo(() => {
    const nodes = new Map<number, TreeNode>();
    flatFolders.forEach((folder) => nodes.set(folder.id, { ...folder, children: [] }));
    const roots: TreeNode[] = [];
    flatFolders.forEach((folder) => {
      const node = nodes.get(folder.id);
      if (!node) return;
      if (folder.parentId != null && nodes.has(folder.parentId)) {
        nodes.get(folder.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortNodes = (items: TreeNode[]) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
      items.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }, [flatFolders]);

  const countById = useMemo(() => {
    const counts = new Map<number, number>();
    const aggregate = (node: TreeNode): number => {
      const childTotal = node.children.reduce((sum, child) => sum + aggregate(child), 0);
      const direct = node.directCount ?? node.referenceCount ?? 0;
      const total = node.directCount != null ? direct + childTotal : node.referenceCount ?? childTotal;
      counts.set(node.id, total);
      return total;
    };
    tree.forEach(aggregate);
    return counts;
  }, [tree]);

  const totalCount = useMemo(
    () => tree.reduce((sum, folder) => sum + (countById.get(folder.id) ?? 0), 0),
    [tree, countById],
  );

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const didExpandRoots = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState<number | null>(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | 'root' | null>(null);
  const [menu, setMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!didExpandRoots.current && tree.length > 0) {
      didExpandRoots.current = true;
      setExpanded(new Set(tree.map((folder) => folder.id)));
    }
  }, [tree]);

  useEffect(() => {
    if (selectedFolderId == null) return;
    const path = folderPath(folders, selectedFolderId);
    if (path.length === 0) return;
    setExpanded((previous) => {
      const next = new Set(previous);
      path.forEach((folder) => next.add(folder.id));
      return next;
    });
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (createOpen) {
      window.requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [createOpen]);

  useEffect(() => {
    if (renamingId == null) return;
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renamingId]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const selectFolder = (id: number | null) => {
    setMenu(null);
    onSelectFolder(id);
    onCloseMobile();
  };

  const toggleExpanded = (id: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startCreate = (parentId: number | null) => {
    setCreateParent(parentId);
    setCreateName('');
    setCreateOpen(true);
    setMenu(null);
    if (parentId != null) {
      setExpanded((previous) => new Set(previous).add(parentId));
    }
  };

  const submitCreate = async () => {
    const name = createName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await onCreateFolder(name, createParent).catch(() => undefined);
      setCreateOpen(false);
      setCreateName('');
    } finally {
      setCreating(false);
    }
  };

  const startRename = (folder: Folder) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
    setMenu(null);
  };

  const submitRename = async () => {
    if (renamingId == null) return;
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    const id = renamingId;
    setRenamingId(null);
    await onRenameFolder(id, name).catch(() => undefined);
  };

  const openMenu = (event: MouseEvent<HTMLButtonElement>, folder: Folder) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      folder,
      x: Math.max(12, Math.min(rect.right - 188, window.innerWidth - 200)),
      y: Math.min(rect.bottom + 6, window.innerHeight - 180),
    });
  };

  const isDescendant = (childId: number, ancestorId: number): boolean => {
    let current = folderById.get(childId);
    const guard = new Set<number>();
    while (current && current.parentId != null && !guard.has(current.id)) {
      guard.add(current.id);
      if (current.parentId === ancestorId) return true;
      current = folderById.get(current.parentId);
    }
    return false;
  };

  const canDrop = (target: number | 'root'): boolean => {
    if (draggedId == null) return false;
    if (target === 'root') return true;
    return target !== draggedId && !isDescendant(target, draggedId);
  };

  const handleDragOver = (event: DragEvent, target: number | 'root') => {
    if (!canDrop(target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  };

  const handleDrop = async (event: DragEvent, target: number | 'root') => {
    event.preventDefault();
    event.stopPropagation();
    if (!canDrop(target) || draggedId == null) {
      setDropTarget(null);
      return;
    }
    const id = draggedId;
    const parentId = target === 'root' ? null : target;
    setDraggedId(null);
    setDropTarget(null);
    await onMoveFolder(id, parentId);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const deleted = await onDeleteFolder(deleteTarget.id)
        .then(() => true)
        .catch(() => false);
      if (deleted) setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const isSelected = selectedFolderId === node.id;
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const isRenaming = renamingId === node.id;
    return (
      <div key={node.id} className="tree-node">
        <div
          className={[
            'tree-row',
            isSelected ? 'is-selected' : '',
            draggedId === node.id ? 'is-dragging' : '',
            dropTarget === node.id ? 'is-drop-target' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          draggable={!isRenaming}
          onDragStart={(event) => {
            setDraggedId(node.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(node.id));
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTarget(null);
          }}
          onDragOver={(event) => handleDragOver(event, node.id)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDropTarget((current) => (current === node.id ? null : current));
            }
          }}
          onDrop={(event) => void handleDrop(event, node.id)}
        >
          <button
            className={`tree-chevron ${hasChildren ? '' : 'is-empty'}`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleExpanded(node.id);
            }}
            tabIndex={hasChildren ? 0 : -1}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            <ChevronRight size={12} className={isExpanded ? 'chevron-open' : ''} />
          </button>

          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="tree-inline-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitRename();
                if (event.key === 'Escape') setRenamingId(null);
              }}
              onBlur={() => setRenamingId(null)}
              onClick={(event) => event.stopPropagation()}
              aria-label="Collection name"
            />
          ) : (
            <button
              className="tree-label"
              onClick={() => selectFolder(node.id)}
              title={node.name}
              aria-current={isSelected ? 'true' : undefined}
            >
              <span className="tree-folder-icon">
                {isExpanded && hasChildren ? <FolderOpen size={15} /> : <FolderIcon size={15} />}
              </span>
              <span className="tree-name">{node.name}</span>
              <span className="tree-count">{countById.get(node.id) ?? 0}</span>
            </button>
          )}

          {!isRenaming && (
            <button
              className="tree-more"
              onClick={(event) => openMenu(event, node)}
              aria-label={`Actions for ${node.name}`}
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Collections">
        <div className="brand-row">
          <button className="brand" onClick={() => selectFolder(null)} aria-label="Citeflow home">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="brand-copy">
              <strong>Citeflow</strong>
              <small>Research library</small>
            </span>
          </button>
          <button className="icon-button mobile-sidebar-close" onClick={onCloseMobile} aria-label="Close sidebar">
            <X size={17} />
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-primary">
            <button
              className={`all-references ${selectedFolderId == null ? 'is-selected' : ''} ${
                dropTarget === 'root' ? 'is-drop-target' : ''
              }`}
              onClick={() => selectFolder(null)}
              onDragOver={(event) => handleDragOver(event, 'root')}
              onDrop={(event) => void handleDrop(event, 'root')}
            >
              <span className="all-icon">
                <Library size={16} />
              </span>
              <span>All References</span>
              <span className="all-count">{totalCount}</span>
            </button>
          </div>

          <div className="collections-block">
            <div className="section-heading">
              <span>Collections</span>
              <button
                className="section-add"
                onClick={() => startCreate(null)}
                aria-label="New collection"
                title="New collection"
              >
                <Plus size={15} />
              </button>
            </div>

            {createOpen && (
              <div className="create-collection">
                <span className="create-folder-icon">
                  <FolderPlus size={15} />
                </span>
                <input
                  ref={createInputRef}
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitCreate();
                    if (event.key === 'Escape') {
                      setCreateOpen(false);
                      setCreateName('');
                    }
                  }}
                  placeholder={
                    createParent != null
                      ? `In ${findFolder(folders, createParent)?.name ?? 'collection'}…`
                      : 'Collection name…'
                  }
                  aria-label="New collection name"
                  disabled={creating}
                />
                <button
                  className="create-confirm"
                  onClick={() => void submitCreate()}
                  disabled={!createName.trim() || creating}
                  aria-label="Create collection"
                >
                  {creating ? <span className="mini-loader" /> : 'Add'}
                </button>
              </div>
            )}

            <div className="folder-tree" role="tree" aria-label="Collections">
              {loading && flatFolders.length === 0 ? (
                <div className="tree-skeleton">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : tree.length === 0 ? (
                <div className="tree-empty">
                  <p>No collections yet</p>
                  <button onClick={() => startCreate(null)}>Create your first collection</button>
                </div>
              ) : (
                tree.map((node) => renderNode(node, 0))
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="storage-card">
            <span className={`storage-icon ${dataSource === 'demo' ? 'is-demo' : ''}`}>
              {dataSource === 'demo' ? <CloudOff size={15} /> : <Cloud size={15} />}
            </span>
            <span className="storage-copy">
              <strong>{dataSource === 'demo' ? 'Local demo library' : 'Library connected'}</strong>
              <small>
                {flatFolders.length} collections · {totalCount} references
              </small>
            </span>
            <span className={`status-dot ${dataSource === 'demo' ? 'is-demo' : ''}`} />
          </div>
        </div>
      </aside>

      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button
            onClick={() => startCreate(menu.folder.id)}
            role="menuitem"
          >
            <FolderPlus size={15} />
            New subcollection
          </button>
          <button onClick={() => startRename(menu.folder)} role="menuitem">
            <Pencil size={14} />
            Rename
          </button>
          <div className="menu-separator" />
          <button
            className="is-danger"
            onClick={() => {
              setDeleteTarget(menu.folder);
              setMenu(null);
            }}
            role="menuitem"
          >
            <Trash2 size={14} />
            Delete collection
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this collection?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” and any nested collections will be removed. References inside stay in your library and become uncategorized.`
            : ''
        }
        confirmLabel="Delete collection"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}