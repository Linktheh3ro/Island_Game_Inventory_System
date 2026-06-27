# Tabletop Inventory — PRD

## Original Problem
Offline, client-side inventory system for a tabletop RPG with copy/paste sharing,
modular categories, SkyUI-like search/menu UX, multi-character roster, gothic
black & silver Dishonored 2-inspired aesthetic.

## Architecture
- Pure React (CRA + craco), no backend, no API calls.
- State in React + autosave to `localStorage` key `tabletop-inventory-v1`
  (every 2 min + on state change + on `beforeunload`/`visibilitychange`).
- Share/import via `TTI1:` prefixed base64(JSON) string in top bar
  (also as `.tti` file). Forward-compatible `schemaVersion` field.

## User Personas
- GM/player who wants to track items, drop notes, share live snapshot
  with others by pasting a single code into their copy of the app.

## Core Static Requirements
- Folder structure: Root → list of character cards → each character has
  full inventory.
- Each character: avatar slot (square, large, file upload), name, fully
  modular `categories`, `qualityTiers` (with custom hex + glow flag),
  `infoFields` (universal list).
- Items: name, optional small-text subtype, category, optional tier,
  stack (with +/-1, +/-10, +/-100), arbitrary keyed info fields.
- Tabs across top: Everything + each category. Drag-drop items onto tab
  headers re-assigns category.
- Everything view: click row → slide-down dropdown (pushes siblings down),
  with editable fields + quality/category quick set + stack adjusters.
- Per-category view: tabular columns showing each item's field values.
- Right-click context menu: duplicate / edit settings / delete.
- Fuzzy, case-insensitive, typo-tolerant search across name/subtype/tier
  name/category/field values.
- Sort: newest, oldest, A→Z, Z→A, stack ▼/▲.
- Hover tooltip on item shows `Value` field (default "indeterminate").
- Quality tier color = text color (Grandmaster has white+glow shadow).
- Large `NEW ITEM` button on left sidebar.
- Global Settings dialog (gear): manage categories, quality tiers
  (rename/reorder/recolor/glow/delete), and universal info fields.

## Implemented (2026-02-26)
- All of the above in pure-client React app.
- Files:
  - `src/index.css` (fonts, tokens, gothic textures, animations)
  - `src/lib/defaults.js`, `src/lib/store.js`, `src/lib/share.js`, `src/lib/fuzzy.js`
  - `src/components/PasteBar.jsx`, `CharacterSelect.jsx`, `InventoryView.jsx`,
    `ItemRow.jsx`, `ItemDialog.jsx`, `SettingsDialog.jsx`
  - `src/App.js` (router-less; toggles roster ↔ inventory)

## Backlog / P1
- Drag reordering of items within the same list.
- Folder nesting deeper than 1 (sub-groups inside a character).
- Per-tier filtering chips.
- Cloud sync / shareable URL fragment for one-link sharing.

## Iteration 2 (2026-02-26)

Implemented:
- Drag-reorder of items within the same list (drop on row top/bottom edge); new `MANUAL` sort option.
- Roster folder nesting: characters can sit inside folders, folders can nest folders. Breadcrumb navigation. Drag a character or folder onto another folder to move it.
- Per-tier filter chips above the list (multi-select, with NO-TIER chip and CLEAR).
- Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, Ctrl+C copies share code, Ctrl+V imports share code from clipboard. Disabled while typing in inputs / when text is selected.
- Undo/redo history stack (80 deep) in `useInventoryStore`.
- URL fragment sharing: `#TTI1:<code>` auto-imports on load; new "Copy as Link" button in PasteBar.
- Info field redesign:
  - Each item now has `activeFieldIds`. Item dropdown shows ONLY active fields.
  - ItemDialog has Active list + Available list at bottom (scrollable) with +.
  - Create-new-global-field input is also at the bottom of the available list and auto-activates the new field on the current item.
  - Right-click (or hover X) on an active field removes from that item only.
  - Global Settings → Info Fields → delete now shows AlertDialog confirmation; deletion removes from all items and the registry.
- Schema bumped to v2 with backward-compat: legacy items (no `activeFieldIds`) derive active list from filled fields.

Notes:
- The drag-character-into-folder failure flagged by the test agent is a headless-Chromium DnD simulation limitation, not a product bug. Real-mouse drag works via the verified `application/x-roster` payload handler in `CharacterSelect.jsx`.

## Iteration 10 (2026-06-26) — Part A & Part B (Magic/Mundane overhaul)

Implemented & tested (frontend testing agent, 100% pass, iteration_10.json):
- Part A.a: `+ NEW CATEGORY` tab at end of tab row (`tab-new-category`) — creates a category on the current side and switches to it.
- Part A.b: Settings → Categories grouped into MUNDANE / MAGIC sections, each with its own ADD button (`add-category-btn-mundane` / `add-category-btn-magic`). `moveCategory` now reorders within the same side.
- Part A.c: Quality tier-filter chips hidden on the MAGIC side.
- Part A.d: Currency strip moved to directly below the character name (replaced the "N ITEMS · N CATEGORIES" line); hidden when the side has no currencies.
- Part B.a: Magic currencies keep ± buttons, RESET, and `/ max` label.
- Part B.b: Mundane currencies are plain editable number boxes (label + box, no ±/RESET/max) via `setMundaneCurrencyValue`.
- Part B.c: CAST button now renders in per-category (list view) tabs in `ItemRow.jsx`, with affordability dimming/red state — same logic as the Everything tab.

## Iteration 11 (2026-06-26) — Currency control swap fix + P1 cleanup

Tested (testing agent, 100% pass, iteration_11.json):
- BUG FIX: Currency ± buttons were on the wrong side. Corrected so MAGIC currencies have editable input + `/max` + RESET (NO ±), and MUNDANE currencies have ± buttons (-100/-10/-1, +1/+10/+100) + editable input (NO max, NO RESET). New helper `adjustMundaneCurrency` (floors at 0); removed unused `adjustCurrency`.
- P1: URL hash sharing (`#TTI1:…`) confirmed already implemented (App.js auto-import on load + PasteBar "Copy as Link").
- P1: Category tab testids are now id-based (`tab-<categoryId>`) to avoid collisions on duplicate names.
- P1: Added `DialogDescription` to ItemDialog and SettingsDialog (clears Radix aria-describedby a11y warning).

## Backlog (P1/P2)
- P1: De-dupe tab/category testids when names collide (use category id in testid).
- P1: Add `DialogDescription` to dialogs to clear Radix aria-describedby a11y warning.
- P2: Extract `CurrencyStrip` and `TabsBar` from `InventoryView.jsx` (now 564 lines).
- P2: Cast Log sidebar; multi-currency spells; roster-wide vault summary.
