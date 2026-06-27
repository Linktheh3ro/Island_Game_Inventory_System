import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { uid } from '@/lib/defaults';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const SettingsDialog = ({ open, onOpenChange, character, onUpdateCharacter }) => {
  const [pendingFieldDelete, setPendingFieldDelete] = useState(null);
  if (!character) return null;

  const update = (patch) => onUpdateCharacter({ ...character, ...patch });

  // Categories
  const addCategory = (side) => update({ categories: [...character.categories, { id: uid(), name: 'New Category', side }] });
  const renameCategory = (id, name) => update({ categories: character.categories.map(c => c.id === id ? { ...c, name } : c) });
  const removeCategory = (id) => {
    if (character.categories.length <= 1) return;
    const fallback = character.categories.find(c => c.id !== id)?.id;
    update({
      categories: character.categories.filter(c => c.id !== id),
      items: character.items.map(it => it.categoryId === id ? { ...it, categoryId: fallback } : it),
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

  // Info fields (global per character)
  const addField = () => update({ infoFields: [...character.infoFields, { id: uid(), name: 'New Field' }] });
  const renameField = (id, name) => update({ infoFields: character.infoFields.map(f => f.id === id ? { ...f, name } : f) });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0c] silver-border max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle className="font-display silver-text tracking-[0.18em]">GLOBAL SETTINGS</DialogTitle>
          <DialogDescription className="font-meta text-[9px] tracking-[0.3em] text-[#4a4d52]">CATEGORIES, QUALITY TIERS &amp; INFO FIELDS</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="bg-[#0d0d0f] silver-border w-full grid grid-cols-3">
            <TabsTrigger value="categories" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-categories">Categories</TabsTrigger>
            <TabsTrigger value="tiers" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-tiers">Quality Tiers</TabsTrigger>
            <TabsTrigger value="fields" className="font-tab text-[11px] data-[state=active]:bg-[#16161a] data-[state=active]:text-[#E2E4E9]" data-testid="settings-tab-fields">Info Fields</TabsTrigger>
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
                        <input
                          value={c.name}
                          onChange={(e) => renameCategory(c.id, e.target.value)}
                          className="flex-1 min-w-[120px] bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                          data-testid={`category-name-input-${c.name}`}
                        />
                        <select
                          value={c.side || 'mundane'}
                          onChange={(e) => onUpdateCharacter({ ...character, categories: character.categories.map(x => x.id === c.id ? { ...x, side: e.target.value } : x) })}
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
                            onChange={(e) => onUpdateCharacter({ ...character, categories: character.categories.map(x => x.id === c.id ? { ...x, isCurrency: e.target.checked, currencyValue: x.currencyValue ?? 0, currencyMax: x.currencyMax ?? 9999 } : x) })}
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

          <TabsContent value="tiers" className="mt-4 space-y-2">
            {character.qualityTiers.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                <input
                  value={t.name}
                  onChange={(e) => updateTier(t.id, { name: e.target.value })}
                  className="bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm focus:outline-none focus:border-[#6a6c70]"
                  style={{ color: t.color, textShadow: t.glow ? '0 0 6px rgba(255,255,255,0.8)' : undefined }}
                  data-testid={`tier-name-${t.name}`}
                />
                <input
                  type="color"
                  value={t.color}
                  onChange={(e) => updateTier(t.id, { color: e.target.value })}
                  className="w-12 h-9 bg-[#0d0d0f] silver-border cursor-pointer"
                  data-testid={`tier-color-${t.name}`}
                />
                <label className="font-meta text-[10px] tracking-[0.2em] text-[#8A9196] flex items-center gap-1 px-2">
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
                  className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                  data-testid={`tier-remove-${t.name}`}
                >
                  <Trash2 size={12} />
                </button>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
