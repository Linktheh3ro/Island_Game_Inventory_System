import { useState, useMemo, useEffect } from 'react';
import {
  Folder, FolderOpen, FolderPlus, User, UserPlus, Briefcase, ChevronRight, ChevronDown,
  Trash2, Pencil, Copy, ChevronsLeft, Settings
} from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator
} from '@/components/ui/context-menu';
import { createFolder, createCharacter, uid } from '@/lib/defaults';

export const Sidebar = ({ state, setState, view, setView, collapsed, onToggleCollapse }) => {
  const [renamingId, setRenamingId] = useState(null); // 'folder-<id>' | 'char-<id>' | 'inv-<id>'
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [expandedChars, setExpandedChars] = useState(new Set());
  const [draggedOverId, setDraggedOverId] = useState(null); // 'folder-<id>' | 'char-<id>' | 'inv-<id>' | 'sidebar-body'

  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDraggedOverId(null);
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => window.removeEventListener('dragend', handleGlobalDragEnd);
  }, []);

  const folders = state.folders || {};
  const characters = state.characters || {};

  const toggleFolder = (id, e) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleChar = (id, e) => {
    e.stopPropagation();
    setExpandedChars((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Helper actions
  const addFolder = (parentId = null) => {
    const f = createFolder('New Folder', parentId);
    setState((s) => ({ ...s, folders: { ...(s.folders || {}), [f.id]: f } }));
    setExpandedFolders(prev => new Set(prev).add(parentId));
    setRenamingId(`folder-${f.id}`);
  };

  const addCharacter = (parentId = null) => {
    const ch = createCharacter('New Character', parentId);
    setState((s) => ({
      ...s,
      characters: { ...s.characters, [ch.id]: ch },
      characterOrder: parentId === null ? [...(s.characterOrder || []), ch.id] : (s.characterOrder || []),
    }));
    setExpandedFolders(prev => new Set(prev).add(parentId));
    setRenamingId(`char-${ch.id}`);
  };

  const renameFolder = (id, name) => {
    setState((s) => ({ ...s, folders: { ...s.folders, [id]: { ...s.folders[id], name } } }));
  };

  const deleteFolder = (id) => {
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

  const renameCharacter = (id, name) => {
    setState((s) => ({ ...s, characters: { ...s.characters, [id]: { ...s.characters[id], name } } }));
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

  const addInventory = (charId) => {
    const id = uid();
    setState((s) => {
      const char = s.characters[charId];
      if (!char) return s;
      const nextInv = [...(char.inventories || []), { id, name: 'New Inventory' }];
      return {
        ...s,
        characters: { ...s.characters, [charId]: { ...char, inventories: nextInv } },
        activeCharacterId: charId,
        activeInventoryId: id
      };
    });
    setExpandedChars(prev => new Set(prev).add(charId));
    setView('inventory');
    setRenamingId(`inv-${id}`);
  };

  const renameInventory = (charId, invId, name) => {
    setState((s) => {
      const char = s.characters[charId];
      if (!char) return s;
      const nextInv = (char.inventories || []).map(inv => inv.id === invId ? { ...inv, name } : inv);
      return { ...s, characters: { ...s.characters, [charId]: { ...char, inventories: nextInv } } };
    });
  };

  const deleteInventory = (charId, invId) => {
    setState((s) => {
      const char = s.characters[charId];
      if (!char) return s;
      if ((char.inventories || []).length <= 1) return s;
      const nextInv = char.inventories.filter(inv => inv.id !== invId);
      const fallbackId = nextInv[0].id;
      const nextItems = char.items.map(it => it.inventoryId === invId ? { ...it, inventoryId: fallbackId } : it);
      const activeInvId = s.activeInventoryId === invId ? fallbackId : s.activeInventoryId;
      return {
        ...s,
        activeInventoryId: activeInvId,
        characters: { ...s.characters, [charId]: { ...char, inventories: nextInv, items: nextItems } }
      };
    });
  };

  const selectInventory = (charId, invId) => {
    setState((s) => ({ ...s, activeCharacterId: charId, activeInventoryId: invId }));
    setView('inventory');
  };

  const selectCharacter = (charId) => {
    const char = characters[charId];
    const firstInv = char?.inventories?.[0]?.id || null;
    setState((s) => ({ ...s, activeCharacterId: charId, activeInventoryId: firstInv }));
    setView('inventory');
  };
  const isDescendantFolder = (folderId, targetParentFolderId) => {
    if (!targetParentFolderId) return false;
    let curr = folders[targetParentFolderId];
    while (curr) {
      if (curr.id === folderId) return true;
      curr = curr.parentId ? folders[curr.parentId] : null;
    }
    return false;
  };

  const getContainedItemsRecursive = (char, containerId) => {
    let result = [];
    const direct = char.items.filter(it => it.containerId === containerId);
    for (const item of direct) {
      result.push(item);
      if (item.isCollection) {
        result = result.concat(getContainedItemsRecursive(char, item.id));
      }
    }
    return result;
  };

  const handleSidebarDrop = (e, targetParentId) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverId(null);

    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    let dragData = null;
    try {
      dragData = JSON.parse(rawData);
    } catch {
      return; // Ignore non-JSON (like standard item drops) on sidebar background/folders
    }

    if (dragData?.type === 'folder') {
      const draggedFolderId = dragData.id;
      if (draggedFolderId === targetParentId || isDescendantFolder(draggedFolderId, targetParentId)) {
        return;
      }
      setState((s) => ({
        ...s,
        folders: {
          ...s.folders,
          [draggedFolderId]: { ...s.folders[draggedFolderId], parentId: targetParentId }
        }
      }));
      if (targetParentId) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(targetParentId);
          return next;
        });
      }
    } else if (dragData?.type === 'character') {
      const draggedCharacterId = dragData.id;
      setState((s) => ({
        ...s,
        characters: {
          ...s.characters,
          [draggedCharacterId]: { ...s.characters[draggedCharacterId], parentId: targetParentId }
        }
      }));
      if (targetParentId) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(targetParentId);
          return next;
        });
      }
    }
  };

  const matchAndTransferItemMetadata = (item, sourceChar, targetChar) => {
    let updatedItem = { ...item };
    let nextQualityTiers = [...(targetChar.qualityTiers || [])];
    let nextCategories = [...(targetChar.categories || [])];

    // 1. Match Quality Tier by name
    if (item.tierId) {
      const sourceTier = sourceChar.qualityTiers?.find(t => t.id === item.tierId);
      if (sourceTier) {
        let targetTier = nextQualityTiers.find(t => t.name.toLowerCase() === sourceTier.name.toLowerCase());
        if (!targetTier) {
          targetTier = { ...sourceTier, id: uid() };
          nextQualityTiers.push(targetTier);
        }
        updatedItem.tierId = targetTier.id;
      }
    }

    // 2. Match Category (Tag) by name
    if (item.categoryId) {
      const sourceCat = sourceChar.categories?.find(c => c.id === item.categoryId);
      if (sourceCat) {
        let targetCat = nextCategories.find(c => c.name.toLowerCase() === sourceCat.name.toLowerCase());
        if (!targetCat) {
          targetCat = { ...sourceCat, id: uid() };
          nextCategories.push(targetCat);
        }
        updatedItem.categoryId = targetCat.id;
      }
    }

    return {
      item: updatedItem,
      qualityTiers: nextQualityTiers,
      categories: nextCategories
    };
  };

  const handleCharacterDrop = (e, targetCharId) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverId(null);

    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    let dragData = null;
    try {
      dragData = JSON.parse(rawData);
    } catch {
      // If it fails to parse as JSON, treat it as a raw item ID string
      dragData = { type: 'item', id: rawData };
    }

    if (dragData?.type === 'inventory') {
      const { characterId: sourceCharId, inventoryId: draggedInvId } = dragData;
      if (sourceCharId === targetCharId) return;

      setState((s) => {
        const sourceChar = s.characters[sourceCharId];
        const targetChar = s.characters[targetCharId];
        if (!sourceChar || !targetChar) return s;

        const invItem = sourceChar.inventories.find(i => i.id === draggedInvId);
        if (!invItem) return s;

        const nextSourceInv = sourceChar.inventories.filter(i => i.id !== draggedInvId);
        const nextTargetInv = [...(targetChar.inventories || []), invItem];

        const movedItems = sourceChar.items.filter(it => it.inventoryId === draggedInvId);
        const nextSourceItems = sourceChar.items.filter(it => it.inventoryId !== draggedInvId);

        // Sequentially transfer metadata for all moved items
        let currentTargetChar = { ...targetChar };
        const updatedMovedItems = [];
        for (const item of movedItems) {
          const res = matchAndTransferItemMetadata(item, sourceChar, currentTargetChar);
          updatedMovedItems.push(res.item);
          currentTargetChar.qualityTiers = res.qualityTiers;
          currentTargetChar.categories = res.categories;
        }

        const nextTargetItems = [...(currentTargetChar.items || []), ...updatedMovedItems];

        // Fallbacks for source active selection
        let nextActiveInvSource = s.activeInventoryId;
        if (s.activeCharacterId === sourceCharId && s.activeInventoryId === draggedInvId) {
          nextActiveInvSource = nextSourceInv[0]?.id || null;
        }

        return {
          ...s,
          activeCharacterId: targetCharId,
          activeInventoryId: draggedInvId,
          characters: {
            ...s.characters,
            [sourceCharId]: { ...sourceChar, inventories: nextSourceInv, items: nextSourceItems },
            [targetCharId]: { ...currentTargetChar, inventories: nextTargetInv, items: nextTargetItems }
          }
        };
      });
    } else if (dragData?.type === 'item' || dragData?.type === 'items') {
      const draggedItemIds = dragData.type === 'items' ? dragData.ids : [dragData.id];
      const sourceCharId = state.activeCharacterId;
      if (!sourceCharId) return;

      setState((s) => {
        const sourceChar = s.characters[sourceCharId];
        const targetChar = s.characters[targetCharId];
        if (!sourceChar || !targetChar) return s;

        const targetInvId = targetChar.inventories?.[0]?.id || null;
        if (!targetInvId) return s;

        let allMoved = [];
        let movedIds = new Set();

        for (const draggedItemId of draggedItemIds) {
          const itemToMove = sourceChar.items.find(it => it.id === draggedItemId);
          if (!itemToMove) continue;

          const contained = getContainedItemsRecursive(sourceChar, draggedItemId);
          const itemChain = [itemToMove, ...contained];
          for (const it of itemChain) {
            if (!movedIds.has(it.id)) {
              movedIds.add(it.id);
              allMoved.push(it);
            }
          }
        }

        if (allMoved.length === 0) return s;

        const nextSourceItems = sourceChar.items.filter(it => !movedIds.has(it.id));

        let currentTargetChar = { ...targetChar };
        const updatedMoved = [];
        for (const it of allMoved) {
          const res = matchAndTransferItemMetadata(it, sourceChar, currentTargetChar);
          let updatedItem = res.item;
          currentTargetChar.qualityTiers = res.qualityTiers;
          currentTargetChar.categories = res.categories;

          if (draggedItemIds.includes(updatedItem.id)) {
            updatedItem = { ...updatedItem, inventoryId: targetInvId, containerId: null };
          } else {
            updatedItem = { ...updatedItem, inventoryId: targetInvId };
          }
          updatedMoved.push(updatedItem);
        }

        const nextTargetItems = [...(currentTargetChar.items || []), ...updatedMoved];

        return {
          ...s,
          characters: {
            ...s.characters,
            [sourceCharId]: { ...sourceChar, items: nextSourceItems },
            [targetCharId]: { ...currentTargetChar, items: nextTargetItems }
          }
        };
      });
    }
  };

  const handleInventoryDrop = (e, targetCharId, targetInvId) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverId(null);

    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    let dragData = null;
    try {
      dragData = JSON.parse(rawData);
    } catch {
      dragData = { type: 'item', id: rawData };
    }

    if (dragData?.type === 'item' || dragData?.type === 'items') {
      const draggedItemIds = dragData.type === 'items' ? dragData.ids : [dragData.id];
      const sourceCharId = state.activeCharacterId;
      if (!sourceCharId) return;

      setState((s) => {
        const sourceChar = s.characters[sourceCharId];
        const targetChar = s.characters[targetCharId];
        if (!sourceChar || !targetChar) return s;

        let allMoved = [];
        let movedIds = new Set();

        for (const draggedItemId of draggedItemIds) {
          const itemToMove = sourceChar.items.find(it => it.id === draggedItemId);
          if (!itemToMove) continue;

          const contained = getContainedItemsRecursive(sourceChar, draggedItemId);
          const itemChain = [itemToMove, ...contained];
          for (const it of itemChain) {
            if (!movedIds.has(it.id)) {
              movedIds.add(it.id);
              allMoved.push(it);
            }
          }
        }

        if (allMoved.length === 0) return s;

        const nextSourceItems = sourceChar.items.filter(it => !movedIds.has(it.id));

        let currentTargetChar = { ...targetChar };
        const updatedMoved = [];
        for (const it of allMoved) {
          const res = matchAndTransferItemMetadata(it, sourceChar, currentTargetChar);
          let updatedItem = res.item;
          currentTargetChar.qualityTiers = res.qualityTiers;
          currentTargetChar.categories = res.categories;

          if (draggedItemIds.includes(updatedItem.id)) {
            updatedItem = { ...updatedItem, inventoryId: targetInvId, containerId: null };
          } else {
            updatedItem = { ...updatedItem, inventoryId: targetInvId };
          }
          updatedMoved.push(updatedItem);
        }

        const nextTargetItems = [...(currentTargetChar.items || []), ...updatedMoved];

        return {
          ...s,
          characters: {
            ...s.characters,
            [sourceCharId]: { ...sourceChar, items: nextSourceItems },
            [targetCharId]: { ...currentTargetChar, items: nextTargetItems }
          }
        };
      });
    }
  };
  // Build the tree nodes starting from parentId
  const renderTree = (parentId) => {
    const currentFolders = Object.values(folders).filter((f) => f.parentId === parentId);
    const currentCharacters = Object.values(characters).filter((c) => c.parentId === parentId);

    // Sorting
    currentFolders.sort((a, b) => a.name.localeCompare(b.name));
    currentCharacters.sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div className="space-y-1">
        {currentFolders.map((f) => {
          const isExpanded = expandedFolders.has(f.id);
          const isRenaming = renamingId === `folder-${f.id}`;
          const isHovered = draggedOverId === `folder-${f.id}`;

          return (
            <div key={f.id}>
              <div
                className="select-none"
                draggable={!isRenaming}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', id: f.id }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraggedOverId(`folder-${f.id}`);
                }}
                onDragLeave={() => setDraggedOverId(null)}
                onDrop={(e) => handleSidebarDrop(e, f.id)}
              >
                <ContextMenu>
                  <ContextMenuTrigger>
                    <div
                      onClick={(e) => toggleFolder(f.id, e)}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-[#121215] cursor-pointer group text-sm font-item tracking-wide silver-text ${
                        isHovered ? 'border border-dashed border-[#6a6c70] bg-[#16161a]' : ''
                      }`}
                    >
                      <button className="text-[#6a6c70] hover:text-[#C8CCD2]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {isExpanded ? (
                        <FolderOpen size={16} className="text-[#8A9196] shrink-0" />
                      ) : (
                        <Folder size={16} className="text-[#8A9196] shrink-0" />
                      )}
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={f.name}
                          onChange={(e) => renameFolder(f.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setRenamingId(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null); }}
                          className="bg-[#0a0a0c] silver-border px-1 py-0.5 text-xs text-[#C8CCD2] outline-none focus:border-[#6a6c70] w-32"
                        />
                      ) : (
                        <span className="truncate flex-1">{f.name}</span>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="bg-[#050507] silver-border">
                    <ContextMenuItem onClick={() => setRenamingId(`folder-${f.id}`)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                      <Pencil size={12} className="mr-2 text-[#8A9196]" /> Rename Folder
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => addFolder(f.id)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                      <FolderPlus size={12} className="mr-2 text-[#8A9196]" /> Create Subfolder
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => addCharacter(f.id)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                      <UserPlus size={12} className="mr-2 text-[#8A9196]" /> Create Character
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-[#1f1f23]" />
                    <ContextMenuItem onClick={() => deleteFolder(f.id)} className="font-meta text-xs text-[#c08080] hover:!bg-[#2a0d10]">
                      <Trash2 size={12} className="mr-2" /> Delete Folder
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>

              {isExpanded && (
                <div className="pl-3 ml-2 border-l border-[#1f1f23] mt-0.5 space-y-0.5">
                  {renderTree(f.id)}
                </div>
              )}
            </div>
          );
        })}

        {currentCharacters.map((c) => {
          const isExpanded = expandedChars.has(c.id);
          const isRenaming = renamingId === `char-${c.id}`;
          const isSelected = state.activeCharacterId === c.id;
          const isHovered = draggedOverId === `char-${c.id}`;

          return (
            <div key={c.id}>
              <div
                className="select-none"
                draggable={!isRenaming}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'character', id: c.id }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraggedOverId(`char-${c.id}`);
                }}
                onDragLeave={() => setDraggedOverId(null)}
                onDrop={(e) => handleCharacterDrop(e, c.id)}
              >
                <ContextMenu>
                  <ContextMenuTrigger>
                    <div
                      onClick={(e) => {
                        if (!isRenaming) selectCharacter(c.id);
                        toggleChar(c.id, e);
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-[#121215] cursor-pointer group text-sm font-item tracking-wide ${
                        isSelected && view === 'inventory' ? 'bg-[#16161a]/60 border-l border-accent border-[#C8CCD2] pl-1.5' : 'silver-text'
                      } ${
                        isHovered ? 'border border-dashed border-[#6a6c70] bg-[#16161a]' : ''
                      }`}
                    >
                      <button onClick={(e) => toggleChar(c.id, e)} className="text-[#6a6c70] hover:text-[#C8CCD2]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <User size={16} className={`shrink-0 ${isSelected ? 'text-[#C8CCD2]' : 'text-[#8A9196]'}`} />
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={c.name}
                          onChange={(e) => renameCharacter(c.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setRenamingId(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null); }}
                          className="bg-[#0a0a0c] silver-border px-1 py-0.5 text-xs text-[#C8CCD2] outline-none focus:border-[#6a6c70] w-32"
                        />
                      ) : (
                        <span className={`truncate flex-1 ${isSelected ? 'font-medium' : ''}`}>{c.name}</span>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="bg-[#050507] silver-border">
                    <ContextMenuItem onClick={() => setRenamingId(`char-${c.id}`)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                      <Pencil size={12} className="mr-2 text-[#8A9196]" /> Rename Character
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => addInventory(c.id)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                      <FolderPlus size={12} className="mr-2 text-[#8A9196]" /> Create Inventory
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateCharacter(c.id)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                      <Copy size={12} className="mr-2 text-[#8A9196]" /> Duplicate
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-[#1f1f23]" />
                    <ContextMenuItem onClick={() => deleteCharacter(c.id)} className="font-meta text-xs text-[#c08080] hover:!bg-[#2a0d10]">
                      <Trash2 size={12} className="mr-2" /> Delete Character
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>

              {isExpanded && (
                <div className="pl-3 ml-2 border-l border-[#1f1f23] mt-0.5 space-y-0.5">
                  {(c.inventories || []).map((inv) => {
                    const isInvRenaming = renamingId === `inv-${inv.id}`;
                    const isInvSelected = state.activeCharacterId === c.id && state.activeInventoryId === inv.id;
                    const isInvHovered = draggedOverId === `inv-${inv.id}`;

                    return (
                      <div
                        key={inv.id}
                        draggable={!isInvRenaming}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'inventory', characterId: c.id, inventoryId: inv.id }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggedOverId(`inv-${inv.id}`);
                        }}
                        onDragLeave={() => setDraggedOverId(null)}
                        onDrop={(e) => handleInventoryDrop(e, c.id, inv.id)}
                      >
                        <ContextMenu>
                          <ContextMenuTrigger>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isInvRenaming) selectInventory(c.id, inv.id);
                              }}
                              className={`flex items-center gap-2 px-2 py-1 hover:bg-[#121215] cursor-pointer text-xs font-item tracking-wide ${
                                isInvSelected && view === 'inventory'
                                  ? 'text-[#E2E4E9] bg-[#1a1a20]/75 border-l-2 border-[#C8CCD2] pl-1.5'
                                  : 'text-[#8A9196] hover:text-[#C8CCD2]'
                              } ${
                                isInvHovered ? 'border border-dashed border-[#6a6c70] bg-[#16161a]' : ''
                              }`}
                            >
                              <Briefcase size={12} className="shrink-0" />
                              {isInvRenaming ? (
                                <input
                                  autoFocus
                                  value={inv.name}
                                  onChange={(e) => renameInventory(c.id, inv.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={() => setRenamingId(null)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null); }}
                                  className="bg-[#0a0a0c] silver-border px-1 py-0.5 text-[#C8CCD2] outline-none focus:border-[#6a6c70] w-32"
                                />
                              ) : (
                                <span className="truncate flex-1">{inv.name}</span>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="bg-[#050507] silver-border">
                            <ContextMenuItem onClick={() => setRenamingId(`inv-${inv.id}`)} className="font-meta text-xs text-[#C8CCD2] hover:!bg-[#16161a]">
                              <Pencil size={12} className="mr-2 text-[#8A9196]" /> Rename Inventory
                            </ContextMenuItem>
                            {(c.inventories || []).length > 1 && (
                              <>
                                <ContextMenuSeparator className="bg-[#1f1f23]" />
                                <ContextMenuItem onClick={() => deleteInventory(c.id, inv.id)} className="font-meta text-xs text-[#c08080] hover:!bg-[#2a0d10]">
                                  <Trash2 size={12} className="mr-2" /> Delete Inventory
                                </ContextMenuItem>
                              </>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      className={`bg-[#08080a] flex flex-col shrink-0 select-none h-screen overflow-hidden transition-all duration-300 ease-in-out ${
        collapsed
          ? 'w-0 border-r-0 opacity-0 pointer-events-none'
          : 'w-64 border-r border-[#1f1f23] opacity-100'
      }`}
    >
      <div className="w-64 flex flex-col h-full shrink-0">
        {/* Title Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f23]">
          <div className="flex items-center gap-2">
            <span
              onClick={() => setView('roster')}
              className="font-display text-[11px] tracking-[0.25em] silver-text engraved cursor-pointer hover:text-[#E2E4E9]"
            >
              CHRONICLE CODEX
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addFolder(null)}
              className="p-1 hover:bg-[#16161a] silver-border bg-[#0d0d0f] text-[#8A9196] hover:text-[#C8CCD2]"
              title="New Folder"
            >
              <FolderPlus size={12} />
            </button>
            <button
              onClick={() => addCharacter(null)}
              className="p-1 hover:bg-[#16161a] silver-border bg-[#0d0d0f] text-[#8A9196] hover:text-[#C8CCD2]"
              title="New Character"
            >
              <UserPlus size={12} />
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-[#16161a] text-[#6a6c70] hover:text-[#C8CCD2]"
              title="Collapse Sidebar"
            >
              <ChevronsLeft size={14} />
            </button>
          </div>
        </div>

        {/* Explorer Tree Body */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDraggedOverId('sidebar-body');
          }}
          onDragLeave={() => setDraggedOverId(null)}
          onDrop={(e) => handleSidebarDrop(e, null)}
          className={`flex-1 overflow-y-auto px-2 py-3 space-y-2 custom-scrollbar transition-colors ${
            draggedOverId === 'sidebar-body' ? 'bg-[#16161a]/30 border-2 border-dashed border-[#6a6c70]/30 m-1 rounded' : ''
          }`}
        >
          {/* Render tree recursively from root (null parentId) */}
          {renderTree(null)}

          {/* Empty State warning */}
          {Object.keys(folders).length === 0 && Object.keys(characters).length === 0 && (
            <div className="text-center py-8 font-meta text-[10px] tracking-[0.15em] text-[#4a4d52] px-2 italic">
              CODEX EMPTY — CLICK ICONS ABOVE TO CREATE A FOLDER OR CHARACTER
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
