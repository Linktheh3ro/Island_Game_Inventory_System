import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Search, Settings, ArrowDownAZ, ArrowUpAZ, ArrowDown01, ArrowUp01, ImagePlus, X, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { createItem, uid, itemCanExpand } from '@/lib/defaults';
import { matches } from '@/lib/fuzzy';
import { ItemRow } from './ItemRow';
import { ItemDialog } from './ItemDialog';
import { SettingsDialog } from './SettingsDialog';
import { DEFAULT_AVATAR } from './CharacterSelect';
import { toast } from 'sonner';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator
} from '@/components/ui/context-menu';

const ALL = '__all__';
const NO_TIER = '__notier__';

const SORTS = [
  { id: 'created-desc', label: 'NEWEST',  icon: ArrowDown01 },
  { id: 'created-asc',  label: 'OLDEST',  icon: ArrowUp01 },
  { id: 'name-asc',     label: 'A → Z',   icon: ArrowDownAZ },
  { id: 'name-desc',    label: 'Z → A',   icon: ArrowUpAZ },
  { id: 'stack-desc',   label: 'STACK ▼', icon: ArrowDown01 },
  { id: 'stack-asc',    label: 'STACK ▲', icon: ArrowUp01 },
];

export const InventoryView = ({ character, state, setState, onBack }) => {
  const [activeTab, setActiveTab] = useState(ALL);
  const [side, setSide] = useState('mundane');
  const [flashCurrencyId, setFlashCurrencyId] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('manual');
  const [colSort, setColSort] = useState({ fieldId: null, direction: null });
  const [tierFilter, setTierFilter] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [itemClipboard, setItemClipboard] = useState(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const tabsRef = useRef(null);
  const scrollIntervalRef = useRef(null);

  const startScrolling = (dir) => {
    if (scrollIntervalRef.current) return;
    scrollIntervalRef.current = setInterval(() => {
      if (tabsRef.current) {
        const el = tabsRef.current;
        const prevScroll = el.scrollLeft;
        el.scrollLeft += dir * 12; // slightly slower & smoother than 18
        if (Math.abs(el.scrollLeft - prevScroll) < 0.5) {
          stopScrolling();
        }
      }
    }, 16);
  };

  const stopScrolling = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const updateTabScrollArrows = () => {
    const el = tabsRef.current;
    if (!el) return;
    const canScrollLeft = el.scrollLeft > 2;
    const canScrollRight = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
    setShowLeftArrow(canScrollLeft);
    setShowRightArrow(canScrollRight);
  };

  useEffect(() => {
    updateTabScrollArrows();
  }, [character.categories, activeTab, side]);

  useEffect(() => {
    window.addEventListener('resize', updateTabScrollArrows);
    return () => window.removeEventListener('resize', updateTabScrollArrows);
  }, []);

  // Allow scrolling horizontally using vertical mouse scroll wheel over categories tab bar
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [isDragOverSection, setIsDragOverSection] = useState(false);

  useEffect(() => {
    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => {
      setIsDragging(false);
      setIsDragOverSection(false);
    };
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setLastClickedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
    setColSort({ fieldId: null, direction: null });
  }, [activeTab, state.activeInventoryId, state.activeCharacterId]);

  const handleColSort = (fieldId) => {
    setColSort((cur) => {
      if (cur.fieldId === fieldId) {
        if (cur.direction === 'asc') return { fieldId, direction: 'desc' };
        if (cur.direction === 'desc') return { fieldId: null, direction: null };
      }
      return { fieldId, direction: 'asc' };
    });
  };

  const renderSortIcon = (fieldId) => {
    if (colSort.fieldId === fieldId) {
      if (colSort.direction === 'asc') return <ArrowUp size={10} className="text-[#E2E4E9] shrink-0" />;
      if (colSort.direction === 'desc') return <ArrowDown size={10} className="text-[#E2E4E9] shrink-0" />;
    }
    return <ArrowUpDown size={10} className="text-[#6a6c70]/40 group-hover:text-[#6a6c70] shrink-0 transition-colors" />;
  };

  const updateCharacter = (next) => {
    setState((s) => ({ ...s, characters: { ...s.characters, [character.id]: next } }));
  };

  const updateItem = (next) => {
    updateCharacter({
      ...character,
      items: character.items.map((it) => it.id === next.id ? next : it),
    });
  };

  const deleteItem = (it) => {
    const toDeleteIds = new Set();
    if (selectedIds.has(it.id)) {
      selectedIds.forEach(id => toDeleteIds.add(id));
    } else {
      toDeleteIds.add(it.id);
    }
    
    const allIdsToDelete = new Set(toDeleteIds);
    const collectSubItems = (colId) => {
      character.items.forEach(x => {
        if (x.containerId === colId && !allIdsToDelete.has(x.id)) {
          allIdsToDelete.add(x.id);
          if (x.subtype === 'Collection') {
            collectSubItems(x.id);
          }
        }
      });
    };
    toDeleteIds.forEach(id => {
      const itemObj = character.items.find(x => x.id === id);
      if (itemObj && itemObj.subtype === 'Collection') {
        collectSubItems(id);
      }
    });

    updateCharacter({
      ...character,
      items: character.items.filter((x) => !allIdsToDelete.has(x.id))
    });

    if (toDeleteIds.size === 1) {
      toast.message(`Removed “${it.name}”`);
    } else {
      toast.message(`Removed ${toDeleteIds.size} selected items`);
    }
    
    setSelectedIds(new Set());
    setLastClickedId(null);
  };

  const duplicateItem = (it) => {
    const copy = { ...it, id: uid(), name: it.name + ' (Copy)', createdAt: Date.now() };
    const idx = character.items.findIndex((x) => x.id === it.id);
    const items = [...character.items];
    items.splice(idx + 1, 0, copy);
    updateCharacter({ ...character, items });
  };

  const sideItems = character.items.filter((i) => (i.side || 'mundane') === side);
  const sideCategories = character.categories.filter((c) => (c.side || 'mundane') === side && !c.isCurrency);
  const sideCurrencies = character.categories.filter((c) => (c.side || 'mundane') === side && c.isCurrency);

  const setCurrencyValue = (catId, val) => {
    updateCharacter({
      ...character,
      categories: character.categories.map((c) => c.id === catId ? { ...c, currencyValue: Math.max(0, Math.min((c.currencyMax ?? 9999), parseInt(val||'0',10))) } : c),
    });
  };
  // Mundane currencies: plain number, no clamping to a max
  const setMundaneCurrencyValue = (catId, val) => {
    updateCharacter({
      ...character,
      categories: character.categories.map((c) => c.id === catId ? { ...c, currencyValue: parseInt(val||'0',10) || 0 } : c),
    });
  };
  const adjustMundaneCurrency = (catId, delta) => {
    const cur = character.categories.find((c) => c.id === catId);
    if (!cur) return;
    updateCharacter({
      ...character,
      categories: character.categories.map((c) => c.id === catId ? { ...c, currencyValue: Math.max(0, (c.currencyValue ?? 0) + delta) } : c),
    });
  };

  const addCategoryTab = () => {
    const cat = { id: uid(), name: 'New Category', side };
    updateCharacter({ ...character, categories: [...character.categories, cat] });
    setActiveTab(cat.id);
    toast.message(`New ${side} category`);
  };

  const handleItemClick = (it, e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('label')) {
      return;
    }

    if (e.shiftKey && lastClickedId) {
      e.preventDefault();
      const fromIdx = visibleItems.findIndex(x => x.id === lastClickedId);
      const toIdx = visibleItems.findIndex(x => x.id === it.id);
      if (fromIdx >= 0 && toIdx >= 0) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const rangeIds = visibleItems.slice(start, end + 1).map(x => x.id);
        
        setSelectedIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(id => next.add(id));
          return next;
        });
      }
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(it.id)) {
          next.delete(it.id);
        } else {
          next.add(it.id);
        }
        return next;
      });
      setLastClickedId(it.id);
    } else {
      setLastClickedId(it.id);
      if (itemCanExpand(it, character)) {
        toggleExpanded(it.id);
      }
    }
  };

  const addNewItem = () => {
    const categoryId = activeTab === ALL ? sideCategories[0]?.id : activeTab;
    if (!categoryId) return toast.error('Create a non-currency category first');
    const it = createItem(categoryId, side === 'magic' ? 'New Ability' : 'New Item', side);
    it.inventoryId = state.activeInventoryId;
    updateCharacter({ ...character, items: [it, ...character.items] });
    setEditingItem(it);
    setItemDialogOpen(true);
  };

  const addNewCollection = () => {
    const categoryId = activeTab === ALL ? sideCategories[0]?.id : activeTab;
    if (!categoryId) return toast.error('Create a non-currency category first');
    const it = createItem(categoryId, 'New Collection', side, true);
    it.inventoryId = state.activeInventoryId;
    updateCharacter({ ...character, items: [it, ...character.items] });
    setEditingItem(it);
    setItemDialogOpen(true);
  };

  const moveItemToCollection = (itemId, collectionId) => {
    if (itemId === collectionId) return;
    updateCharacter({
      ...character,
      items: character.items.map(it => it.id === itemId ? { ...it, containerId: collectionId } : it)
    });
    toast.success("Added to collection");
  };

  const removeItemFromCollection = (itemId) => {
    const targetItem = character.items.find(x => x.id === itemId);
    const parentCol = targetItem ? character.items.find(x => x.id === targetItem.containerId) : null;
    const categoryId = parentCol ? parentCol.categoryId : (targetItem?.categoryId || null);
    updateCharacter({
      ...character,
      items: character.items.map(it => it.id === itemId ? { ...it, containerId: null, categoryId } : it)
    });
    toast.message("Extracted from collection");
  };

  const addItemToCollection = (collectionId) => {
    const colItem = character.items.find(x => x.id === collectionId);
    if (!colItem) return;
    const categoryId = colItem.categoryId || sideCategories[0]?.id;
    const it = createItem(categoryId, 'New Contained Item', colItem.side || 'mundane');
    it.inventoryId = state.activeInventoryId;
    it.containerId = collectionId;
    updateCharacter({ ...character, items: [it, ...character.items] });
    setEditingItem(it);
    setItemDialogOpen(true);
  };

  const openItemSettings = (it) => { setEditingItem(it); setItemDialogOpen(true); };

  const onItemDialogSave = (next) => updateItem(next);

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateCharacter({ ...character, avatar: reader.result });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Drag-drop reorder within items array
  const reorderItem = (draggedId, targetId, edge) => {
    const items = [...character.items];
    const fromIdx = items.findIndex((x) => x.id === draggedId);
    if (fromIdx < 0) return;
    const targetItem = items.find((x) => x.id === targetId);
    if (!targetItem) return;

    const [moved] = items.splice(fromIdx, 1);
    
    // Inherit the containerId and categoryId of the target item
    const wasContained = !!moved.containerId;
    const nextContainerId = targetItem.containerId || null;
    const nextCategoryId = targetItem.categoryId;
    
    if (moved.containerId !== nextContainerId) {
      moved.containerId = nextContainerId;
      if (!nextContainerId) {
        toast.success("Extracted from collection");
      } else {
        toast.success("Moved to collection");
      }
    }
    if (nextCategoryId && moved.categoryId !== nextCategoryId) {
      moved.categoryId = nextCategoryId;
    }

    let toIdx = items.findIndex((x) => x.id === targetId);
    if (toIdx < 0) return;
    if (edge === 'bottom') toIdx += 1;
    items.splice(toIdx, 0, moved);
    updateCharacter({ ...character, items });
    setSort('manual'); // honor manual order after reorder
    setColSort({ fieldId: null, direction: null });
  };

  const toggleTierFilter = (id) => {
    setTierFilter((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Filter + sort
  // Auto-ensure each magic currency category has matching Cost + Storage info fields
  useEffect(() => {
    const currencies = character.categories.filter((c) => c.isCurrency && (c.side || 'mundane') === 'magic');
    const missing = [];
    for (const cur of currencies) {
      const costName = `${cur.name} Cost`;
      const storeName = `${cur.name} Storage`;
      if (!character.infoFields.find((f) => f.name === costName)) missing.push({ id: uid(), name: costName });
      if (!character.infoFields.find((f) => f.name === storeName)) missing.push({ id: uid(), name: storeName });
    }
    if (missing.length) updateCharacter({ ...character, infoFields: [...character.infoFields, ...missing] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.categories.map(c => c.isCurrency && (c.side || 'mundane') === 'magic' ? c.name : '').join('|')]);

  // Effective max per currency = base currencyMax + sum of <Currency> Storage values across items (multiplied by stack size)
  const effectiveMax = (cur) => {
    const storeField = character.infoFields.find((f) => f.name === `${cur.name} Storage`);
    let bonus = 0;
    if (storeField) for (const it of character.items) {
      const v = parseFloat(it.fields?.[storeField.id]);
      if (Number.isFinite(v)) {
        const qty = it.hasStack ? (it.stack ?? 1) : 1;
        bonus += v * qty;
      }
    }
    return (cur.currencyMax ?? 9999) + bonus;
  };

  const resetCurrency = (catId) => {
    const cur = character.categories.find((c) => c.id === catId);
    if (!cur) return;
    updateCharacter({ ...character, categories: character.categories.map((c) => c.id === catId ? { ...c, currencyValue: effectiveMax(cur) } : c) });
  };

  const resetDailyItems = () => {
    const nextItems = character.items.map(it => it.isDaily ? { ...it, isDailyUsed: false } : it);
    updateCharacter({ ...character, items: nextItems });
    toast.success("Reset all daily items and abilities");
  };

  // Cast: find first currency on current side this item has Cost for; deduct or flash
  const castItem = (it) => {
    for (const cur of sideCurrencies) {
      const costField = character.infoFields.find((f) => f.name === `${cur.name} Cost`);
      if (!costField) continue;
      const raw = it.fields?.[costField.id];
      const cost = parseFloat(raw);
      if (!Number.isFinite(cost) || cost <= 0) continue;
      const have = cur.currencyValue ?? 0;
      if (have < cost) {
        setFlashCurrencyId(cur.id);
        setTimeout(() => setFlashCurrencyId(null), 180);
        setTimeout(() => setFlashCurrencyId(cur.id), 360);
        setTimeout(() => setFlashCurrencyId(null), 540);
        toast.error(`Not enough ${cur.name}`);
        return;
      }
      updateCharacter({ ...character, categories: character.categories.map((c) => c.id === cur.id ? { ...c, currencyValue: have - cost } : c) });
      toast.success(`Cast ${it.name} (-${cost} ${cur.name})`);
      return;
    }
  };

  const canCast = (it) => {
    for (const cur of sideCurrencies) {
      const costField = character.infoFields.find((f) => f.name === `${cur.name} Cost`);
      if (!costField) continue;
      const cost = parseFloat(it.fields?.[costField.id]);
      if (!Number.isFinite(cost) || cost <= 0) continue;
      return { cur, cost, ok: (cur.currencyValue ?? 0) >= cost };
    }
    return null;
  };

  const visibleItems = useMemo(() => {
    let arr = sideItems;
    const activeInvId = state.activeInventoryId;
    arr = arr.filter((i) => (i.inventoryId || 'main') === activeInvId && !i.containerId);
    if (activeTab !== ALL) arr = arr.filter((i) => i.categoryId === activeTab);
    if (tierFilter.size > 0) {
      arr = arr.filter((i) => {
        if (!i.tierId) return tierFilter.has(NO_TIER);
        return tierFilter.has(i.tierId);
      });
    }
    if (search) {
      const tierName = (id) => character.qualityTiers.find(t => t.id === id)?.name || '';
      const catName  = (id) => character.categories.find(c => c.id === id)?.name || '';
      arr = arr.filter((i) =>
        matches(search, i.name, i.subtype, catName(i.categoryId), tierName(i.tierId),
          ...Object.values(i.fields || {}))
      );
    }
    if (colSort.fieldId && colSort.direction) {
      arr.sort((a, b) => {
        let valA, valB;
        if (colSort.fieldId === 'name') {
          valA = a.name || '';
          valB = b.name || '';
        } else {
          valA = a.fields?.[colSort.fieldId] ?? '';
          valB = b.fields?.[colSort.fieldId] ?? '';
        }

        const cleanA = String(valA).trim();
        const cleanB = String(valB).trim();

        if (cleanA === '' && cleanB === '') return 0;
        if (cleanA === '') return 1;
        if (cleanB === '') return -1;

        const numA = Number(cleanA);
        const numB = Number(cleanB);
        const isNumA = !isNaN(numA);
        const isNumB = !isNaN(numB);

        let cmp = 0;
        if (isNumA && isNumB) {
          cmp = numA - numB;
        } else {
          cmp = cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
        }
        return colSort.direction === 'asc' ? cmp : -cmp;
      });
    } else if (sort !== 'manual') {
      arr.sort((a, b) => {
        switch (sort) {
          case 'created-asc':  return a.createdAt - b.createdAt;
          case 'created-desc': return b.createdAt - a.createdAt;
          case 'name-asc':     return a.name.localeCompare(b.name);
          case 'name-desc':    return b.name.localeCompare(a.name);
          case 'stack-asc':    return (a.stack ?? 1) - (b.stack ?? 1);
          case 'stack-desc':   return (b.stack ?? 1) - (a.stack ?? 1);
          default: return 0;
        }
      });
    }
    return arr;
  }, [character.items, character.categories, character.qualityTiers, activeTab, search, sort, tierFilter, side, state.activeInventoryId, colSort]);

  // Tab drop handlers (category reassign)
  const onTabDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
  const onTabDragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };
  const handleCategoryDrop = (draggedCatId, targetCatId) => {
    if (draggedCatId === targetCatId) return;
    const cats = [...character.categories];
    const fromIdx = cats.findIndex(c => c.id === draggedCatId);
    const toIdx = cats.findIndex(c => c.id === targetCatId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = cats.splice(fromIdx, 1);
    cats.splice(toIdx, 0, moved);
    updateCharacter({ ...character, categories: cats });
    toast.success("Categories rearranged");
  };

  const handleCategoryDragStart = (e, catId) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'category', id: catId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const renameCategoryTab = (catId) => {
    const cat = character.categories.find(c => c.id === catId);
    if (!cat) return;
    const name = prompt("Rename category:", cat.name);
    if (name === null) return;
    const cleanName = name.trim();
    if (!cleanName) return toast.error("Category name cannot be empty");
    updateCharacter({
      ...character,
      categories: character.categories.map(c => c.id === catId ? { ...c, name: cleanName } : c)
    });
    toast.success(`Category renamed to "${cleanName}"`);
  };

  const deleteCategoryTab = (catId) => {
    const cat = character.categories.find(c => c.id === catId);
    if (!cat) return;
    if (!confirm(`Are you sure you want to delete category "${cat.name}"? Items inside will be moved to the first available category.`)) return;

    const remainingCats = character.categories.filter(c => c.id !== catId);
    const sideCats = remainingCats.filter(c => (c.side || 'mundane') === side && !c.isCurrency);
    const fallbackCatId = sideCats[0]?.id || null;

    updateCharacter({
      ...character,
      categories: remainingCats,
      items: character.items.map(it => it.categoryId === catId ? { ...it, categoryId: fallbackCatId } : it)
    });

    if (activeTab === catId) {
      setActiveTab(fallbackCatId || ALL);
    }
    toast.success(`Category "${cat.name}" deleted`);
  };

  const duplicateCategoryTab = (catId) => {
    const cat = character.categories.find(c => c.id === catId);
    if (!cat) return;
    const nextId = uid();
    const newCat = { ...cat, id: nextId, name: `${cat.name} (Copy)` };

    const itemsToDuplicate = character.items.filter(it => it.categoryId === catId);
    const clonedItems = itemsToDuplicate.map(it => {
      const cloned = { ...it, id: uid(), categoryId: nextId, createdAt: Date.now() };
      return cloned;
    });

    const origIdToClonedId = {};
    itemsToDuplicate.forEach((orig, idx) => {
      origIdToClonedId[orig.id] = clonedItems[idx].id;
    });
    clonedItems.forEach(cloned => {
      if (cloned.containerId && origIdToClonedId[cloned.containerId]) {
        cloned.containerId = origIdToClonedId[cloned.containerId];
      }
    });

    updateCharacter({
      ...character,
      categories: [...character.categories, newCat],
      items: [...character.items, ...clonedItems]
    });
    
    setActiveTab(nextId);
    toast.success(`Duplicated category "${cat.name}" along with ${clonedItems.length} items`);
  };

  const dropOnCategory = (categoryId) => (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData || !categoryId) return;

    let draggedItemIds = [];
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && parsed.type === 'items') {
        draggedItemIds = parsed.ids;
      } else if (parsed && parsed.type === 'category') {
        handleCategoryDrop(parsed.id, categoryId);
        return;
      } else {
        draggedItemIds = [parsed];
      }
    } catch {
      draggedItemIds = [rawData];
    }

    if (draggedItemIds.length === 0) return;

    const idsSet = new Set(draggedItemIds);
    let extractedCount = 0;

    const nextItems = character.items.map((it) => {
      if (idsSet.has(it.id)) {
        const next = { ...it };
        if (next.containerId) {
          next.containerId = null;
          extractedCount++;
        }
        if (categoryId !== ALL) {
          next.categoryId = categoryId;
        }
        return next;
      }
      return it;
    });

    updateCharacter({ ...character, items: nextItems });

    if (extractedCount > 0) {
      toast.success(extractedCount === 1 ? "Extracted 1 item from collection" : `Extracted ${extractedCount} items from collections`);
    } else {
      const targetCat = character.categories.find(c => c.id === categoryId);
      if (targetCat) {
        toast.success(`Moved items to "${targetCat.name}"`);
      }
    }
  };

  const listView = true;
  // Column headers in per-category view: only fields actually used by at least one visible item in this category
  const fieldColumns = useMemo(() => {
    const itemsInView = activeTab === ALL
      ? character.items.filter((i) => (i.inventoryId || 'main') === state.activeInventoryId && !i.containerId && (i.side || 'mundane') === side)
      : character.items.filter((i) => i.categoryId === activeTab);
    const usedIds = new Set();
    for (const it of itemsInView) {
      for (const fid of Object.keys(it.fields || {})) {
        if ((it.fields[fid] ?? '') !== '') usedIds.add(fid);
      }
    }
    return character.infoFields.filter((f) => usedIds.has(f.id) && f.visible !== false).slice(0, 6);
  }, [character.infoFields, character.items, activeTab, state.activeInventoryId, side]);

  useEffect(() => {
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const readItemPayload = (text) => {
      if (!text?.startsWith('TTI_ITEM:')) return null;
      try { return JSON.parse(text.slice('TTI_ITEM:'.length)); } catch { return null; }
    };
    const writeClipboardText = (payload) => {
      try { navigator.clipboard?.writeText(`TTI_ITEM:${JSON.stringify(payload)}`); } catch {}
    };
    const handler = async (e) => {
      if (!(e.ctrlKey || e.metaKey) || isEditable(document.activeElement)) return;
      const key = e.key.toLowerCase();
      if (!['c', 'x', 'v'].includes(key)) return;
      e.preventDefault();

      if (key === 'c' || key === 'x') {
        const item = visibleItems.find((it) => it.id === selectedItemId) || visibleItems[0];
        if (!item) return toast.error('Select an item first');
        const payload = { item, sourceCharacterId: character.id };
        setItemClipboard(payload);
        writeClipboardText(payload);
        if (key === 'x') {
          updateCharacter({ ...character, items: character.items.filter((it) => it.id !== item.id) });
          setSelectedItemId(null);
          setExpandedIds(new Set());
          toast.message(`Cut "${item.name}"`);
        } else {
          toast.message(`Copied "${item.name}"`);
        }
        return;
      }

      let payload = itemClipboard;
      try {
        const text = await navigator.clipboard?.readText?.();
        payload = readItemPayload(text) || payload;
      } catch {}
      const source = payload?.item;
      if (!source) return toast.error('Copy an item first');
      const categoryId = activeTab !== ALL ? activeTab : sideCategories[0]?.id;
      if (!categoryId) return toast.error('Create a non-currency category first');
      const pasted = { ...source, id: uid(), name: source.name, side, categoryId, inventoryId: state.activeInventoryId, createdAt: Date.now() };
      updateCharacter({ ...character, items: [pasted, ...character.items] });
      setSelectedIds(new Set([pasted.id]));
      setLastClickedId(pasted.id);
      setExpandedIds(new Set([pasted.id]));
      toast.success(`Pasted "${pasted.name}"`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, character, itemClipboard, selectedIds, side, sideCategories, updateCharacter, visibleItems, state.activeInventoryId]);

  return (
    <div className="fade-in flex flex-col h-full overflow-hidden" data-testid="inventory-view">
      {/* Side toggle */}
      <div className="max-w-[96%] w-full mx-auto px-4 sm:px-6 pt-4 flex items-center gap-2 shrink-0">
        <span className="font-meta text-[10px] tracking-[0.3em] text-[#6a6c70]">SIDE</span>
        {['mundane', 'magic'].map((s) => (
          <button
            key={s}
            onClick={() => { setSide(s); setActiveTab(ALL); }}
            className={`px-3 py-1 silver-border font-tab text-[11px] ${side === s ? 'bg-[#16161a] text-[#E2E4E9]' : 'bg-[#0a0a0c] text-[#8A9196] hover:text-[#C8CCD2]'}`}
            data-testid={`side-toggle-${s}`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Character header */}
      <div className="max-w-[96%] w-full mx-auto px-4 sm:px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-start gap-5">
          <button onClick={onBack} className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196]" title="Back to roster" data-testid="back-to-roster">
            <ArrowLeft size={16} />
          </button>

          <div className="relative inline-flex items-center justify-center silver-border bg-[#0a0a0c] overflow-hidden shrink-0 gothic-corner" style={{ maxWidth: '180px', maxHeight: '180px', minWidth: '88px', minHeight: '88px' }}>
            <img src={character.avatar || DEFAULT_AVATAR} alt={character.name} className="max-w-[180px] max-h-[180px] object-contain block" data-testid="character-avatar" />
            <button onClick={() => fileRef.current?.click()} className="absolute bottom-1 right-1 p-1 bg-[#050507]/80 silver-border text-[#C8CCD2] hover:bg-[#16161a]" title="Upload avatar" data-testid="upload-avatar-btn">
              <ImagePlus size={12} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} data-testid="upload-avatar-input" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-meta text-[10px] tracking-[0.4em] text-[#6a6c70]">CHARACTER</span>
              {(() => {
                const curInv = character.inventories?.find(inv => inv.id === state.activeInventoryId);
                return curInv ? (
                  <span className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] bg-[#16161a] px-2 py-0.5 silver-border select-none">
                    INVENTORY: {curInv.name.toUpperCase()}
                  </span>
                ) : null;
              })()}
            </div>
            <input
              value={character.name}
              onChange={(e) => updateCharacter({ ...character, name: e.target.value })}
              className="w-full bg-transparent font-display text-3xl sm:text-4xl silver-text engraved outline-none border-b border-transparent hover:border-[#2a2a2e] focus:border-[#6a6c70] py-1"
              data-testid="character-name-input"
            />
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            <button onClick={() => setSettingsOpen(true)} className="px-3 py-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center justify-center gap-2" data-testid="open-settings-btn">
              <Settings size={14} />
              SETTINGS
            </button>
            <button onClick={resetDailyItems} className="px-3 py-1.5 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[9px] tracking-[0.15em] text-[#C8CCD2] flex items-center justify-center gap-1.5" data-testid="reset-dailies-btn">
              <RotateCcw size={10} />
              RESET DAILY USES
            </button>
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="max-w-[96%] w-full mx-auto px-4 sm:px-6 shrink-0">
        <div className="silver-border bg-[#0a0a0c] flex items-center gap-2 px-3 py-2 flex-wrap">
          <Search size={14} className="text-[#6a6c70]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all items, tags, abilities…"
            className="flex-1 min-w-[180px] bg-transparent font-item text-sm text-[#C8CCD2] outline-none placeholder:text-[#4a4d52]"
            data-testid="search-input"
          />
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70] mr-1">SORT</span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSort(s.id); setColSort({ fieldId: null, direction: null }); }}
                className={`px-2 py-1 font-meta text-[10px] tracking-[0.15em] silver-border ${sort === s.id ? 'bg-[#16161a] text-[#E2E4E9]' : 'bg-[#0d0d0f] text-[#8A9196] hover:text-[#C8CCD2]'}`}
                data-testid={`sort-${s.id}`}
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={() => { setSort('manual'); setColSort({ fieldId: null, direction: null }); }}
              className={`px-2 py-1 font-meta text-[10px] tracking-[0.15em] silver-border ${sort === 'manual' ? 'bg-[#16161a] text-[#E2E4E9]' : 'bg-[#0d0d0f] text-[#8A9196] hover:text-[#C8CCD2]'}`}
              data-testid="sort-manual"
              title="Custom drag order"
            >
              MANUAL
            </button>
          </div>
        </div>

        {/* Tier filter chips */}
        {side === 'mundane' && (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="tier-filter-chips">
          <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">QUALITY</span>
          {character.qualityTiers.map((t) => {
            const active = tierFilter.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTierFilter(t.id)}
                className={`px-2 py-1 silver-border font-meta text-[10px] tracking-[0.15em] ${active ? 'bg-[#16161a]' : 'bg-[#0a0a0c] hover:bg-[#0d0d0f]'}`}
                style={{ color: t.color, textShadow: t.glow ? '0 0 4px rgba(255,255,255,0.7)' : undefined, opacity: tierFilter.size > 0 && !active ? 0.4 : 1 }}
                data-testid={`tier-chip-${t.name}`}
              >
                {t.name.toUpperCase()}
              </button>
            );
          })}
          <button
            onClick={() => toggleTierFilter(NO_TIER)}
            className={`px-2 py-1 silver-border font-meta text-[10px] tracking-[0.15em] text-[#8A9196] ${tierFilter.has(NO_TIER) ? 'bg-[#16161a]' : 'bg-[#0a0a0c]'}`}
            data-testid="tier-chip-none"
          >
            NO TIER
          </button>
          {tierFilter.size > 0 && (
            <button
              onClick={() => setTierFilter(new Set())}
              className="px-2 py-1 font-meta text-[10px] tracking-[0.15em] text-[#6a6c70] hover:text-[#C8CCD2] flex items-center gap-1"
              data-testid="clear-tier-filter"
            >
              <X size={10} /> CLEAR
            </button>
          )}
        </div>
        )}
      </div>

      {/* Sidebar + list */}
      <div className="max-w-[96%] w-full mx-auto px-4 sm:px-6 mt-4 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 overflow-hidden mb-4">
        <aside className="space-y-2 overflow-y-auto custom-scrollbar px-2 py-1 h-full">
          <div className="w-full gothic-corner relative min-h-[72px]">
            <div className="absolute inset-0 silver-border bg-[#16161a] font-display text-base tracking-[0.18em] silver-text engraved flex items-center justify-center group overflow-hidden cursor-pointer transition-all duration-300">
              {/* Default state */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 transition-all duration-300 opacity-100 group-hover:opacity-0 group-hover:translate-y-[-20px] pointer-events-none">
                <Plus size={18} />
                <span>NEW</span>
              </div>

              {/* Hover state */}
              <div className="absolute inset-0 flex transition-all duration-300 opacity-0 translate-y-[20px] group-hover:opacity-100 group-hover:translate-y-0">
                <button
                  onClick={(e) => { e.stopPropagation(); addNewItem(); }}
                  className="flex-1 hover:bg-[#1f1f23]/60 transition-colors flex items-center justify-center border-r border-[#2A2A2E]/50 font-display text-[11px] tracking-[0.15em] silver-text hover:text-white focus:outline-none"
                  data-testid="new-item-btn"
                >
                  {side === 'magic' ? 'ABILITY' : 'ITEM'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); addNewCollection(); }}
                  className="flex-1 hover:bg-[#1f1f23]/60 transition-colors flex items-center justify-center font-display text-[11px] tracking-[0.15em] silver-text hover:text-white focus:outline-none"
                  data-testid="new-collection-btn"
                >
                  COLLECTION
                </button>
              </div>
            </div>
          </div>
          {sideCurrencies.length > 0 && (
            <div className="silver-border bg-[#0a0a0c] p-3 space-y-3" data-testid="currency-strip">
              <div className="font-meta text-[10px] tracking-[0.3em] text-[#6a6c70]">{side === 'magic' ? 'RESERVES' : 'CURRENCY'}</div>
              {sideCurrencies.map((cur) => (
                side === 'magic' ? (
                  <div
                    key={cur.id}
                    className={`silver-border bg-[#08080a] px-2 py-2 space-y-2 transition-colors ${flashCurrencyId === cur.id ? 'bg-[#3a0a12]' : ''}`}
                    data-testid={`currency-${cur.name}`}
                  >
                    <div className="font-meta text-[10px] tracking-[0.25em] text-[#8A9196]">{cur.name.toUpperCase()}</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={cur.currencyValue ?? 0}
                        onChange={(e) => setCurrencyValue(cur.id, e.target.value)}
                        className="w-16 bg-[#050507] silver-border px-2 py-1 font-meta text-sm text-[#C8CCD2] tabular-nums text-center focus:outline-none focus:border-[#6a6c70] no-spin"
                        data-testid={`currency-input-${cur.name}`}
                      />
                      <span className="font-meta text-[10px] text-[#4a4d52] flex-1">/ {effectiveMax(cur)}</span>
                      <button onClick={() => resetCurrency(cur.id)} className="px-2 py-1 silver-border bg-[#16161a] hover:bg-[#1f1f23] font-meta text-[10px] tracking-[0.15em] text-[#C8CCD2]" data-testid={`currency-reset-${cur.name}`}>RESET</button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={cur.id}
                    className="silver-border bg-[#08080a] px-2 py-2 space-y-2"
                    data-testid={`currency-${cur.name}`}
                  >
                    <div className="font-meta text-[10px] tracking-[0.25em] text-[#8A9196]">{cur.name.toUpperCase()}</div>
                    <input
                      type="number"
                      value={cur.currencyValue ?? 0}
                      onChange={(e) => setMundaneCurrencyValue(cur.id, e.target.value)}
                      className="w-full bg-[#050507] silver-border px-2 py-1 font-meta text-sm text-[#C8CCD2] tabular-nums text-center focus:outline-none focus:border-[#6a6c70] no-spin"
                      data-testid={`currency-input-${cur.name}`}
                    />
                    <div className="flex items-center justify-between gap-1">
                      {[-100, -10, -1].map((d) => (
                        <button key={d} onClick={() => adjustMundaneCurrency(cur.id, d)} className="flex-1 px-1 py-0.5 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[9px] text-[#C8CCD2]" data-testid={`currency-${cur.name}-${d}`}>{d}</button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      {[100, 10, 1].map((d) => (
                        <button key={d} onClick={() => adjustMundaneCurrency(cur.id, d)} className="flex-1 px-1 py-0.5 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[9px] text-[#C8CCD2]" data-testid={`currency-${cur.name}-+${d}`}>+{d}</button>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </aside>

        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          {/* Tabs */}
          <div className="mb-2 shrink-0 relative flex items-center group/tabs">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => startScrolling(-1)}
              onMouseLeave={stopScrolling}
              onDragOver={(e) => { e.preventDefault(); startScrolling(-1); }}
              onDragLeave={stopScrolling}
              onDrop={stopScrolling}
              onClick={() => { if (tabsRef.current) tabsRef.current.scrollLeft -= 100; }}
              className={`absolute left-1 z-10 p-1 bg-[#0a0a0c]/90 silver-border text-[#8A9196] hover:text-[#E2E4E9] flex items-center justify-center transition-all duration-200 ${
                showLeftArrow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              style={{ top: '50%', transform: 'translateY(-50%)' }}
              title="Scroll Left"
            >
              <ChevronLeft size={14} />
            </button>
            <div
              ref={tabsRef}
              onScroll={updateTabScrollArrows}
              className="flex-1 flex items-end gap-1 border-b border-[#1f1f23] overflow-x-auto overflow-y-hidden no-scrollbar relative"
            >
              <TabButton label="EVERYTHING" active={activeTab === ALL} onClick={() => setActiveTab(ALL)} onDragOver={onTabDragOver} onDragLeave={onTabDragLeave} onDrop={dropOnCategory(ALL)} testId="tab-everything" />
              {sideCategories.map((c) => (
                <ContextMenu key={c.id}>
                  <ContextMenuTrigger>
                    <TabButton
                      label={c.name.toUpperCase()}
                      active={activeTab === c.id}
                      onClick={() => setActiveTab(c.id)}
                      draggable
                      onDragStart={(e) => handleCategoryDragStart(e, c.id)}
                      onDragOver={onTabDragOver}
                      onDragLeave={onTabDragLeave}
                      onDrop={dropOnCategory(c.id)}
                      testId={`tab-${c.id}`}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    <ContextMenuItem onClick={() => renameCategoryTab(c.id)}>
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateCategoryTab(c.id)}>
                      Duplicate
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-[#1f1f23]" />
                    <ContextMenuItem onClick={() => deleteCategoryTab(c.id)} className="text-red-500 focus:text-red-500 focus:bg-red-950/20">
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              <button
                onClick={addCategoryTab}
                className="px-4 pt-2.5 pb-3 font-tab text-sm text-[#6a6c70] hover:text-[#E2E4E9] hover:rotate-90 transition-transform duration-300 flex items-center justify-center shrink-0"
                data-testid="tab-new-category"
                title="New Category"
              >
                <Plus size={14} className="stroke-[1.5]" />
              </button>
            </div>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => startScrolling(1)}
              onMouseLeave={stopScrolling}
              onDragOver={(e) => { e.preventDefault(); startScrolling(1); }}
              onDragLeave={stopScrolling}
              onDrop={stopScrolling}
              onClick={() => { if (tabsRef.current) tabsRef.current.scrollLeft += 100; }}
              className={`absolute right-1 z-10 p-1 bg-[#0a0a0c]/90 silver-border text-[#8A9196] hover:text-[#E2E4E9] flex items-center justify-center transition-all duration-200 ${
                showRightArrow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              style={{ top: '50%', transform: 'translateY(-50%)' }}
              title="Scroll Right"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <section
            className={`silver-border bg-[#08080a] flex flex-col h-full min-h-0 overflow-hidden ${isDragging && isDragOverSection ? 'drag-over' : ''}`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget || e.target.classList.contains('py-16')) {
                setSelectedIds(new Set());
                setLastClickedId(null);
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOverSection(true);
            }}
            onDragLeave={() => setIsDragOverSection(false)}
            onDrop={(e) => {
              setIsDragOverSection(false);
              dropOnCategory(activeTab)(e);
            }}
            data-testid="inventory-list"
          >
            {listView && (
              <div
                className="grid items-center gap-3 px-4 py-2 border-b border-[#1f1f23] bg-[#0a0a0c] font-meta text-[10px] tracking-[0.25em] text-[#6a6c70] shrink-0"
                style={{ gridTemplateColumns: `24px minmax(0,2fr) ${fieldColumns.map(() => 'minmax(0,1fr)').join(' ')} 180px` }}
              >
                <div />
                <div 
                  onClick={() => handleColSort('name')}
                  className="truncate flex items-center gap-1 cursor-pointer select-none hover:text-[#C8CCD2] transition-colors group"
                  data-testid="header-name"
                >
                  <span>NAME</span>
                  {renderSortIcon('name')}
                </div>
                {fieldColumns.map((f) => (
                  <div 
                    key={f.id} 
                    onClick={() => handleColSort(f.id)}
                    className="truncate flex items-center justify-center gap-1 cursor-pointer select-none hover:text-[#C8CCD2] transition-colors group text-center"
                    data-testid={`header-field-${f.name}`}
                  >
                    <span>{f.name.toUpperCase()}</span>
                    {renderSortIcon(f.id)}
                  </div>
                ))}
                <div className="text-right pr-2">·</div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0" data-testid="item-list-scroll-container">
              {visibleItems.length === 0 ? (
                <div className="text-center py-16 font-meta text-xs tracking-[0.25em] text-[#4a4d52]">
                  {search || tierFilter.size > 0 ? 'NO MATCHES FOUND' : 'INVENTORY EMPTY — CLICK "NEW ITEM"'}
                </div>
              ) : (
                visibleItems.map((it) => {
                  const castInfo = canCast(it);
                  return (
                    <ItemRow
                      key={it.id}
                      item={it}
                      character={character}
                      expanded={expandedIds.has(it.id)}
                      selected={selectedIds.has(it.id)}
                      selectedIds={selectedIds}
                      onItemClick={handleItemClick}
                      onToggle={() => toggleExpanded(it.id)}
                      onUpdate={updateItem}
                      onSelect={() => {}}
                      onDelete={deleteItem}
                      onDuplicate={duplicateItem}
                      onOpenSettings={openItemSettings}
                      onDragStart={() => {}}
                      onDragEnd={() => {}}
                      onDropOnItem={reorderItem}
                      onDropInsideCollection={moveItemToCollection}
                      onRemoveFromCollection={removeItemFromCollection}
                      onAddItemToCollection={addItemToCollection}
                      expandedIds={expandedIds}
                      toggleExpanded={toggleExpanded}
                      canCast={canCast}
                      draggable
                      showCategoryLabel={activeTab === ALL}
                      listView={listView}
                      fieldColumns={fieldColumns}
                      castInfo={castInfo}
                      onCast={castItem}
                    />
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        character={character}
        onSave={onItemDialogSave}
        onUpdateCharacter={updateCharacter}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        character={character}
        onUpdateCharacter={updateCharacter}
        activeInventoryId={state.activeInventoryId}
      />
    </div>
  );
};

const TabButton = ({ label, active, onClick, onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, draggable, testId }) => (
  <button
    onClick={onClick}
    draggable={draggable}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    className={`px-4 pt-2.5 pb-3 font-tab text-xs whitespace-nowrap transition-colors ${active ? 'tab-active' : 'text-[#6a6c70] hover:text-[#C8CCD2]'}`}
    data-testid={testId}
  >
    {label}
  </button>
);
