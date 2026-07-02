import { useMemo, useState } from 'react';
import { createCharacter, createFolder, uid } from '@/lib/defaults';
import { Plus, User, Trash2, Copy, Folder, FolderPlus, FolderOpen, ChevronRight, ArrowLeft, Pencil } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0a0a0c"/><circle cx="50" cy="38" r="14" fill="none" stroke="#3a3a40" stroke-width="1"/><path d="M22 86 C 22 64, 78 64, 78 86" fill="none" stroke="#3a3a40" stroke-width="1"/></svg>`
);

export const CharacterSelect = ({ state, setState, onOpen, initialFolderId }) => {
  const [newName, setNewName] = useState('');
  const [folderPath, setFolderPath] = useState(() => {
    // Build path of folder ids ending at initialFolderId
    if (!initialFolderId) return [];
    const folders = state.folders || {};
    const path = [];
    let cur = initialFolderId;
    while (cur) { path.unshift(cur); cur = folders[cur]?.parentId ?? null; }
    return path;
  });
  const [renamingId, setRenamingId] = useState(null);
  const currentFolderId = folderPath[folderPath.length - 1] || null;
  const folders = state.folders || {};

  // Compute children at current folder level
  const { childFolders, childChars } = useMemo(() => {
    const fs = Object.values(folders).filter((f) => (f.parentId ?? null) === currentFolderId);
    const cs = Object.values(state.characters).filter((c) => (c.parentId ?? null) === currentFolderId);
    // Preserve characterOrder for root for back-compat
    if (currentFolderId === null && state.characterOrder?.length) {
      cs.sort((a, b) => state.characterOrder.indexOf(a.id) - state.characterOrder.indexOf(b.id));
    }
    return { childFolders: fs, childChars: cs };
  }, [folders, state.characters, state.characterOrder, currentFolderId]);

  const addCharacter = () => {
    const name = newName.trim() || 'New Character';
    const ch = createCharacter(name, currentFolderId);
    setState((s) => ({
      ...s,
      characters: { ...s.characters, [ch.id]: ch },
      characterOrder: currentFolderId === null ? [...(s.characterOrder || []), ch.id] : (s.characterOrder || []),
    }));
    setNewName('');
  };

  const addFolder = () => {
    const f = createFolder('New Folder', currentFolderId);
    setState((s) => ({ ...s, folders: { ...(s.folders || {}), [f.id]: f } }));
  };

  const renameFolder = (id, name) => {
    setState((s) => ({ ...s, folders: { ...s.folders, [id]: { ...s.folders[id], name } } }));
  };

  const deleteFolder = (id) => {
    // Promote children up to this folder's parent
    setState((s) => {
      const target = s.folders[id];
      const parent = target?.parentId ?? null;
      const folders = { ...s.folders };
      Object.values(folders).forEach((f) => { if (f.parentId === id) folders[f.id] = { ...f, parentId: parent }; });
      const characters = { ...s.characters };
      Object.values(characters).forEach((c) => { if (c.parentId === id) characters[c.id] = { ...c, parentId: parent }; });
      delete folders[id];
      return { ...s, folders, characters };
    });
  };

  const duplicateCharacter = (id) => {
    const orig = state.characters[id];
    if (!orig) return;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = uid();
    copy.name = orig.name + ' (Copy)';
    setState((s) => ({
      ...s,
      characters: { ...s.characters, [copy.id]: copy },
      characterOrder: (s.characterOrder || []).concat(copy.parentId === null ? [copy.id] : []),
    }));
  };

  const deleteCharacter = (id) => {
    setState((s) => {
      const { [id]: _, ...rest } = s.characters;
      const order = (s.characterOrder || []).filter((x) => x !== id);
      const active = s.activeCharacterId === id ? (order[0] || Object.keys(rest)[0] || null) : s.activeCharacterId;
      return { ...s, characters: rest, characterOrder: order, activeCharacterId: active };
    });
  };

  // Drag-drop: move character or folder into folder card
  const onDropOnFolder = (targetFolderId) => (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const payload = e.dataTransfer.getData('application/x-roster');
    if (!payload) return;
    try {
      const { kind, id } = JSON.parse(payload);
      if (kind === 'folder' && id === targetFolderId) return;
      setState((s) => {
        if (kind === 'character') {
          return { ...s, characters: { ...s.characters, [id]: { ...s.characters[id], parentId: targetFolderId } } };
        }
        if (kind === 'folder') {
          // Prevent moving folder into itself or its descendant
          let p = targetFolderId;
          while (p) { if (p === id) return s; p = s.folders[p]?.parentId ?? null; }
          return { ...s, folders: { ...s.folders, [id]: { ...s.folders[id], parentId: targetFolderId } } };
        }
        return s;
      });
    } catch {}
  };

  const onDragStartChar = (id) => (e) => {
    e.dataTransfer.setData('application/x-roster', JSON.stringify({ kind: 'character', id }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragStartFolder = (id) => (e) => {
    e.dataTransfer.setData('application/x-roster', JSON.stringify({ kind: 'folder', id }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
  const onDragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };

  const onDropOnBreadcrumb = (parentFolderId) => (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const payload = e.dataTransfer.getData('application/x-roster');
    if (!payload) return;
    try {
      const { kind, id } = JSON.parse(payload);
      setState((s) => {
        if (kind === 'character') {
          return { ...s, characters: { ...s.characters, [id]: { ...s.characters[id], parentId: parentFolderId } } };
        }
        if (kind === 'folder') {
          if (id === parentFolderId) return s;
          return { ...s, folders: { ...s.folders, [id]: { ...s.folders[id], parentId: parentFolderId } } };
        }
        return s;
      });
    } catch {}
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 fade-in" data-testid="character-select">
      <div className="text-center mb-6">
        <div className="font-meta text-[10px] tracking-[0.45em] text-[#6a6c70]">VAULT</div>
        <h1 className="font-display text-4xl sm:text-5xl mt-3 silver-text engraved" data-testid="vault-title">
          CHARACTERS
        </h1>
        <div className="silver-divider w-48 mx-auto mt-4" />
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-4 font-meta text-[11px] tracking-[0.2em] text-[#8A9196]" data-testid="breadcrumb">
        <button
          onClick={() => setFolderPath([])}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropOnBreadcrumb(null)}
          className="hover:text-[#C8CCD2] px-2 py-1 silver-border bg-[#0a0a0c]"
          data-testid="breadcrumb-root"
        >
          ROOT
        </button>
        {folderPath.map((fid, i) => (
          <span key={fid} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-[#4a4d52]" />
            <button
              onClick={() => setFolderPath(folderPath.slice(0, i + 1))}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDropOnBreadcrumb(fid)}
              className="hover:text-[#C8CCD2] px-2 py-1 silver-border bg-[#0a0a0c]"
            >
              {folders[fid]?.name || '…'}
            </button>
          </span>
        ))}
        <button
          onClick={() => folderPath.length > 0 && setFolderPath(folderPath.slice(0, -1))}
          disabled={folderPath.length === 0}
          className="ml-3 p-1 silver-border bg-[#0d0d0f] text-[#8A9196] hover:bg-[#16161a] disabled:opacity-30 disabled:cursor-not-allowed"
          title={folderPath.length === 0 ? 'Already at root' : 'Up one level'}
          data-testid="breadcrumb-up"
        >
          <ArrowLeft size={12} />
        </button>
        <div className="flex-1" />
        <button
          onClick={addFolder}
          className="px-2 py-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#C8CCD2] flex items-center gap-1"
          data-testid="add-folder-btn"
        >
          <FolderPlus size={12} /> NEW FOLDER
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Folders rendered in their own auto-sizing flex row spanning all columns */}
        {childFolders.length > 0 && (
          <div className="col-span-full flex flex-wrap gap-3" data-testid="folder-row">
            {childFolders.map((f) => (
              <ContextMenu key={f.id}>
                <ContextMenuTrigger asChild>
                  <div
                    draggable
                    onDragStart={onDragStartFolder(f.id)}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDropOnFolder(f.id)}
                    onDoubleClick={() => { if (renamingId !== f.id) setFolderPath([...folderPath, f.id]); }}
                    title="Double-click to open · Right-click to rename"
                    className="gothic-corner silver-border metal-bg p-3 hover:bg-[#16161a] transition-colors cursor-pointer group inline-flex items-center gap-3"
                    style={{ width: 'max-content', maxWidth: '100%' }}
                    data-testid={`folder-card-${f.name}`}
                  >
                    <Folder size={22} className="text-[#8A9196] shrink-0" />
                    {renamingId === f.id ? (
                      <input
                        autoFocus
                        value={f.name}
                        onChange={(e) => renameFolder(f.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onBlur={() => setRenamingId(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null); }}
                        className="bg-[#0d0d0f] silver-border px-2 py-1 font-display text-lg silver-text outline-none focus:border-[#6a6c70]"
                        style={{ width: `${Math.max(8, (f.name?.length || 1) + 2)}ch` }}
                        data-testid={`folder-name-${f.name}`}
                      />
                    ) : (
                      <span
                        className="font-display text-lg silver-text select-text px-1"
                        data-testid={`folder-name-${f.name}`}
                      >
                        {f.name}
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); setFolderPath([...folderPath, f.id]); }}
                        className="p-1.5 silver-border bg-[#0d0d0f] hover:bg-[#1A1A1D] text-[#8A9196]"
                        title="Open"
                        data-testid={`open-folder-${f.name}`}
                      >
                        <FolderOpen size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteFolder(f.id); }}
                        className="p-1.5 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                        title="Delete folder (children kept)"
                        data-testid={`delete-folder-${f.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="bg-[#050507] silver-border">
                  <ContextMenuItem
                    onClick={() => setRenamingId(f.id)}
                    className="font-meta text-xs tracking-[0.15em] text-[#C8CCD2] hover:!bg-[#16161a]"
                    data-testid={`ctx-rename-folder-${f.name}`}
                  >
                    <Pencil size={12} className="mr-2" /> Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => setFolderPath([...folderPath, f.id])}
                    className="font-meta text-xs tracking-[0.15em] text-[#C8CCD2] hover:!bg-[#16161a]"
                  >
                    <FolderOpen size={12} className="mr-2" /> Open
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => deleteFolder(f.id)}
                    className="font-meta text-xs tracking-[0.15em] text-[#c08080] hover:!bg-[#2a0d10]"
                  >
                    <Trash2 size={12} className="mr-2" /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            <div className="basis-full font-meta text-[9px] tracking-[0.3em] text-[#4a4d52] mt-1">
              DOUBLE-CLICK TO ENTER · RIGHT-CLICK TO RENAME
            </div>
          </div>
        )}

        {childChars.map((ch) => (
          <div
            key={ch.id}
            draggable
            onDragStart={onDragStartChar(ch.id)}
            onClick={() => onOpen(ch.id)}
            className="gothic-corner silver-border metal-bg p-5 hover:bg-[#16161a] transition-colors cursor-pointer group"
            data-testid={`character-card-${ch.name}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 silver-border bg-[#0a0a0c] overflow-hidden shrink-0 flex items-center justify-center">
                <img src={ch.avatar || DEFAULT_AVATAR} alt={ch.name} className="max-w-full max-h-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl silver-text truncate" data-testid={`character-name-${ch.name}`}>{ch.name}</div>
                <div className="font-meta text-[11px] text-[#6a6c70] mt-1">
                  {ch.items.length} ITEMS &middot; {ch.categories.length} CATEGORIES
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 opacity-60 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); duplicateCharacter(ch.id); }}
                className="p-1.5 silver-border bg-[#0d0d0f] hover:bg-[#1A1A1D] text-[#8A9196]"
                title="Duplicate"
                data-testid={`duplicate-character-btn-${ch.name}`}
              >
                <Copy size={12} />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 silver-border bg-[#0d0d0f] hover:bg-[#1A1A1D] text-[#8A9196]"
                    title="Delete"
                    data-testid={`delete-character-btn-${ch.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#0a0a0c] silver-border" onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display silver-text">Delete Character</AlertDialogTitle>
                    <AlertDialogDescription className="font-item text-[#B0B5B9]">
                      This will permanently remove {ch.name} and their entire inventory.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-[#0d0d0f] silver-border text-[#C8CCD2]">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-[#3a0a12] hover:bg-[#5a1018] text-[#E2E4E9]" onClick={() => deleteCharacter(ch.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}

        <div className="gothic-corner silver-border metal-bg p-5 flex items-center gap-3">
          <User size={28} className="text-[#6a6c70] shrink-0" />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCharacter(); }}
            placeholder="New character name…"
            className="flex-1 bg-transparent font-item text-lg silver-text outline-none placeholder:text-[#4a4d52]"
            data-testid="new-character-input"
          />
          <button
            onClick={addCharacter}
            className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#1A1A1D] text-[#C8CCD2]"
            data-testid="add-character-btn"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export { DEFAULT_AVATAR };
