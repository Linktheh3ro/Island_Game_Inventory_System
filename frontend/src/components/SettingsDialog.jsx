import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { uid, createItem } from '@/lib/defaults';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const deleteCurrencyFields = (infoFields, catName) => {
  const costName = `${catName} Cost`;
  const storeName = `${catName} Storage`;
  const toDeleteIds = infoFields.filter(f => f.name === costName || f.name === storeName).map(f => f.id);
  return {
    nextFields: infoFields.filter(f => !toDeleteIds.includes(f.id)),
    deleteIds: toDeleteIds
  };
};

const cleanItemFields = (items, deleteIds) => {
  if (!deleteIds.length) return items;
  return items.map(it => {
    const nextFields = { ...it.fields };
    for (const id of deleteIds) delete nextFields[id];
    return { ...it, fields: nextFields };
  });
};

const LocalInput = ({ value, onChange, className, ...props }) => {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const commit = () => {
    if (localVal !== value) {
      onChange(localVal);
    }
  };

  return (
    <input
      {...props}
      className={className}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      }}
    />
  );
};

export const SettingsDialog = ({ open, onOpenChange, character, onUpdateCharacter, activeInventoryId }) => {
  const [pendingFieldDelete, setPendingFieldDelete] = useState(null);
  const [importText, setImportText] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');

  const importCategories = useMemo(() => {
    if (!character) return [];
    return character.categories.filter(c => !c.isCurrency);
  }, [character]);

  useEffect(() => {
    if (importCategories.length > 0) {
      const exists = importCategories.some(c => c.id === selectedCatId);
      if (!exists) {
        setSelectedCatId(importCategories[0].id);
      }
    } else {
      setSelectedCatId('');
    }
  }, [importCategories, selectedCatId]);

  if (!character) return null;

  const update = (patch) => onUpdateCharacter({ ...character, ...patch });

  const handleImportList = () => {
    const names = importText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (names.length === 0) {
      toast.error('No items to import');
      return;
    }
    
    const targetCat = character.categories.find(c => c.id === selectedCatId);
    if (!targetCat) {
      toast.error('Selected category not found');
      return;
    }
    
    const side = targetCat.side || 'mundane';
    const invId = activeInventoryId || character.inventories[0]?.id;
    
    const newItems = names.map(name => {
      const it = createItem(selectedCatId, name, side);
      it.inventoryId = invId;
      return it;
    });
    
    update({ items: [...newItems, ...character.items] });
    setImportText('');
    toast.success(`Successfully imported ${names.length} items into "${targetCat.name}"`);
  };

  // Categories
  const addCategory = (side) => update({ categories: [...character.categories, { id: uid(), name: 'New Category', side }] });
  
  const renameCategory = (id, name) => {
    const oldCat = character.categories.find(c => c.id === id);
    if (!oldCat) return;
    const oldName = oldCat.name;
    const nextCats = character.categories.map(c => c.id === id ? { ...c, name } : c);
    
    let nextFields = character.infoFields;
    if (oldCat.isCurrency && (oldCat.side || 'mundane') === 'magic') {
      const oldCost = `${oldName} Cost`;
      const oldStore = `${oldName} Storage`;
      const newCost = `${name} Cost`;
      const newStore = `${name} Storage`;
      nextFields = character.infoFields.map(f => {
        if (f.name === oldCost) return { ...f, name: newCost };
        if (f.name === oldStore) return { ...f, name: newStore };
        return f;
      });
    }
    
    onUpdateCharacter({
      ...character,
      categories: nextCats,
      infoFields: nextFields
    });
  };

  const changeCategorySide = (id, side) => {
    const oldCat = character.categories.find(c => c.id === id);
    if (!oldCat) return;
    const nextCats = character.categories.map(c => c.id === id ? { ...c, side } : c);

    let nextFields = character.infoFields;
    let nextItems = character.items;

    if (oldCat.isCurrency) {
      if (side === 'magic' && (oldCat.side || 'mundane') !== 'magic') {
        const costName = `${oldCat.name} Cost`;
        const storeName = `${oldCat.name} Storage`;
        const missing = [];
        if (!character.infoFields.find(f => f.name === costName)) missing.push({ id: uid(), name: costName });
        if (!character.infoFields.find(f => f.name === storeName)) missing.push({ id: uid(), name: storeName });
        if (missing.length) nextFields = [...character.infoFields, ...missing];
      } else if (side !== 'magic' && (oldCat.side || 'mundane') === 'magic') {
        const { nextFields: filteredFields, deleteIds } = deleteCurrencyFields(character.infoFields, oldCat.name);
        nextFields = filteredFields;
        nextItems = cleanItemFields(character.items, deleteIds);
      }
    }

    onUpdateCharacter({
      ...character,
      categories: nextCats,
      infoFields: nextFields,
      items: nextItems
    });
  };

  const toggleCategoryCurrency = (id, isCurrency) => {
    const oldCat = character.categories.find(c => c.id === id);
    if (!oldCat) return;
    const nextCats = character.categories.map(c => c.id === id ? {
      ...c,
      isCurrency,
      currencyValue: c.currencyValue ?? 0,
      currencyMax: c.currencyMax ?? 9999
    } : c);

    let nextFields = character.infoFields;
    let nextItems = character.items;

    if ((oldCat.side || 'mundane') === 'magic') {
      if (isCurrency && !oldCat.isCurrency) {
        const costName = `${oldCat.name} Cost`;
        const storeName = `${oldCat.name} Storage`;
        const missing = [];
        if (!character.infoFields.find(f => f.name === costName)) missing.push({ id: uid(), name: costName });
        if (!character.infoFields.find(f => f.name === storeName)) missing.push({ id: uid(), name: storeName });
        if (missing.length) nextFields = [...character.infoFields, ...missing];
      } else if (!isCurrency && oldCat.isCurrency) {
        const { nextFields: filteredFields, deleteIds } = deleteCurrencyFields(character.infoFields, oldCat.name);
        nextFields = filteredFields;
        nextItems = cleanItemFields(character.items, deleteIds);
      }
    }

    onUpdateCharacter({
      ...character,
      categories: nextCats,
      infoFields: nextFields,
      items: nextItems
    });
  };

  const removeCategory = (id) => {
    if (character.categories.length <= 1) return;
    const oldCat = character.categories.find(c => c.id === id);
    if (!oldCat) return;
    const fallback = character.categories.find(c => c.id !== id)?.id;

    let nextFields = character.infoFields;
    let nextItems = character.items.map(it => it.categoryId === id ? { ...it, categoryId: fallback } : it);

    if (oldCat.isCurrency && (oldCat.side || 'mundane') === 'magic') {
      const { nextFields: filteredFields, deleteIds } = deleteCurrencyFields(character.infoFields, oldCat.name);
      nextFields = filteredFields;
      nextItems = cleanItemFields(nextItems, deleteIds);
    }

    onUpdateCharacter({
      ...character,
      categories: character.categories.filter(c => c.id !== id),
      infoFields: nextFields,
      items: nextItems
    });
  };

  const moveCategory = (id, dir) => {
    const arr = [...character.categories];
    const idx = arr.findIndex(c => c.id === id);
    if (idx < 0) return;
    const sideKey = arr[idx].side || 'mundane';
    let j = idx + dir;
    while (j >= 0 && j < arr.length && (arr[j].side || 'mundane') !== sideKey) j += dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    update({ categories: arr });
  };

  // Tiers
  const addTier = () => update({ qualityTiers: [...character.qualityTiers, { id: uid(), name: 'New Tier', color: '#888888', glow: false }] });
  const updateTier = (id, patch) => update({ qualityTiers: character.qualityTiers.map(t => t.id === id ? { ...t, ...patch } : t) });
  const removeTier = (id) => update({
    qualityTiers: character.qualityTiers.filter(t => t.id !== id),
    items: character.items.map(it => it.tierId === id ? { ...it, tierId: null } : it),
  });
  const moveTier = (id, dir) => {
    const arr = [...character.qualityTiers];
    const idx = arr.findIndex(t => t.id === id);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
    update({ qualityTiers: arr });
  };

  // Info fields (global per character)
  const addField = () => update({ infoFields: [...character.infoFields, { id: uid(), name: 'New Field', visible: true }] });
  const renameField = (id, name) => update({ infoFields: character.infoFields.map(f => f.id === id ? { ...f, name } : f) });
  const updateField = (id, patch) => update({ infoFields: character.infoFields.map(f => f.id === id ? { ...f, ...patch } : f) });
  const confirmRemoveField = (id) => {
    update({
      infoFields: character.infoFields.filter(f => f.id !== id),
      items: character.items.map((it) => {
        const { [id]: _, ...rest } = it.fields || {};
        const active = (it.activeFieldIds || []).filter((x) => x !== id);
        return { ...it, fields: rest, activeFieldIds: active };
      }),
    });
    setPendingFieldDelete(null);
  };

  // Inventories
  const addInventory = () => update({ inventories: [...(character.inventories || []), { id: uid(), name: 'New Inventory' }] });
  const renameInventory = (id, name) => update({ inventories: character.inventories.map(inv => inv.id === id ? { ...inv, name } : inv) });
  const removeInventory = (id) => {
    if ((character.inventories || []).length <= 1) return;
    const remaining = character.inventories.filter(inv => inv.id !== id);
    const fallbackId = remaining[0].id;
    update({
      inventories: remaining,
      items: character.items.map(it => (it.inventoryId === id || !it.inventoryId) ? { ...it, inventoryId: fallbackId } : it)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0c] silver-border max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle className="font-display silver-text tracking-[0.18em]">GLOBAL SETTINGS</DialogTitle>
          <DialogDescription className="font-meta text-[9px] tracking-[0.3em] text-[#4a4d52]">CATEGORIES, QUALITY TIERS, FIELDS, INVENTORIES, IMPORT &amp; SHORTCUTS</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="bg-[#0d0d0f] silver-border w-full grid grid-cols-6">
            <TabsTrigger value="categories" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-categories">Categories</TabsTrigger>
            <TabsTrigger value="tiers" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-tiers">Quality Tiers</TabsTrigger>
            <TabsTrigger value="fields" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-fields">Info Fields</TabsTrigger>
            <TabsTrigger value="inventories" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-inventories">Inventories</TabsTrigger>
            <TabsTrigger value="import-list" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-import-list">Import List</TabsTrigger>
            <TabsTrigger value="shortcuts" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-shortcuts">Shortcuts</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="mt-4 space-y-5">
            {['mundane', 'magic'].map((sideKey) => {
              const group = character.categories.filter((c) => (c.side || 'mundane') === sideKey);
              return (
                <div key={sideKey} className="space-y-2" data-testid={`settings-cat-group-${sideKey}`}>
                  <div className="font-meta text-[10px] tracking-[0.3em] text-[#8A9196] border-b border-[#1f1f23] pb-1">{sideKey.toUpperCase()}</div>
                  {group.length === 0 && (
                    <div className="font-meta text-[10px] text-[#4a4d52] italic">No {sideKey} categories yet.</div>
                  )}
                  {group.map((c) => {
                    const gi = group.findIndex((x) => x.id === c.id);
                    return (
                      <div key={c.id} className="flex items-center gap-2 flex-wrap">
                        <div className="flex flex-col">
                          <button onClick={() => moveCategory(c.id, -1)} disabled={gi === 0} className="text-[#6a6c70] hover:text-[#C8CCD2] disabled:opacity-30" data-testid={`cat-up-${c.name}`}><ChevronUp size={12} /></button>
                          <button onClick={() => moveCategory(c.id, 1)} disabled={gi === group.length - 1} className="text-[#6a6c70] hover:text-[#C8CCD2] disabled:opacity-30" data-testid={`cat-down-${c.name}`}><ChevronDown size={12} /></button>
                        </div>
                        <LocalInput
                          value={c.name}
                          onChange={(val) => renameCategory(c.id, val)}
                          className="flex-1 min-w-[120px] bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                          data-testid={`category-name-input-${c.name}`}
                        />
                        <select
                          value={c.side || 'mundane'}
                          onChange={(e) => changeCategorySide(c.id, e.target.value)}
                          className="bg-[#0d0d0f] silver-border px-2 py-2 font-meta text-[10px] text-[#C8CCD2]"
                          data-testid={`category-side-${c.name}`}
                        >
                          <option value="mundane">MUNDANE</option>
                          <option value="magic">MAGIC</option>
                        </select>
                        <label className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] flex items-center gap-1 px-2">
                          <input
                            type="checkbox"
                            checked={!!c.isCurrency}
                            onChange={(e) => toggleCategoryCurrency(c.id, e.target.checked)}
                            data-testid={`category-iscurrency-${c.name}`}
                          />
                          CURRENCY
                        </label>
                        {c.isCurrency && (c.side || 'mundane') === 'magic' && (
                          <input
                            type="number"
                            value={c.currencyMax ?? 9999}
                            onChange={(e) => onUpdateCharacter({ ...character, categories: character.categories.map(x => x.id === c.id ? { ...x, currencyMax: Math.max(0, parseInt(e.target.value||'0',10)) } : x) })}
                            className="w-24 bg-[#0d0d0f] silver-border px-2 py-1 font-meta text-xs text-[#C8CCD2]"
                            title="Max"
                            data-testid={`category-currencymax-${c.name}`}
                          />
                        )}
                        <button
                          onClick={() => removeCategory(c.id)}
                          disabled={character.categories.length <= 1}
                          className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080] disabled:opacity-30"
                          data-testid={`category-remove-${c.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                  <button onClick={() => addCategory(sideKey)} className="w-full p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center justify-center gap-2" data-testid={`add-category-btn-${sideKey}`}>
                    <Plus size={12} /> ADD {sideKey.toUpperCase()} CATEGORY
                  </button>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="tiers" className="mt-4 space-y-3">
            {character.qualityTiers.map((t, idx) => (
              <div key={t.id} className="p-3 bg-[#0d0d0f] silver-border space-y-3" data-testid={`tier-card-${t.name}`}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveTier(t.id, -1)}
                      disabled={idx === 0}
                      className="text-[#6a6c70] hover:text-[#C8CCD2] disabled:opacity-30"
                      data-testid={`tier-up-${t.name}`}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      onClick={() => moveTier(t.id, 1)}
                      disabled={idx === character.qualityTiers.length - 1}
                      className="text-[#6a6c70] hover:text-[#C8CCD2] disabled:opacity-30"
                      data-testid={`tier-down-${t.name}`}
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                  <input
                    value={t.name}
                    onChange={(e) => updateTier(t.id, { name: e.target.value })}
                    className="flex-1 bg-[#050507] silver-border px-3 py-2 font-item text-sm focus:outline-none focus:border-[#6a6c70]"
                    style={{ color: t.color, textShadow: t.glow ? '0 0 6px rgba(255,255,255,0.8)' : undefined }}
                    data-testid={`tier-name-${t.name}`}
                  />
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) => updateTier(t.id, { color: e.target.value })}
                    className="w-12 h-9 bg-[#050507] silver-border cursor-pointer"
                    data-testid={`tier-color-${t.name}`}
                  />
                  <label className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] flex items-center gap-1 px-2 select-none">
                    <input
                      type="checkbox"
                      checked={!!t.glow}
                      onChange={(e) => updateTier(t.id, { glow: e.target.checked })}
                      data-testid={`tier-glow-${t.name}`}
                    />
                    GLOW
                  </label>
                  <button
                    onClick={() => removeTier(t.id)}
                    className="p-2 silver-border bg-[#050507] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                    data-testid={`tier-remove-${t.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#1f1f23]">
                  <div className="flex items-center gap-2">
                    <span className="font-meta text-[9px] tracking-[0.15em] text-[#6a6c70] w-16">GRAD TOP</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={t.gradOpacityTop ?? 10}
                      onChange={(e) => updateTier(t.id, { gradOpacityTop: parseInt(e.target.value, 10) })}
                      className="flex-1 accent-[#8A9196] bg-[#050507] h-1 rounded-lg appearance-none cursor-pointer"
                      data-testid={`tier-grad-top-${t.name}`}
                    />
                    <span className="font-meta text-[10px] text-[#8A9196] w-8 text-right">{t.gradOpacityTop ?? 10}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-meta text-[9px] tracking-[0.15em] text-[#6a6c70] w-16">GRAD BOT</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={t.gradOpacityBottom ?? 6}
                      onChange={(e) => updateTier(t.id, { gradOpacityBottom: parseInt(e.target.value, 10) })}
                      className="flex-1 accent-[#8A9196] bg-[#050507] h-1 rounded-lg appearance-none cursor-pointer"
                      data-testid={`tier-grad-bottom-${t.name}`}
                    />
                    <span className="font-meta text-[10px] text-[#8A9196] w-8 text-right">{t.gradOpacityBottom ?? 6}%</span>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addTier} className="w-full p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center justify-center gap-2" data-testid="add-tier-btn">
              <Plus size={12} /> ADD TIER
            </button>
          </TabsContent>

          <TabsContent value="fields" className="mt-4 space-y-2">
            <div className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">
              GLOBAL FIELD REGISTRY. ITEMS PICK FROM THIS LIST. DELETING HERE REMOVES FROM ALL ITEMS.
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2" data-testid="global-fields-list">
              {character.infoFields.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <input
                    value={f.name}
                    onChange={(e) => renameField(f.id, e.target.value)}
                    className="flex-1 bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                    data-testid={`field-name-${f.name}`}
                  />
                  <label className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] flex items-center gap-1.5 px-2 select-none shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.visible !== false}
                      onChange={(e) => updateField(f.id, { visible: e.target.checked })}
                      data-testid={`field-visible-${f.name}`}
                      className="cursor-pointer"
                    />
                    VISIBLE
                  </label>
                  <AlertDialog
                    open={pendingFieldDelete === f.id}
                    onOpenChange={(o) => setPendingFieldDelete(o ? f.id : null)}
                  >
                    <AlertDialogTrigger asChild>
                      <button
                        className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                        data-testid={`field-remove-${f.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#0a0a0c] silver-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-display silver-text">Delete “{f.name}” globally?</AlertDialogTitle>
                        <AlertDialogDescription className="font-item text-[#B0B5B9]">
                          This removes the field from the global registry AND from every item that uses it. This cannot be undone via the global list (use Ctrl+Z immediately if needed).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-[#0d0d0f] silver-border text-[#C8CCD2]">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-[#3a0a12] hover:bg-[#5a1018] text-[#E2E4E9]"
                          onClick={() => confirmRemoveField(f.id)}
                          data-testid={`confirm-field-delete-${f.name}`}
                        >
                          Delete globally
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
            <button onClick={addField} className="w-full p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center justify-center gap-2" data-testid="add-field-btn">
              <Plus size={12} /> ADD INFO FIELD
            </button>
          </TabsContent>

          <TabsContent value="inventories" className="mt-4 space-y-2">
            <div className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">
              SEPARATE INVENTORIES (SATCHELS/CONTAINERS) FOR THIS CHARACTER.
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2" data-testid="inventories-list">
              {(character.inventories || []).map((inv) => (
                <div key={inv.id} className="flex items-center gap-2">
                  <input
                    value={inv.name}
                    onChange={(e) => renameInventory(inv.id, e.target.value)}
                    className="flex-1 bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                    data-testid={`inventory-name-input-${inv.name}`}
                  />
                  <button
                    onClick={() => removeInventory(inv.id)}
                    disabled={(character.inventories || []).length <= 1}
                    className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080] disabled:opacity-30"
                    title={(character.inventories || []).length <= 1 ? "Cannot delete the last inventory" : "Delete inventory"}
                    data-testid={`inventory-remove-btn-${inv.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addInventory} className="w-full p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center justify-center gap-2" data-testid="add-inventory-btn">
              <Plus size={12} /> ADD INVENTORY
            </button>
          </TabsContent>

          <TabsContent value="import-list" className="mt-4 space-y-4">
            <div className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">
              PASTE A LIST OF ITEM NAMES (ONE PER LINE) AND SELECT THE CATEGORY TO IMPORT INTO.
            </div>
            
            <div className="space-y-1">
              <label className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] block">
                DESTINATION CATEGORY
              </label>
              <select
                value={selectedCatId}
                onChange={(e) => setSelectedCatId(e.target.value)}
                className="w-full bg-[#0d0d0f] silver-border px-3 py-2 font-meta text-xs text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                data-testid="import-list-category-select"
              >
                {importCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name.toUpperCase()} ({(c.side || 'mundane').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] block">
                ITEMS LIST
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Anvenue set&#10;Crow Collector Set&#10;Fusion Set..."
                rows={8}
                className="w-full bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm text-[#C8CCD2] placeholder:text-[#4a4d52] focus:outline-none focus:border-[#6a6c70] resize-none"
                data-testid="import-list-textarea"
              />
            </div>

            <button
              onClick={handleImportList}
              disabled={!selectedCatId || !importText.trim()}
              className="w-full p-2.5 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center justify-center gap-2 disabled:opacity-30 disabled:hover:bg-[#0d0d0f]"
              data-testid="import-list-submit-btn"
            >
              IMPORT ITEMS
            </button>
          </TabsContent>

          <TabsContent value="shortcuts" className="mt-4 space-y-4">
            <div className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">
              KEYBOARD SHORTCUTS FOR FASTER INVENTORY MANAGEMENT.
            </div>
            <div className="silver-border bg-[#0d0d0f] p-4 font-meta text-xs tracking-[0.15em] text-[#C8CCD2] space-y-3 leading-relaxed">
              <div className="flex justify-between border-b border-[#1f1f23] pb-2">
                <span>UNDO PREVIOUS CHANGE</span>
                <span className="text-[#8A9196]">CTRL + Z</span>
              </div>
              <div className="flex justify-between border-b border-[#1f1f23] pb-2">
                <span>REDO UNDONE CHANGE</span>
                <span className="text-[#8A9196]">CTRL + SHIFT + Z  /  CTRL + Y</span>
              </div>
              <div className="flex justify-between border-b border-[#1f1f23] pb-2">
                <span>COPY SELECTED ITEM</span>
                <span className="text-[#8A9196]">CTRL + C</span>
              </div>
              <div className="flex justify-between border-b border-[#1f1f23] pb-2">
                <span>CUT SELECTED ITEM</span>
                <span className="text-[#8A9196]">CTRL + X</span>
              </div>
              <div className="flex justify-between pb-1">
                <span>PASTE COPIED ITEM</span>
                <span className="text-[#8A9196]">CTRL + V</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
