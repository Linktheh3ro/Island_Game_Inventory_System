import { useState, useEffect } from 'react';
import { Settings, ChevronDown, X, FolderMinus, Plus, Trash2, RotateCcw } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator
} from '@/components/ui/context-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@/components/ui/tooltip';
import { getActiveFieldIds, itemCanExpand } from '@/lib/defaults';

// ── Quality Tier Art Deco Helpers ────────────────────────────────

/**
 * Returns 'expert' | 'master' | 'grandmaster' | null based on the tier's
 * position in the ordered qualityTiers array (last-3 = decorated).
 */
const getTierRank = (tier, qualityTiers) => {
  if (!tier || !Array.isArray(qualityTiers) || qualityTiers.length < 3) return null;
  const idx = qualityTiers.findIndex((t) => t.id === tier.id);
  const n = qualityTiers.length;
  if (idx === n - 1) return 'grandmaster';
  if (idx === n - 2) return 'master';
  if (idx === n - 3) return 'expert';
  return null;
};

// Border thickness (px) per rank; +1 for collections applied in JS
const TIER_BW = { expert: 1.5, master: 2, grandmaster: 2.5 };
// Corner SVG size (px)
const TIER_CS = { expert: 5, master: 12, grandmaster: 12 };

const percentToHex = (p) => {
  const val = Math.max(0, Math.min(255, Math.round((p / 100) * 255)));
  return val.toString(16).padStart(2, '0').toUpperCase();
};

const getFormattedFieldValue = (field, item, hasStack, stack) => {
  const raw = item.fields[field.id];
  if (raw === undefined || raw === null || raw === '') return null;

  const fieldName = field.name.toLowerCase();

  if (fieldName === 'value') {
    // Truncate currency value when not expanded (e.g. 1m, 1k, etc.)
    const match = String(raw).match(/^([0-9.]+)(.*)$/);
    if (!match) return String(raw);
    const num = parseFloat(match[1]);
    const suffix = match[2];
    if (isNaN(num)) return String(raw);
    const finalNum = (hasStack && stack > 1) ? (num * stack) : num;
    let formatted = '';
    if (finalNum >= 1000000) {
      formatted = (finalNum / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    } else if (finalNum >= 1000) {
      formatted = (finalNum / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    } else {
      formatted = finalNum.toString();
    }
    return `${formatted}${suffix}`;
  }

  const isValueOrStorage = fieldName === 'value' || fieldName.endsWith('storage');

  if (isValueOrStorage && hasStack && stack > 1) {
    const match = String(raw).match(/([0-9.]+)/);
    if (match) {
      const num = parseFloat(match[0]);
      if (!isNaN(num)) {
        const total = num * stack;
        const formattedTotal = Number.isInteger(total) ? total : total.toFixed(2).replace(/\.?0+$/, '');
        return `${raw} (${String(raw).replace(match[0], formattedTotal)})`;
      }
    }
  }
  return raw;
};

const formatFullValueAmount = (field, item, hasStack, stack) => {
  const raw = item.fields[field.id];
  if (raw === undefined || raw === null || raw === '') return '';

  const match = String(raw).match(/^([0-9.]+)(.*)$/);
  if (!match) return String(raw);

  const num = parseFloat(match[1]);
  const suffix = match[2];

  if (isNaN(num)) return String(raw);

  if (hasStack && stack > 1) {
    const total = num * stack;
    const formattedTotal = total.toLocaleString();
    const formattedSingle = num.toLocaleString();
    return `${formattedTotal}${suffix} (${formattedSingle}${suffix} each)`;
  }

  return `${num.toLocaleString()}${suffix}`;
};

/**
 * Single corner SVG — always drawn from top-left perspective.
 * Rotation/mirroring is handled by the parent div transform.
 */
const CornerSVG = ({ rank, color, size: S }) => {
  const viewBox = rank === 'expert' ? '0 0 10 10' : '0 0 24 24';
  return (
    <svg width={S} height={S} viewBox={viewBox} fill="none" overflow="visible" style={{ display: 'block', opacity: 0.6 }}>
      {/* Expert — simple accents (bracket only, similar to + new button) */}
      {rank === 'expert' && (
        <path d="M0,10 L0,0 L10,0" stroke={color} strokeWidth="0.9" />
      )}

      {/* Master — double corner lines + hollow corner square */}
      {rank === 'master' && (
        <>
          <rect x="2" y="2" width="5" height="5" stroke={color} strokeWidth="0.9" fill="none" />
          <line x1="7" y1="2" x2="24" y2="2" stroke={color} strokeWidth="0.9" />
          <line x1="2" y1="7" x2="2" y2="24" stroke={color} strokeWidth="0.9" />
          <line x1="7" y1="7" x2="20" y2="7" stroke={color} strokeWidth="0.9" />
          <line x1="7" y1="7" x2="7" y2="20" stroke={color} strokeWidth="0.9" />
        </>
      )}

      {/* Grandmaster — nested double lines + two diagonal hollow squares + diagonal brace (tapered long, medium, short) */}
      {rank === 'grandmaster' && (
        <>
          <rect x="2" y="2" width="5" height="5" stroke={color} strokeWidth="0.9" fill="none" />
          <rect x="7" y="7" width="5" height="5" stroke={color} strokeWidth="0.9" fill="none" />
          <line x1="7" y1="2" x2="24" y2="2" stroke={color} strokeWidth="0.9" />
          <line x1="2" y1="7" x2="2" y2="24" stroke={color} strokeWidth="0.9" />
          <line x1="12" y1="7" x2="18" y2="7" stroke={color} strokeWidth="0.9" />
          <line x1="7" y1="12" x2="7" y2="18" stroke={color} strokeWidth="0.9" />
          <line x1="18" y1="12" x2="12" y2="18" stroke={color} strokeWidth="0.9" />
        </>
      )}
    </svg>
  );
};

/** Renders top-left and bottom-right mirrored corners */
const TierDecorations = ({ rank, color, isCollection, hideBottomRight }) => {
  const rawSize = TIER_CS[rank];
  const size    = isCollection ? Math.round(rawSize * 1.3) : rawSize;
  const cs      = {
    position: 'absolute',
    width: `${size}px`,
    height: `${size}px`,
    pointerEvents: 'none',
    zIndex: 25
  };
  return (
    <>
      {/* Top-left */}
      <div style={{ ...cs, top: 0, left: 0 }}>
        <CornerSVG rank={rank} color={color} size={size} />
      </div>
      {/* Bottom-right — mirrored 180 degrees */}
      {!hideBottomRight && (
        <div style={{ ...cs, bottom: 0, right: 0, transform: 'rotate(180deg)' }}>
          <CornerSVG rank={rank} color={color} size={size} />
        </div>
      )}
    </>
  );
};

const TierOverlay = ({ rank, color, isCollection, isNested }) => {
  const outerCol = `${color}80`; // 50% opacity
  const innerCol = `${color}50`; // 31% opacity

  const outerStyle = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 20,
    borderTop: `1px solid ${outerCol}`,
    borderBottom: `1px solid ${outerCol}`,
    borderLeft: isNested ? 'none' : `1px solid ${outerCol}`,
    borderRight: isNested ? 'none' : `1px solid ${outerCol}`,
    ...(rank === 'grandmaster' ? {
      boxShadow: `inset 0 0 8px 0 ${color}14`,
    } : {}),
  };

  return (
    <div style={outerStyle}>
      {!isCollection ? (
        <div
          style={{
            position: 'absolute',
            top: '2px',
            bottom: '2px',
            left: isNested ? '0' : '2px',
            right: isNested ? '0' : '2px',
            borderTop: `0.5px solid ${innerCol}`,
            borderBottom: `0.5px solid ${innerCol}`,
            borderLeft: isNested ? 'none' : `0.5px solid ${innerCol}`,
            borderRight: isNested ? 'none' : `0.5px solid ${innerCol}`,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <>
          <div
            style={{
              position: 'absolute',
              top: '1.5px',
              bottom: '1.5px',
              left: isNested ? '0' : '1.5px',
              right: isNested ? '0' : '1.5px',
              borderTop: `0.5px solid ${innerCol}`,
              borderBottom: `0.5px solid ${innerCol}`,
              borderLeft: isNested ? 'none' : `0.5px solid ${innerCol}`,
              borderRight: isNested ? 'none' : `0.5px solid ${innerCol}`,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '3.5px',
              bottom: '3.5px',
              left: isNested ? '0' : '3.5px',
              right: isNested ? '0' : '3.5px',
              borderTop: `0.5px solid ${innerCol}`,
              borderBottom: `0.5px solid ${innerCol}`,
              borderLeft: isNested ? 'none' : `0.5px solid ${innerCol}`,
              borderRight: isNested ? 'none' : `0.5px solid ${innerCol}`,
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </div>
  );
};

const GrandmasterLattice = ({ color, itemId }) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ opacity: 0.12 }}>
    <defs>
      <pattern id={`gm-lattice-${itemId}`} width="14.14" height="14.14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="14.14" stroke={color} strokeWidth="1" />
        <line x1="0" y1="0" x2="14.14" y2="0" stroke={color} strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#gm-lattice-${itemId})`} />
  </svg>
);


export const ItemRow = ({
  item, character, expanded, onToggle, onUpdate, onDelete, onDuplicate, onOpenSettings,
  onDragStart, onDragEnd, onDropOnItem, onDropInsideCollection, onRemoveFromCollection,
  draggable, showCategoryLabel, listView, fieldColumns, castInfo, onCast, onSelect, onAddItemToCollection,
  expandedIds, toggleExpanded, canCast, isLast, selected, selectedIds, onItemClick,
  isArchive, onRestore, onDeletePermanently, archive
}) => {
  const tier = character.qualityTiers.find((t) => t.id === item.tierId);
  const category = character.categories.find((c) => c.id === item.categoryId);
  const stack = item.stack ?? 1;
  const hasStack = !!item.hasStack;
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const [dropEdge, setDropEdge] = useState(null); // 'top' | 'bottom' | 'inside' | null

  useEffect(() => {
    if (expanded) setHasBeenOpened(true);
  }, [expanded]);

  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDropEdge(null);
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => window.removeEventListener('dragend', handleGlobalDragEnd);
  }, []);

  const activeFieldIds = getActiveFieldIds(item, character);
  const activeFields = activeFieldIds
    .map((id) => character.infoFields.find((f) => f.id === id))
    .filter(Boolean);
  const qualityActive = (item.activeFieldIds || []).includes('__quality__') || !!item.tierId;

  const descField = character.infoFields.find((f) => f.name.toLowerCase() === 'description');
  const descVal = descField ? (item.fields[descField.id] || '') : '';
  const canExpand = itemCanExpand(item, character);

  const tierStyle = tier
    ? { color: tier.color, ...(tier.glow ? { textShadow: '0 0 6px rgba(255,255,255,0.9), 0 0 14px rgba(255,255,255,0.5)' } : {}) }
    : {};

  const tierRank = getTierRank(tier, character.qualityTiers);
  const outerCol = tier ? `${tier.color}80` : ''; // Outer line: 50% opacity
  const innerCol = tier ? `${tier.color}50` : ''; // Inner lines: 31% opacity

  const regularShadow = `inset 0 0 0 2px rgba(0,0,0,0.8), inset 0 0 0 2.5px ${innerCol}`;
  const collectionShadow = `inset 0 0 0 1.5px rgba(0,0,0,0.8), inset 0 0 0 2px ${innerCol}, inset 0 0 0 3.5px rgba(0,0,0,0.8), inset 0 0 0 4px ${innerCol}`;
  const borderShadow = item.isCollection ? collectionShadow : regularShadow;

  const tierWrapperStyle = tierRank
    ? {
        '--tier-color': tier.color,
        position: 'relative',
        boxShadow: tierRank === 'grandmaster'
          ? `0 0 6px 1px ${tier.color}55, 0 0 18px 2px ${tier.color}2A`
          : undefined
      }
    : null;



  const gradTop = tier?.gradOpacityTop ?? 0;
  const gradBottom = tier?.gradOpacityBottom ?? 0;
  const showGradient = tier && (gradTop > 0 || gradBottom > 0) && tierRank !== 'grandmaster';
  const showBorderB = !item.containerId || !isLast;
  const isContainedLast = !!(item.containerId && isLast);
  const showLattice = tierRank === 'grandmaster' && !item.containerId;

  const valueField = character.infoFields.find((f) => f.name.toLowerCase() === 'value');
  const valueLabel = valueField ? (getFormattedFieldValue(valueField, item, hasStack, stack) || 'indeterminate') : 'indeterminate';

  const adjustStack = (delta) => {
    const next = Math.max(1, (item.stack ?? 1) + delta);
    onUpdate({ ...item, stack: next });
  };

  const removeFieldFromItem = (fieldId) => {
    const next = activeFieldIds.filter((id) => id !== fieldId);
    const { [fieldId]: _, ...nextFields } = item.fields || {};
    onUpdate({ ...item, activeFieldIds: next, fields: nextFields });
  };

  const onDragStartLocal = (e) => {
    if (selected) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'items', ids: Array.from(selectedIds) }));
    } else {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'items', ids: [item.id] }));
    }
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('is-dragging');
    onDragStart?.(item);
  };

  const onDragEndLocal = (e) => {
    document.body.classList.remove('is-dragging');
    setDropEdge(null);
    onDragEnd?.(e);
  };
  
  const onDragOverItem = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    if (item.isCollection) {
      if (clientY < rect.height * 0.25) {
        setDropEdge('top');
      } else if (clientY > rect.height * 0.75) {
        setDropEdge('bottom');
      } else {
        setDropEdge('inside');
      }
    } else {
      const mid = rect.top + rect.height / 2;
      setDropEdge(e.clientY < mid ? 'top' : 'bottom');
    }
  };
  
  const onDragLeaveItem = () => setDropEdge(null);
  
  const onDropItem = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedData = e.dataTransfer.getData('text/plain');
    const currentDropEdge = dropEdge;
    setDropEdge(null);
    if (!draggedData) return;

    let draggedIds = [];
    try {
      const parsed = JSON.parse(draggedData);
      if (parsed && parsed.type === 'items') {
        draggedIds = parsed.ids;
      } else {
        draggedIds = [parsed];
      }
    } catch {
      draggedIds = [draggedData];
    }

    for (const draggedId of draggedIds) {
      if (draggedId && draggedId !== item.id) {
        if (currentDropEdge === 'inside') {
          onDropInsideCollection?.(draggedId, item.id);
        } else {
          onDropOnItem?.(draggedId, item.id, currentDropEdge || 'bottom');
        }
      }
    }
    setDropEdge(null);
  };

  if (listView) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-testid={`item-row-list-wrapper-${item.name}`}
            className={[
              item.isCollection ? 'mb-2 bg-[#09090b]/40' : '',
              !tierRank && item.isCollection ? 'border border-[#2d2d35]' : '',
            ].filter(Boolean).join(' ')}
            style={tierWrapperStyle || undefined}
          >
            {tierRank && (
              <TierDecorations rank={tierRank} color={tier.color} isCollection={item.isCollection} hideBottomRight={isContainedLast} />
            )}
            {tierRank && (
              <TierOverlay rank={tierRank} color={tier.color} isCollection={item.isCollection} isNested={!!item.containerId} />
            )}
            <div
              draggable={draggable}
              onDragStart={onDragStartLocal}
              onMouseDown={(e) => onItemClick?.(item, e)}
              onDragEnd={onDragEndLocal}
              onDragOver={onDragOverItem}
              onDragLeave={onDragLeaveItem}
              onDrop={onDropItem}
              className={`grid items-center gap-3 px-4 py-2 ${showBorderB ? 'border-b border-[#16161a]' : ''} row-hover font-item select-none relative ${canExpand ? 'cursor-pointer' : 'cursor-default'} ${expanded ? 'bg-[#0e0e11]' : ''} ${selected ? 'bg-[#12141c] shadow-[inset_3px_0_0_0_#8A9196]' : ''} ${dropEdge === 'inside' ? 'outline outline-1 outline-dashed outline-[#B8860B] bg-[#1a150e]' : ''}`}
              style={{ gridTemplateColumns: `24px minmax(0,2fr) ${fieldColumns.map(() => 'minmax(0,1fr)').join(' ')} 180px` }}
              data-testid={`item-row-list-${item.name}`}
            >
              {dropEdge === 'top' && <div className="absolute left-0 right-0 -top-px h-0.5 bg-[#C8CCD2]" />}
              {dropEdge === 'bottom' && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#C8CCD2]" />}
              
              {showLattice && (
                <GrandmasterLattice color={tier.color} itemId={item.id} />
              )}
              {showGradient && (
                <div
                  className="absolute inset-0 pointer-events-none z-0"
                  style={{
                    background: `linear-gradient(to bottom, ${tier.color}${percentToHex(gradTop)}, ${tier.color}${percentToHex(gradBottom)})`
                  }}
                />
              )}

              <div className="flex items-center justify-center relative z-10 shrink-0">
                {canExpand && (
                  <ChevronDown
                    size={14}
                    className={`text-[#4a4d52] transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                )}
              </div>

              <div className="min-w-0 flex items-center gap-2 relative z-10" style={{ opacity: castInfo && !castInfo.ok ? 0.4 : 1 }}>
                {stack > 1 && hasStack && <span className="font-meta text-[11px] text-[#8A9196]">{stack}x</span>}
                <span className="text-lg truncate" style={tierStyle}>{item.name}</span>
                {item.subtype && <span className="font-meta text-[10px] text-[#6a6c70] truncate">— {item.subtype}</span>}
              </div>

              {fieldColumns.map((f) => (
                <div key={f.id} className="font-meta text-xs text-[#B0B5B9] truncate relative z-10 text-center">
                  {getFormattedFieldValue(f, item, hasStack, stack) || <span className="text-[#4a4d52]">—</span>}
                </div>
              ))}

              <div className="flex items-center gap-2 justify-end relative z-10">
                {isArchive ? (
                  <>
                    <span className="font-meta text-[9px] tracking-[0.1em] text-[#4a4d52] italic select-none hidden sm:inline">drag to category to restore</span>
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onDeletePermanently?.(item.id); }}
                      className="p-1 hover:bg-[#2a0d10] silver-border bg-[#0d0d0f] text-[#8A9196] hover:text-[#c08080] h-[22px] w-[22px] flex items-center justify-center shrink-0"
                      title="Permanently Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    {castInfo && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onCast?.(item); }}
                        className={`px-3 py-1 silver-border font-meta text-[10px] tracking-[0.2em] ${castInfo.ok ? 'bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9]' : 'bg-[#2a0d10] text-[#c08080]'}`}
                        title={`Cost ${castInfo.cost} ${castInfo.cur.name}`}
                        data-testid={`cast-btn-${item.name}`}
                      >
                        CAST {castInfo.cost}
                      </button>
                    )}
                    {item.isDaily && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onUpdate({ ...item, isDailyUsed: !item.isDailyUsed }); }}
                        className="w-[54px] h-[22px] px-0 py-0 silver-border font-meta text-[10px] tracking-[0.2em] bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9] flex items-center justify-center gap-1"
                        title={item.isDailyUsed ? "Reset daily use" : "Use item / ability for the day"}
                        data-testid={`daily-use-btn-${item.name}`}
                      >
                        {item.isDailyUsed ? <RotateCcw size={10} /> : "USE"}
                      </button>
                    )}
                    {item.isLimited && (() => {
                      const maxVal = item.limitedMax ?? 1;
                      const leftVal = item.limitedUsesLeft ?? maxVal;
                      const isZero = leftVal <= 0;
                      return (
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isZero) {
                              onUpdate({ ...item, limitedUsesLeft: maxVal });
                            } else {
                              onUpdate({ ...item, limitedUsesLeft: leftVal - 1 });
                            }
                          }}
                          className="w-[54px] h-[22px] px-0 py-0 silver-border font-meta text-[10px] tracking-[0.1em] bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9] flex items-center justify-center gap-1"
                          title={isZero ? `Reset charges (max ${maxVal})` : `Use charge (${leftVal}/${maxVal} left)`}
                          data-testid={`limited-use-btn-${item.name}`}
                        >
                          {isZero ? <RotateCcw size={10} /> : `USE ${leftVal}`}
                        </button>
                      );
                    })()}
                    {item.containerId && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onRemoveFromCollection?.(item.id); }}
                        className="p-1 opacity-40 hover:opacity-100 text-[#8A9196]"
                        title="Extract from collection"
                        data-testid={`extract-btn-${item.name}`}
                      >
                        <FolderMinus size={12} />
                      </button>
                    )}
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onOpenSettings(item); }}
                      className="p-1 text-[#4a4d52] hover:text-[#C8CCD2]"
                      title="Item settings"
                      data-testid={`item-settings-btn-list-${item.name}`}
                    >
                      <Settings size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className={`dropdown-grid ${expanded ? 'dropdown-grid-expanded border-b border-[#16161a]' : ''}`}>
              <div className="overflow-hidden min-h-0">
                {(expanded || hasBeenOpened) && (
                  <ItemDropdown
                    item={item}
                    character={character}
                    stack={stack}
                    hasStack={hasStack}
                    activeFieldIds={activeFieldIds}
                    activeFields={activeFields}
                    adjustStack={adjustStack}
                    removeFieldFromItem={removeFieldFromItem}
                    onUpdate={onUpdate}
                    qualityActive={qualityActive}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onOpenSettings={onOpenSettings}
                    onCast={onCast}
                    onRemoveFromCollection={onRemoveFromCollection}
                    onAddItemToCollection={onAddItemToCollection}
                    expandedIds={expandedIds}
                    toggleExpanded={toggleExpanded}
                    canCast={canCast}
                    listView={listView}
                    fieldColumns={fieldColumns}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDropOnItem={onDropOnItem}
                    onDropInsideCollection={onDropInsideCollection}
                    tierRank={tierRank}
                    isArchive={isArchive}
                    archive={archive}
                    onRestore={onRestore}
                    onDeletePermanently={onDeletePermanently}
                  />
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ItemContextMenuContent item={item} onDuplicate={() => onDuplicate(item)} onDelete={() => onDelete(item)} onOpenSettings={() => onOpenSettings(item)} onRemoveFromCollection={onRemoveFromCollection} />
      </ContextMenu>
    );
  }

  // Standard-View (grid item styling)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-testid={`item-row-${item.name}`}
          className={[
            item.isCollection ? 'mb-2 bg-[#09090b]/40' : '',
            !tierRank && item.isCollection ? 'border border-[#2d2d35]' : '',
          ].filter(Boolean).join(' ')}
          style={tierWrapperStyle || undefined}
        >
          {tierRank && (
            <TierDecorations rank={tierRank} color={tier.color} isCollection={item.isCollection} hideBottomRight={isContainedLast} />
          )}
          {tierRank && (
            <TierOverlay rank={tierRank} color={tier.color} isCollection={item.isCollection} isNested={!!item.containerId} />
          )}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  draggable={draggable}
                  onDragStart={onDragStartLocal}
                  onMouseDown={(e) => onItemClick?.(item, e)}
                  onDragEnd={onDragEndLocal}
                  onDragOver={onDragOverItem}
                  onDragLeave={onDragLeaveItem}
                  onDrop={onDropItem}
                  className={`flex items-center gap-3 px-4 py-3 ${showBorderB ? 'border-b border-[#16161a]' : ''} row-hover select-none relative ${canExpand ? 'cursor-pointer' : 'cursor-default'} ${expanded ? 'bg-[#0e0e11]' : ''} ${selected ? 'bg-[#12141c] shadow-[inset_3px_0_0_0_#8A9196]' : ''} ${dropEdge === 'inside' ? 'outline outline-1 outline-dashed outline-[#B8860B] bg-[#1a150e]' : ''}`}
                >
                  {dropEdge === 'top' && <div className="absolute left-0 right-0 -top-px h-0.5 bg-[#C8CCD2]" />}
                  {dropEdge === 'bottom' && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#C8CCD2]" />}

                  {showLattice && (
                    <GrandmasterLattice color={tier.color} itemId={item.id} />
                  )}
                  {showGradient && (
                    <div
                      className="absolute inset-0 pointer-events-none z-0"
                      style={{
                        background: `linear-gradient(to bottom, ${tier.color}${percentToHex(gradTop)}, ${tier.color}${percentToHex(gradBottom)})`
                      }}
                    />
                  )}

                  <div className="flex items-center gap-1.5 relative z-10">
                    {canExpand ? (
                      <ChevronDown
                        size={14}
                        className={`text-[#4a4d52] shrink-0 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                    ) : (
                      <div className="w-[14px] h-[14px] shrink-0" />
                    )}
                    {hasStack && (
                      <span className="font-meta text-xs text-[#8A9196] tabular-nums flex items-center gap-1">
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); adjustStack(-1); }}
                          className="px-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#C8CCD2] leading-none text-[10px]"
                          title="-1"
                          data-testid={`inline-stack-minus-${item.name}`}
                        >−</button>
                        <span data-testid={`stack-badge-${item.name}`}>{stack}x</span>
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); adjustStack(1); }}
                          className="px-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#C8CCD2] leading-none text-[10px]"
                          title="+1"
                          data-testid={`inline-stack-plus-${item.name}`}
                        >+</button>
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 relative z-10" style={{ opacity: castInfo && !castInfo.ok ? 0.4 : 1 }}>
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

                  <div className="flex items-center gap-2 justify-end relative z-10">
                    {isArchive ? (
                      <>
                        <span className="font-meta text-[9px] tracking-[0.1em] text-[#4a4d52] italic select-none hidden sm:inline">drag to category to restore</span>
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onDeletePermanently?.(item.id); }}
                          className="p-1 hover:bg-[#2a0d10] silver-border bg-[#0d0d0f] text-[#8A9196] hover:text-[#c08080] h-[22px] w-[22px] flex items-center justify-center shrink-0"
                          title="Permanently Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        {castInfo && (
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onCast?.(item); }}
                            className={`px-3 py-1 silver-border font-meta text-[10px] tracking-[0.2em] ${castInfo.ok ? 'bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9]' : 'bg-[#2a0d10] text-[#c08080]'}`}
                            title={`Cost ${castInfo.cost} ${castInfo.cur.name}`}
                            data-testid={`cast-btn-${item.name}`}
                          >
                            CAST {castInfo.cost}
                          </button>
                        )}
                        {item.isDaily && (
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onUpdate({ ...item, isDailyUsed: !item.isDailyUsed }); }}
                            className="w-[54px] h-[22px] px-0 py-0 silver-border font-meta text-[10px] tracking-[0.2em] bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9] flex items-center justify-center gap-1"
                            title={item.isDailyUsed ? "Reset daily use" : "Use item / ability for the day"}
                            data-testid={`daily-use-btn-${item.name}`}
                          >
                            {item.isDailyUsed ? <RotateCcw size={10} /> : "USE"}
                          </button>
                        )}
                        {item.isLimited && (() => {
                          const maxVal = item.limitedMax ?? 1;
                          const leftVal = item.limitedUsesLeft ?? maxVal;
                          const isZero = leftVal <= 0;
                          return (
                            <button
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isZero) {
                                  onUpdate({ ...item, limitedUsesLeft: maxVal });
                                } else {
                                  onUpdate({ ...item, limitedUsesLeft: leftVal - 1 });
                                }
                              }}
                              className="w-[54px] h-[22px] px-0 py-0 silver-border font-meta text-[10px] tracking-[0.1em] bg-[#16161a] hover:bg-[#1f1f23] text-[#E2E4E9] flex items-center justify-center gap-1"
                              title={isZero ? `Reset charges (max ${maxVal})` : `Use charge (${leftVal}/${maxVal} left)`}
                              data-testid={`limited-use-btn-${item.name}`}
                            >
                              {isZero ? <RotateCcw size={10} /> : `USE ${leftVal}`}
                            </button>
                          );
                        })()}
                        {item.containerId && (
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onRemoveFromCollection?.(item.id); }}
                            className="p-1 opacity-40 hover:opacity-100 text-[#8A9196]"
                            title="Extract from collection"
                            data-testid={`extract-btn-${item.name}`}
                          >
                            <FolderMinus size={12} />
                          </button>
                        )}
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onOpenSettings(item); }}
                          className="p-1 text-[#4a4d52] hover:text-[#C8CCD2]"
                          title="Item settings"
                          data-testid={`item-settings-btn-${item.name}`}
                        >
                          <Settings size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-[#050507] silver-border font-meta text-[11px] tracking-[0.2em] text-[#C8CCD2]">
                {valueLabel}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className={`dropdown-grid ${expanded ? 'dropdown-grid-expanded border-b border-[#16161a]' : ''}`}>
            <div className="overflow-hidden min-h-0">
              {(expanded || hasBeenOpened) && (
                <ItemDropdown
                  item={item}
                  character={character}
                  stack={stack}
                  hasStack={hasStack}
                  activeFieldIds={activeFieldIds}
                  activeFields={activeFields}
                  adjustStack={adjustStack}
                  removeFieldFromItem={removeFieldFromItem}
                  onUpdate={onUpdate}
                  qualityActive={qualityActive}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onOpenSettings={onOpenSettings}
                  onCast={onCast}
                  onRemoveFromCollection={onRemoveFromCollection}
                  onAddItemToCollection={onAddItemToCollection}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                  canCast={canCast}
                  listView={listView}
                  fieldColumns={fieldColumns}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropOnItem={onDropOnItem}
                  onDropInsideCollection={onDropInsideCollection}
                  tierRank={tierRank}
                  isArchive={isArchive}
                  archive={archive}
                  onRestore={onRestore}
                  onDeletePermanently={onDeletePermanently}
                />
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ItemContextMenuContent item={item} onDuplicate={() => onDuplicate(item)} onDelete={() => onDelete(item)} onOpenSettings={() => onOpenSettings(item)} onRemoveFromCollection={onRemoveFromCollection} />
    </ContextMenu>
  );
};

const ItemDropdown = ({
  item, character, stack, hasStack, adjustStack, onUpdate,
  onDelete, onDuplicate, onOpenSettings, onCast, onRemoveFromCollection, onAddItemToCollection,
  expandedIds, toggleExpanded, canCast, listView, fieldColumns,
  onDragStart, onDragEnd, onDropOnItem, onDropInsideCollection, tierRank,
  activeFieldIds, activeFields, isArchive, archive, onRestore, onDeletePermanently
}) => {
  const tier = character.qualityTiers.find((t) => t.id === item.tierId);
  const descField = character.infoFields.find((f) => f.name.toLowerCase() === 'description');
  const descVal = descField ? (item.fields[descField.id] || '') : '';

  const abilitiesField = character.infoFields.find(f => {
    const lname = f.name.toLowerCase();
    return lname === 'abilities' || lname === 'enchantments' || lname === 'active enchantments / abilities';
  });
  const abilitiesVal = abilitiesField ? (item.fields[abilitiesField.id] || '') : '';

  const valueField = character.infoFields.find((f) => f.name.toLowerCase() === 'value');
  const valueVal = valueField ? (item.fields[valueField.id] || '') : '';

  return (
    <div className="slide-down px-12 py-4 bg-[#08080a] border-b border-[#16161a] relative" data-testid={`item-dropdown-${item.name}`}>
      {tierRank === 'grandmaster' && tier && (
        <GrandmasterLattice color={tier.color} itemId={item.id} />
      )}
      {/* Description (non-editable, italic, in quotes) */}
      {descVal && (
        <div className="font-item text-sm text-[#8a9196] italic mb-4 whitespace-pre-wrap select-text relative z-10">
          "{descVal}"
        </div>
      )}

      {/* Custom Abilities Box rendering */}
      {abilitiesVal && (
        <div className="mb-4 relative z-10 select-text">
          <div className="font-meta text-[10px] tracking-[0.2em] text-[#6a6c70] uppercase mb-2">
            ABILITIES
          </div>
          <div className="flex flex-wrap gap-2">
            {abilitiesVal.split(',').map(x => x.trim()).filter(Boolean).map((ab, idx) => (
              <div
                key={idx}
                className="px-3 py-1.5 border border-[#4a1215] bg-[#0d0506] text-[#c0393b] font-item text-xs flex items-center gap-1.5 rounded-sm shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
              >
                <span className="text-[#e23c3e] text-[10px] leading-none select-none">✦</span>
                <span className="leading-none tracking-wide">{ab}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Value rendering */}
      {valueVal && (
        <div className="mb-4 relative z-10 select-text">
          <div className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70] uppercase mb-1">
            VALUE
          </div>
          <div className="font-item text-sm text-[#C8CCD2]">
            {formatFullValueAmount(valueField, item, hasStack, stack)}
          </div>
        </div>
      )}

      {/* Invisible fields grid */}
      {(() => {
        if (!activeFields) return null;
        const invisibleFields = activeFields.filter(
          (f) => {
            const lname = f.name.toLowerCase();
            const isAbilities = lname === 'abilities' || lname === 'enchantments' || lname === 'active enchantments / abilities';
            const isValue = lname === 'value';
            return f.visible === false && lname !== 'description' && !isAbilities && !isValue && (item.fields?.[f.id] ?? '') !== '';
          }
        );
        if (invisibleFields.length === 0) return null;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4 relative z-10">
            {invisibleFields.map((f) => (
              <div key={f.id} className="silver-border bg-[#0d0d0f]/60 p-2 flex flex-col justify-center min-w-0" data-testid={`dropdown-field-${f.name}`}>
                <span className="font-meta text-[8px] tracking-[0.2em] text-[#6a6c70] uppercase truncate">
                  {f.name}
                </span>
                <span className="font-item text-xs text-[#C8CCD2] mt-1 truncate">
                  {getFormattedFieldValue(f, item, hasStack, stack) || '—'}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Stack controls (only if hasStack) */}
      {hasStack && (
        <div className="flex items-center gap-2 mb-4 flex-wrap relative z-10">
          <span className="font-meta text-[10px] tracking-[0.25em] text-[#6a6c70]">STACK</span>
          <input
            type="number"
            min="1"
            value={stack}
            onChange={(e) => adjustStack(parseInt(e.target.value) - stack)}
            className="w-16 bg-[#0a0a0c] silver-border px-2 py-1 font-meta text-xs text-[#C8CCD2] focus:outline-none focus:border-[#6a6c70] no-spin"
            data-testid={`stack-input-${item.name}`}
          />
          {[-10, -5, -1, 1, 5, 10].map((d) => (
            <button
              key={d}
              onClick={(e) => { e.stopPropagation(); adjustStack(d); }}
              className="px-2 py-1 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[10px] text-[#C8CCD2]"
              data-testid={`stack-${d > 0 ? 'plus' : 'minus'}-${Math.abs(d)}-${item.name}`}
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      )}

      {/* Contained Items Section (only if collection) */}
      {item.isCollection && (
        <div className="mt-4 -mx-12 -mb-4 relative" onClick={(e) => e.stopPropagation()}>
          {!isArchive && (
            <div className="flex justify-start mb-2 px-12">
              <button
                onClick={() => onAddItemToCollection?.(item.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-[9px] tracking-[0.15em] text-[#C8CCD2]"
                data-testid={`add-to-collection-btn-${item.name}`}
              >
                <Plus size={10} /> ADD ITEM TO COLLECTION
              </button>
            </div>
          )}
          {(() => {
            const itemsToFilter = isArchive ? (archive || []) : (character.items || []);
            const subItems = itemsToFilter.filter(it => it.containerId === item.id);
            if (subItems.length === 0) {
              return (
                <div className="font-meta text-[10px] text-[#4a4d52] italic py-1 px-12">
                  No items in this collection.
                </div>
              );
            }
            return (
              <div className="space-y-0 pt-2 pb-0">
                {subItems.map((sub, subIdx) => {
                  const subCastInfo = canCast?.(sub) || null;
                  return (
                    <ItemRow
                      key={sub.id}
                      item={sub}
                      character={character}
                      isLast={subIdx === subItems.length - 1}
                      expanded={expandedIds?.has(sub.id)}
                      onToggle={() => toggleExpanded?.(sub.id)}
                      onUpdate={onUpdate}
                      onSelect={() => {}}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onOpenSettings={onOpenSettings}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onDropOnItem={onDropOnItem}
                      onDropInsideCollection={onDropInsideCollection}
                      onRemoveFromCollection={onRemoveFromCollection}
                      onAddItemToCollection={onAddItemToCollection}
                      draggable={!isArchive}
                      showCategoryLabel={false}
                      listView={listView}
                      fieldColumns={fieldColumns}
                      castInfo={subCastInfo}
                      onCast={onCast}
                      expandedIds={expandedIds}
                      toggleExpanded={toggleExpanded}
                      canCast={canCast}
                      isArchive={isArchive}
                      archive={archive}
                      onRestore={onRestore}
                      onDeletePermanently={onDeletePermanently}
                    />
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const ItemContextMenuContent = ({ item, onDuplicate, onDelete, onOpenSettings, onRemoveFromCollection }) => (
  <ContextMenuContent className="bg-[#050507] silver-border" data-testid="item-context-menu">
    {item.containerId && (
      <>
        <ContextMenuItem onClick={() => onRemoveFromCollection?.(item.id)} className="font-meta text-xs tracking-[0.15em] text-[#C8CCD2] hover:!bg-[#16161a]" data-testid="ctx-extract">
          Extract from Collection
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-[#1f1f23]" />
      </>
    )}
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
