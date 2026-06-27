import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { uid, getActiveFieldIds } from '@/lib/defaults';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';

export const ItemDialog = ({ open, onOpenChange, item, character, onSave, onUpdateCharacter }) => {
  const [draft, setDraft] = useState(item);
  const [newFieldName, setNewFieldName] = useState('');

  useEffect(() => { setDraft(item); setNewFieldName(''); }, [item, open]);

  if (!draft) return null;

  // Auto-save wrapper: every mutation propagates to parent immediately
  const apply = (next) => {
    setDraft(next);
    onSave(next);
  };

  const setField = (k, v) => apply({ ...draft, [k]: v });
  const setInfo = (id, v) => apply({ ...draft, fields: { ...draft.fields, [id]: v } });

  const activeIds = getActiveFieldIds(draft, character);
  const activeFields = activeIds.map((id) => character.infoFields.find((f) => f.id === id)).filter(Boolean);
  const availableFields = character.infoFields.filter((f) => !activeIds.includes(f.id));
  const qualityActive = (draft.activeFieldIds || []).includes('__quality__') || !!draft.tierId;

  const addQuality = () => apply({ ...draft, activeFieldIds: [...(draft.activeFieldIds || []), '__quality__'] });
  const removeQuality = () => apply({
    ...draft,
    activeFieldIds: (draft.activeFieldIds || []).filter((x) => x !== '__quality__'),
    tierId: null,
  });

  const addFieldToItem = (fieldId) => apply({ ...draft, activeFieldIds: [...activeIds, fieldId] });
  const removeFieldFromItem = (fieldId) => apply({ ...draft, activeFieldIds: activeIds.filter((id) => id !== fieldId) });

  const createGlobalField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    const f = { id: uid(), name };
    const newDraft = { ...draft, activeFieldIds: [...activeIds, f.id] };
    // Single combined parent update: add to global registry AND update this item
    onUpdateCharacter?.({
      ...character,
      infoFields: [...character.infoFields, f],
      items: character.items.map((it) => it.id === draft.id ? newDraft : it),
    });
    setDraft(newDraft);
    setNewFieldName('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0c] silver-border max-w-xl max-h-[88vh] overflow-y-auto" data-testid="item-dialog">
        <DialogHeader>
          <DialogTitle className="font-display silver-text tracking-[0.18em]">ITEM DETAILS</DialogTitle>
          <DialogDescription className="font-meta text-[9px] tracking-[0.3em] text-[#4a4d52]">CHANGES SAVE AUTOMATICALLY</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Labeled label="Name">
            <input
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
              className="w-full bg-[#0d0d0f] silver-border px-3 py-2 font-item text-lg text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
              data-testid="item-dialog-name"
            />
          </Labeled>

          <Labeled label="Subtype (small text under name, e.g. Sword)">
            <input
              value={draft.subtype || ''}
              onChange={(e) => setField('subtype', e.target.value)}
              className="w-full bg-[#0d0d0f] silver-border px-3 py-2 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
              data-testid="item-dialog-subtype"
            />
          </Labeled>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Category">
              <select
                value={draft.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                className="w-full bg-[#0d0d0f] silver-border px-3 py-2 font-meta text-xs text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                data-testid="item-dialog-category"
              >
                {character.categories.filter((c) => (c.side || 'mundane') === (draft.side || 'mundane') && !c.isCurrency).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Labeled>
            {qualityActive ? (
              <Labeled label="Quality Tier">
                <div className="flex items-center gap-2">
                  <select
                    value={draft.tierId || ''}
                    onChange={(e) => setField('tierId', e.target.value || null)}
                    className="flex-1 bg-[#0d0d0f] silver-border px-3 py-2 font-meta text-xs text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                    data-testid="item-dialog-tier"
                  >
                    <option value="">—</option>
                    {character.qualityTiers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={removeQuality}
                    className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                    title="Remove quality from this item"
                    data-testid="item-dialog-remove-quality"
                  >
                    <X size={12} />
                  </button>
                </div>
              </Labeled>
            ) : (
              <Labeled label="Quality Tier">
                <button
                  onClick={addQuality}
                  className="w-full p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[10px] tracking-[0.2em] text-[#8A9196] flex items-center justify-center gap-1"
                  data-testid="item-dialog-add-quality"
                >
                  <Plus size={12} /> ADD QUALITY TIER
                </button>
              </Labeled>
            )}
          </div>

          {draft.hasStack ? (
            <Labeled label="Stack">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={draft.stack}
                  onChange={(e) => setField('stack', Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-32 bg-[#0d0d0f] silver-border px-3 py-2 font-meta text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                  data-testid="item-dialog-stack"
                />
                <button
                  onClick={() => apply({ ...draft, hasStack: false, stack: 1 })}
                  className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                  title="Remove stack"
                  data-testid="item-dialog-remove-stack"
                ><X size={12} /></button>
              </div>
            </Labeled>
          ) : (
            <Labeled label="Stack">
              <button
                onClick={() => apply({ ...draft, hasStack: true, stack: 2 })}
                className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[10px] tracking-[0.2em] text-[#8A9196] flex items-center gap-1"
                data-testid="item-dialog-make-stack"
              ><Plus size={12} /> MAKE STACK</button>
            </Labeled>
          )}

          <div className="silver-divider my-1" />

          <div className="font-meta text-[10px] tracking-[0.3em] text-[#6a6c70]">ACTIVE INFO FIELDS</div>
          {activeFields.length === 0 && (
            <div className="font-meta text-[11px] text-[#4a4d52] italic">None yet — add from the list below.</div>
          )}
          <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
            {activeFields.map((f) => (
              <div key={f.id} className="grid grid-cols-[120px_1fr_auto] gap-2 items-center">
                <span className="font-meta text-[10px] uppercase tracking-[0.2em] text-[#8A9196]">{f.name}</span>
                <input
                  value={draft.fields[f.id] || ''}
                  onChange={(e) => setInfo(f.id, e.target.value)}
                  className="bg-[#0d0d0f] silver-border px-3 py-1.5 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                  data-testid={`item-dialog-field-${f.name}`}
                />
                <button
                  onClick={() => removeFieldFromItem(f.id)}
                  className="p-1.5 silver-border bg-[#0d0d0f] hover:bg-[#2a0d10] text-[#8A9196] hover:text-[#c08080]"
                  title="Remove from item"
                  data-testid={`item-dialog-remove-field-${f.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="silver-divider my-1" />

          <div className="font-meta text-[10px] tracking-[0.3em] text-[#6a6c70]">
            AVAILABLE FIELDS &middot; CLICK + TO ADD TO THIS ITEM
          </div>
          <div className="silver-border bg-[#08080a] max-h-48 overflow-y-auto" data-testid="available-fields-list">
            {availableFields.length === 0 && (
              <div className="px-3 py-3 font-meta text-[11px] text-[#4a4d52]">All global fields already on this item.</div>
            )}
            {availableFields.map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-[#16161a] last:border-b-0">
                <span className="flex-1 font-item text-sm text-[#C8CCD2]">{f.name}</span>
                <button
                  onClick={() => addFieldToItem(f.id)}
                  className="p-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#C8CCD2]"
                  title="Add to item"
                  data-testid={`add-field-to-item-${f.name}`}
                >
                  <Plus size={12} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0c] border-t border-[#1f1f23]">
              <input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createGlobalField(); } }}
                placeholder="Create new global field…"
                className="flex-1 bg-[#0d0d0f] silver-border px-2 py-1 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70] placeholder:text-[#4a4d52]"
                data-testid="new-global-field-input"
              />
              <button
                onClick={createGlobalField}
                disabled={!newFieldName.trim()}
                className="px-2 py-1 silver-border bg-[#16161a] hover:bg-[#1f1f23] font-meta text-[10px] tracking-[0.2em] text-[#C8CCD2] disabled:opacity-40 flex items-center gap-1"
                data-testid="new-global-field-btn"
              >
                <Plus size={12} /> CREATE
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 silver-border bg-[#16161a] hover:bg-[#1f1f23] font-meta text-xs tracking-[0.2em] text-[#E2E4E9]"
            data-testid="item-dialog-close"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Labeled = ({ label, children }) => (
  <div>
    <div className="font-meta text-[10px] tracking-[0.3em] text-[#6a6c70] mb-1">{label.toUpperCase()}</div>
    {children}
  </div>
);
