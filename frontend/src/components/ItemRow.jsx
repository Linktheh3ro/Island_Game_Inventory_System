import { useState } from 'react';
import { Settings, ChevronDown, X } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator
} from '@/components/ui/context-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@/components/ui/tooltip';
import { getActiveFieldIds } from '@/lib/defaults';

export const ItemRow = ({
  item, character, expanded, onToggle, onUpdate, onDelete, onDuplicate, onOpenSettings,
  onDragStart, onDragEnd, onDropOnItem, draggable, showCategoryLabel, listView, fieldColumns, castInfo, onCast, onSelect
}) => {
  const tier = character.qualityTiers.find((t) => t.id === item.tierId);
  const category = character.categories.find((c) => c.id === item.categoryId);
  const stack = item.stack ?? 1;
  const hasStack = !!item.hasStack;
  const [dropEdge, setDropEdge] = useState(null); // 'top' | 'bottom' | null
  const activeFieldIds = getActiveFieldIds(item, character);
  const activeFields = activeFieldIds
    .map((id) => character.infoFields.find((f) => f.id === id))
    .filter(Boolean);
  // Quality is optional per item: shown if explicitly active OR (legacy) tierId already set
  const qualityActive = (item.activeFieldIds || []).includes('__quality__') || !!item.tierId;

  const tierStyle = tier
    ? { color: tier.color, ...(tier.glow ? { textShadow: '0 0 6px rgba(255,255,255,0.9), 0 0 14px rgba(255,255,255,0.5)' } : {}) }
    : {};

  const valueField = character.infoFields.find((f) => f.name.toLowerCase() === 'value');
  const valueLabel = valueField ? (item.fields[valueField.id] || 'indeterminate') : 'indeterminate';

  const adjustStack = (delta) => {
    const next = Math.max(1, (item.stack ?? 1) + delta);
    onUpdate({ ...item, stack: next });
  };

  const removeFieldFromItem = (fieldId) => {
    const next = activeFieldIds.filter((id) => id !== fieldId);
    onUpdate({ ...item, activeFieldIds: next });
  };

  const onDragStartLocal = (e) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(item);
  };
  const onDragOverItem = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDropEdge(e.clientY < mid ? 'top' : 'bottom');
  };
  const onDragLeaveItem = () => setDropEdge(null);
  const onDropItem = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== item.id) {
      onDropOnItem?.(draggedId, item.id, dropEdge || 'bottom');
    }
    setDropEdge(null);
  };

  if (listView) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            draggable={draggable}
            onDragStart={onDragStartLocal}
            onMouseDown={onSelect}
            onDragEnd={onDragEnd}
            onDragOver={onDragOverItem}
            onDragLeave={onDragLeaveItem}
            onDrop={onDropItem}
            className={`grid items-center gap-3 px-4 py-2 border-b border-[#16161a] row-hover font-item relative ${dropEdge ? '' : ''}`}
            style={{ gridTemplateColumns: `minmax(0,2fr) ${fieldColumns.map(() => 'minmax(0,1fr)').join(' ')} auto` }}
            data-testid={`item-row-list-${item.name}`}
          >
            {dropEdge === 'top' && <div className="absolute left-0 right-0 -top-px h-0.5 bg-[#C8CCD2]" />}
            {dropEdge === 'bottom' && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#C8CCD2]" />}
            <div className="min-w-0 flex items-center gap-2" style={{ opacity: castInfo && !castInfo.ok ? 0.4 : 1 }}>
              {stack > 1 && hasStack && <span className="font-meta text-[11px] text-[#8A9196]">{stack}x</span>}
              <span className="text-lg truncate" style={tierStyle}>{item.name}</span>
              {item.subtype && <span className="font-meta text-[10px] text-[#6a6c70] truncate">— {item.subtype}</span>}
            </div>
            {fieldColumns.map((f) => (
              <div key={f.id} className="font-meta text-xs text-[#B0B5B9] truncate">
                {item.fields[f.id] || <span className="text-[#4a4d52]">—</span>}
              </div>
            ))}
            <div className="flex items-center gap-2 justify-end">
              {castInfo && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCast?.(); }}
                  className={`px-3 py-1 silver-border font-meta text-[10px] tracking-[0.2em] ${castInfo.ok ? 'bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9]' : 'bg-[#2a0d10] text-[#c08080]'}`}
                  title={`Cost ${castInfo.cost} ${castInfo.cur.name}`}
                  data-testid={`cast-btn-${item.name}`}
                >
                  CAST {castInfo.cost}
                </button>
              )}
              <button onClick={() => onOpenSettings(item)} className="p-1 text-[#4a4d52] hover:text-[#C8CCD2]" title="Item settings" data-testid={`item-settings-btn-list-${item.name}`}>
                <Settings size={12} />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ItemContextMenuContent onDuplicate={() => onDuplicate(item)} onDelete={() => onDelete(item)} onOpenSettings={() => onOpenSettings(item)} />
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div data-testid={`item-row-${item.name}`}>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  draggable={draggable}
                  onDragStart={onDragStartLocal}
                  onMouseDown={onSelect}
            onDragEnd={onDragEnd}
                  onDragOver={onDragOverItem}
                  onDragLeave={onDragLeaveItem}
                  onDrop={onDropItem}
                  onClick={onToggle}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-[#16161a] row-hover cursor-pointer select-none relative ${expanded ? 'bg-[#0e0e11]' : ''}`}
                >
                  {dropEdge === 'top' && <div className="absolute left-0 right-0 -top-px h-0.5 bg-[#C8CCD2]" />}
                  {dropEdge === 'bottom' && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#C8CCD2]" />}
                  <ChevronDown
                    size={14}
                    className={`text-[#4a4d52] shrink-0 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                  {hasStack && (
                    <span className="font-meta text-xs text-[#8A9196] tabular-nums flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); adjustStack(-1); }}
                        className="px-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#C8CCD2] leading-none text-[10px]"
                        title="-1"
                        data-testid={`inline-stack-minus-${item.name}`}
                      >−</button>
                      <span data-testid={`stack-badge-${item.name}`}>{stack}x</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); adjustStack(1); }}
                        className="px-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#C8CCD2] leading-none text-[10px]"
                        title="+1"
                        data-testid={`inline-stack-plus-${item.name}`}
                      >+</button>
                    </span>
                  )}
                  <div className="flex-1 min-w-0" style={{ opacity: castInfo && !castInfo.ok ? 0.4 : 1 }}>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`font-item text-xl ${tier?.glow ? 'glow-grandmaster' : ''}`}
                        style={tierStyle}
                        data-testid={`item-name-${item.name}`}
                      >
                        {item.name}
                      </span>
                      {showCategoryLabel && category && (
                        <span className="font-meta text-[10px] text-[#4a4d52] tracking-[0.2em]">
                          [{category.name.toUpperCase()}]
                        </span>
                      )}
                    </div>
                    {item.subtype && (
                      <div className="font-meta text-[11px] text-[#6a6c70] mt-0.5">{item.subtype}</div>
                    )}
                  </div>
                  {castInfo && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCast?.(); }}
                      className={`px-3 py-1 silver-border font-meta text-[10px] tracking-[0.2em] ${castInfo.ok ? 'bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9]' : 'bg-[#2a0d10] text-[#c08080]'}`}
                      title={`Cost ${castInfo.cost} ${castInfo.cur.name}`}
                      data-testid={`cast-btn-${item.name}`}
                    >
                      CAST {castInfo.cost}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenSettings(item); }}
                    className="p-1 opacity-40 hover:opacity-100 text-[#8A9196]"
                    title="Item settings"
                    data-testid={`item-settings-btn-${item.name}`}
                  >
                    <Settings size={12} />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-[#050507] silver-border font-meta text-[11px] tracking-[0.2em] text-[#C8CCD2]">
                {valueLabel}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {expanded && (
            <div className="slide-down px-12 py-4 bg-[#08080a] border-b border-[#16161a]" data-testid={`item-dropdown-${item.name}`}>
              {/* Stack controls (only if hasStack) */}
              {hasStack && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">STACK</span>
                  <input type="number" min="1" value={stack} onClick={(e) => e.stopPropagation()} onChange={(e) => onUpdate({ ...item, stack: Math.max(1, parseInt(e.target.value||'1',10)) })} className="w-20 bg-[#0a0a0c] silver-border px-2 py-1 font-meta text-sm text-[#C8CCD2] tabular-nums no-spin" data-testid={`stack-input-${item.name}`} />
                  {[-100, -10, -1, 1, 10, 100].map((d) => (
                    <button key={d} onClick={(e) => { e.stopPropagation(); adjustStack(d); }} className="px-2 py-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[10px] text-[#C8CCD2]" data-testid={`stack-${d > 0 ? 'plus' : 'minus'}-${Math.abs(d)}-${item.name}`}>{d > 0 ? `+${d}` : d}</button>
                  ))}
                </div>
              )}

              {/* Derived Stack Value (only if value field active+parseable AND stack > 1) */}
              {(() => {
                if (stack <= 1 || !hasStack) return null;
                const valField = character.infoFields.find((f) => f.name.toLowerCase() === 'value');
                if (!valField) return null;
                if (!activeFieldIds.includes(valField.id)) return null;
                const raw = item.fields[valField.id];
                if (!raw) return null;
                const m = String(raw).match(/^\s*([\d.,]+)\s*(.*)$/);
                if (!m) return null;
                const num = parseFloat(m[1].replace(/,/g, ''));
                if (!Number.isFinite(num)) return null;
                const total = num * stack;
                const suffix = m[2] || '';
                const fmt = Number.isInteger(total) ? total.toString() : total.toFixed(2);
                return (
                  <div className="flex items-center gap-3 mb-3 px-2 py-1.5 silver-border bg-[#0a0a0c]" data-testid={`stack-value-${item.name}`}>
                    <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70] w-24 shrink-0">STACK VALUE</span>
                    <span className="font-item text-sm text-[#C8CCD2] tabular-nums">
                      {fmt}{suffix && ` ${suffix}`}
                      <span className="font-meta text-[10px] text-[#4a4d52] ml-2">({raw} × {stack})</span>
                    </span>
                  </div>
                );
              })()}

              {/* Active info fields ONLY */}
              {activeFields.length === 0 ? (
                <div className="font-meta text-[11px] text-[#4a4d52] italic">
                  No info fields on this item. Click the gear icon to add some.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {activeFields.map((field) => {
                    const isDesc = field.name.toLowerCase() === 'description';
                    return (
                    <ContextMenu key={field.id}>
                      <ContextMenuTrigger asChild>
                        <div className={`flex items-start gap-3 group/field ${isDesc ? 'sm:col-span-2' : ''}`} onClick={(e) => e.stopPropagation()}>
                          <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70] w-24 shrink-0 uppercase pt-1.5" data-testid={`field-label-${field.name}-${item.name}`}>
                            {field.name}
                          </span>
                          {isDesc ? (
                            <textarea
                              rows={1}
                              value={item.fields[field.id] || ''}
                              onChange={(e) => { e.target.style.height='auto'; e.target.style.height = e.target.scrollHeight+'px'; onUpdate({ ...item, fields: { ...item.fields, [field.id]: e.target.value } }); }}
                              ref={(el) => { if (el) { el.style.height='auto'; el.style.height = el.scrollHeight+'px'; } }}
                              className="flex-1 bg-[#0a0a0c] silver-border px-2 py-1 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70] resize-none overflow-hidden"
                              data-testid={`item-field-input-${field.name}-${item.name}`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={item.fields[field.id] || ''}
                              onChange={(e) => onUpdate({ ...item, fields: { ...item.fields, [field.id]: e.target.value } })}
                              className="flex-1 bg-[#0a0a0c] silver-border px-2 py-1 font-item text-sm text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                              data-testid={`item-field-input-${field.name}-${item.name}`}
                            />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFieldFromItem(field.id); }}
                            className="opacity-0 group-hover/field:opacity-100 text-[#6a6c70] hover:text-[#c08080] mt-1.5"
                            title="Remove from item"
                            data-testid={`remove-field-btn-${field.name}-${item.name}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="bg-[#050507] silver-border">
                        <ContextMenuItem
                          onClick={() => removeFieldFromItem(field.id)}
                          className="font-meta text-xs tracking-[0.15em] text-[#c08080] hover:!bg-[#2a0d10]"
                          data-testid={`ctx-remove-field-${field.name}`}
                        >
                          Remove “{field.name}” from this item
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );})}
                </div>
              )}

              {/* Tier & category quick set */}
              <div className="mt-4 flex flex-wrap gap-4" onClick={(e) => e.stopPropagation()}>
                {qualityActive && (
                  <div className="flex items-center gap-2">
                    <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">QUALITY</span>
                    <select
                      value={item.tierId || ''}
                      onChange={(e) => onUpdate({ ...item, tierId: e.target.value || null })}
                      className="bg-[#0a0a0c] silver-border px-2 py-1 font-meta text-xs text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                      data-testid={`item-tier-select-${item.name}`}
                    >
                      <option value="">—</option>
                      {character.qualityTiers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const next = (item.activeFieldIds || []).filter((x) => x !== '__quality__');
                        onUpdate({ ...item, activeFieldIds: next, tierId: null });
                      }}
                      className="text-[#6a6c70] hover:text-[#c08080]"
                      title="Remove quality from this item"
                      data-testid={`remove-quality-${item.name}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">CATEGORY</span>
                  <select
                    value={item.categoryId}
                    onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
                    className="bg-[#0a0a0c] silver-border px-2 py-1 font-meta text-xs text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70]"
                    data-testid={`item-category-select-${item.name}`}
                  >
                    {character.categories.filter((c) => (c.side || 'mundane') === (item.side || 'mundane') && !c.isCurrency).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ItemContextMenuContent onDuplicate={() => onDuplicate(item)} onDelete={() => onDelete(item)} onOpenSettings={() => onOpenSettings(item)} />
    </ContextMenu>
  );
};

const ItemContextMenuContent = ({ onDuplicate, onDelete, onOpenSettings }) => (
  <ContextMenuContent className="bg-[#050507] silver-border" data-testid="item-context-menu">
    <ContextMenuItem onClick={onDuplicate} className="font-meta text-xs tracking-[0.15em] text-[#C8CCD2] hover:!bg-[#16161a]" data-testid="ctx-duplicate">
      Duplicate
    </ContextMenuItem>
    <ContextMenuItem onClick={onOpenSettings} className="font-meta text-xs tracking-[0.15em] text-[#C8CCD2] hover:!bg-[#16161a]" data-testid="ctx-edit">
      Edit settings…
    </ContextMenuItem>
    <ContextMenuSeparator className="bg-[#1f1f23]" />
    <ContextMenuItem onClick={onDelete} className="font-meta text-xs tracking-[0.15em] text-[#c08080] hover:!bg-[#2a0d10]" data-testid="ctx-delete">
      Delete
    </ContextMenuItem>
  </ContextMenuContent>
);
