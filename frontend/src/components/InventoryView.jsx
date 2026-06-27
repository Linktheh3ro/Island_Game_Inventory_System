import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Search, Settings, ArrowDownAZ, ArrowUpAZ, ArrowDown01, ArrowUp01, ImagePlus, X } from 'lucide-react';
import { createItem, uid } from '@/lib/defaults';
import { matches } from '@/lib/fuzzy';
import { ItemRow } from './ItemRow';
import { ItemDialog } from './ItemDialog';
import { SettingsDialog } from './SettingsDialog';
import { DEFAULT_AVATAR } from './CharacterSelect';
import { toast } from 'sonner';

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
  const [tierFilter, setTierFilter] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [itemClipboard, setItemClipboard] = useState(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef(null);

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
    updateCharacter({ ...character, items: character.items.filter((x) => x.id !== it.id) });
    toast.message(`Removed “${it.name}”`);
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

  const addNewItem = () => {
    const categoryId = activeTab === ALL ? sideCategories[0]?.id : activeTab;
    if (!categoryId) return toast.error('Create a non-currency category first');
    const it = createItem(categoryId, side === 'magic' ? 'New Ability' : 'New Item', side);
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
    const [moved] = items.splice(fromIdx, 1);
    let toIdx = items.findIndex((x) => x.id === targetId);
    if (toIdx < 0) return;
    if (edge === 'bottom') toIdx += 1;
    items.splice(toIdx, 0, moved);
    updateCharacter({ ...character, items });
    setSort('manual'); // honor manual order after reorder
  };

  const toggleTierFilter = (id) => {
    setTierFilter((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Filter + sort
  // Auto-ensure each currency category has matching Cost + Storage info fields
  useEffect(() => {
    const currencies = character.categories.filter((c) => c.isCurrency);
    const missing = [];
    for (const cur of currencies) {
      const costName = `${cur.name} Cost`;
      const storeName = `${cur.name} Storage`;
      if (!character.infoFields.find((f) => f.name === costName)) missing.push({ id: uid(), name: costName });
      if (!character.infoFields.find((f) => f.name === storeName)) missing.push({ id: uid(), name: storeName });
    }
    if (missing.length) updateCharacter({ ...character, infoFields: [...character.infoFields, ...missing] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.categories.map(c => c.isCurrency ? c.name : '').join('|')]);

  // Effective max per currency = base currencyMax + sum of <Currency> Storage values across items
  const effectiveMax = (cur) => {
    const storeField = character.infoFields.find((f) => f.name === `${cur.name} Storage`);
    let bonus = 0;
    if (storeField) for (const it of character.items) {
      const v = parseFloat(it.fields?.[storeField.id]);
      if (Number.isFinite(v)) bonus += v;
    }
    return (cur.currencyMax ?? 9999) + bonus;
  };

  const resetCurrency = (catId) => {
    const cur = character.categories.find((c) => c.id === catId);
    if (!cur) return;
    updateCharacter({ ...character, categories: character.categories.map((c) => c.id === catId ? { ...c, currencyValue: effectiveMax(cur) } : c) });
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
    if (sort !== 'manual') {
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
  }, [character.items, character.categories, character.qualityTiers, activeTab, search, sort, tierFilter, side]);

  // Tab drop handlers (category reassign)
  const onTabDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
  const onTabDragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };
  const dropOnCategory = (categoryId) => (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const itemId = e.dataTransfer.getData('text/plain');
    if (!itemId || !categoryId || categoryId === ALL) return;
    updateCharacter({
      ...character,
      items: character.items.map((it) => it.id === itemId ? { ...it, categoryId } : it),
    });
  };

  const listView = activeTab !== ALL;
  // Column headers in per-category view: only fields actually used by at least one visible item in this category
  const fieldColumns = useMemo(() => {
    if (activeTab === ALL) return character.infoFields.slice(0, 4);
    const itemsInCat = character.items.filter((i) => i.categoryId === activeTab);
    const usedIds = new Set();
    for (const it of itemsInCat) {
      for (const fid of Object.keys(it.fields || {})) {
        if ((it.fields[fid] ?? '') !== '') usedIds.add(fid);
      }
    }
    return character.infoFields.filter((f) => usedIds.has(f.id)).slice(0, 6);
  }, [character.infoFields, character.items, activeTab]);

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
          setExpandedId(null);
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
      const pasted = { ...source, id: uid(), name: source.name, side, categoryId, createdAt: Date.now() };
      updateCharacter({ ...character, items: [pasted, ...character.items] });
      setSelectedItemId(pasted.id);
      setExpandedId(pasted.id);
      toast.success(`Pasted "${pasted.name}"`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, character, itemClipboard, selectedItemId, side, sideCategories, updateCharacter, visibleItems]);

  return (
    <div className="fade-in" data-testid="inventory-view">
      {/* Side toggle */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 flex items-center gap-2">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-4">
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
            <div className="font-meta text-[10px] tracking-[0.4em] text-[#6a6c70]">CHARACTER</div>
            <input
              value={character.name}
              onChange={(e) => updateCharacter({ ...character, name: e.target.value })}
              className="w-full bg-transparent font-display text-3xl sm:text-4xl silver-text engraved outline-none border-b border-transparent hover:border-[#2a2a2e] focus:border-[#6a6c70] py-1"
              data-testid="character-name-input"
            />
          </div>

          <button onClick={() => setSettingsOpen(true)} className="px-3 py-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center gap-2" data-testid="open-settings-btn">
            <Settings size={14} />
            SETTINGS
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
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
                onClick={() => setSort(s.id)}
                className={`px-2 py-1 font-meta text-[10px] tracking-[0.15em] silver-border ${sort === s.id ? 'bg-[#16161a] text-[#E2E4E9]' : 'bg-[#0d0d0f] text-[#8A9196] hover:text-[#C8CCD2]'}`}
                data-testid={`sort-${s.id}`}
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={() => setSort('manual')}
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

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
        <div className="flex items-end gap-1 border-b border-[#1f1f23] overflow-x-auto">
          <TabButton label="EVERYTHING" active={activeTab === ALL} onClick={() => setActiveTab(ALL)} onDragOver={onTabDragOver} onDragLeave={onTabDragLeave} testId="tab-everything" />
          {sideCategories.map((c) => (
            <TabButton
              key={c.id}
              label={c.name.toUpperCase()}
              active={activeTab === c.id}
              onClick={() => setActiveTab(c.id)}
              onDragOver={onTabDragOver}
              onDragLeave={onTabDragLeave}
              onDrop={dropOnCategory(c.id)}
              testId={`tab-${c.id}`}
            />
          ))}
          <button
            onClick={addCategoryTab}
            className="px-4 py-2 font-tab text-xs whitespace-nowrap text-[#6a6c70] hover:text-[#C8CCD2] flex items-center gap-1 shrink-0"
            data-testid="tab-new-category"
          >
            <Plus size={12} /> NEW CATEGORY
          </button>
        </div>
      </div>

      {/* Sidebar + list */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4 pb-16 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
        <aside className="space-y-2">
          <button onClick={addNewItem} className="w-full silver-border bg-[#16161a] hover:bg-[#1f1f23] py-6 font-display text-base tracking-[0.18em] silver-text engraved flex items-center justify-center gap-2 gothic-corner" data-testid="new-item-btn">
            <Plus size={18} />
            {side === 'magic' ? 'NEW ABILITY' : 'NEW ITEM'}
          </button>
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
          <div className="silver-border bg-[#0a0a0c] p-3 font-meta text-[9px] tracking-[0.2em] text-[#6a6c70] leading-relaxed">
            <div className="text-[#8A9196] mb-1">SHORTCUTS</div>
            CTRL+Z UNDO<br/>
            CTRL+SHIFT+Z REDO<br/>
            CTRL+C COPY ITEM<br/>
            CTRL+X CUT ITEM<br/>
            CTRL+V PASTE ITEM
          </div>
        </aside>

        <section
          className="silver-border bg-[#08080a] min-h-[320px]"
          onDragOver={activeTab !== ALL ? onTabDragOver : undefined}
          onDragLeave={activeTab !== ALL ? onTabDragLeave : undefined}
          onDrop={activeTab !== ALL ? dropOnCategory(activeTab) : undefined}
          data-testid="inventory-list"
        >
          {listView && (
            <div
              className="grid items-center gap-3 px-4 py-2 border-b border-[#1f1f23] bg-[#0a0a0c] font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]"
              style={{ gridTemplateColumns: `minmax(0,2fr) ${fieldColumns.map(() => 'minmax(0,1fr)').join(' ')} auto` }}
            >
              <div>NAME</div>
              {fieldColumns.map((f) => <div key={f.id}>{f.name.toUpperCase()}</div>)}
              <div>·</div>
            </div>
          )}

          {visibleItems.length === 0 && (
            <div className="text-center py-16 font-meta text-xs tracking-[0.25em] text-[#4a4d52]">
              {search || tierFilter.size > 0 ? 'NO MATCHES FOUND' : 'INVENTORY EMPTY — CLICK "NEW ITEM"'}
            </div>
          )}

          {visibleItems.map((it) => {
            const castInfo = canCast(it);
            return (
            <ItemRow
              key={it.id}
              item={it}
              character={character}
              expanded={!listView && expandedId === it.id}
              onToggle={() => { setSelectedItemId(it.id); setExpandedId((cur) => cur === it.id ? null : it.id); }}
              onUpdate={updateItem}
              onSelect={() => setSelectedItemId(it.id)}
              onDelete={deleteItem}
              onDuplicate={duplicateItem}
              onOpenSettings={openItemSettings}
              onDragStart={() => {}}
              onDragEnd={() => {}}
              onDropOnItem={reorderItem}
              draggable
              showCategoryLabel={activeTab === ALL}
              listView={listView}
              fieldColumns={fieldColumns}
              castInfo={castInfo}
              onCast={() => castItem(it)}
            />);
          })}
        </section>
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
      />
    </div>
  );
};

const TabButton = ({ label, active, onClick, onDragOver, onDragLeave, onDrop, testId }) => (
  <button
    onClick={onClick}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    className={`px-4 py-2 font-tab text-xs whitespace-nowrap transition-colors ${active ? 'tab-active' : 'text-[#6a6c70] hover:text-[#C8CCD2]'}`}
    data-testid={testId}
  >
    {label}
  </button>
);
