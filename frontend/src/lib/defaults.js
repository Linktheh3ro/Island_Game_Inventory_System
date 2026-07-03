export const SCHEMA_VERSION = 2;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const defaultTiers = () => ([
  { id: uid(), name: 'Novice',        color: '#5A5A5C', glow: false, gradOpacityTop: 10, gradOpacityBottom: 6 },
  { id: uid(), name: 'Intermediate',  color: '#5A6A24', glow: false, gradOpacityTop: 10, gradOpacityBottom: 6 },
  { id: uid(), name: 'Journeyman',    color: '#1F4E7A', glow: false, gradOpacityTop: 10, gradOpacityBottom: 6 },
  { id: uid(), name: 'Adept',         color: '#7B1C4D', glow: false, gradOpacityTop: 10, gradOpacityBottom: 6 },
  { id: uid(), name: 'Expert',        color: '#B8860B', glow: false, gradOpacityTop: 10, gradOpacityBottom: 6 },
  { id: uid(), name: 'Master',        color: '#7A1320', glow: false, gradOpacityTop: 10, gradOpacityBottom: 6 },
  { id: uid(), name: 'Grandmaster',   color: '#FFFFFF', glow: true,  gradOpacityTop: 10, gradOpacityBottom: 6 },
]);

export const defaultCategories = () => ([
  { id: uid(), name: 'Armour' },
  { id: uid(), name: 'Weapons' },
  { id: uid(), name: 'Ammo' },
  { id: uid(), name: 'Equipment' },
  { id: uid(), name: 'Valuables' },
  { id: uid(), name: 'Consumables' },
  { id: uid(), name: 'Documents' },
  { id: uid(), name: 'Misc' },
]);

export const defaultFields = () => ([
  { id: uid(), name: 'Description' },
  { id: uid(), name: 'Value' },
  { id: uid(), name: 'Weight' },
  { id: uid(), name: 'Abilities' },
]);

export const createCharacter = (name = 'New Character', parentId = null) => {
  const cats = defaultCategories();
  const defaultInvId = uid();
  return ({
    id: uid(),
    name,
    avatar: null,
    parentId,
    categories: cats.map(c => ({ ...c, side: 'mundane', isCurrency: false })).concat([
      { id: uid(), name: 'Gold Sovereign', side: 'mundane', isCurrency: true, currencyValue: 0, currencyMax: 9999 },
      { id: uid(), name: 'Sorcery',  side: 'magic', isCurrency: false },
      { id: uid(), name: 'Wizardry', side: 'magic', isCurrency: false },
      { id: uid(), name: 'MPE', side: 'magic', isCurrency: true, currencyValue: 0, currencyMax: 100 },
    ]),
    qualityTiers: defaultTiers(),
    infoFields: defaultFields(),
    inventories: [
      { id: defaultInvId, name: 'Main Inventory' }
    ],
    items: [],
  });
};

export const createFolder = (name = 'New Folder', parentId = null) => ({
  id: uid(),
  name,
  parentId,
});

export const createItem = (categoryId, name = 'Unnamed Item', side = 'mundane', isCollection = false) => ({
  id: uid(),
  name,
  subtype: isCollection ? 'Collection' : '',
  categoryId,
  side,
  tierId: null,
  hasStack: false,
  stack: 1,
  fields: {},
  activeFieldIds: [],
  createdAt: Date.now(),
  isCollection,
  containerId: null,
  isDaily: false,
  isDailyUsed: false,
});

export const initialState = () => {
  const c = createCharacter('Corvo');
  return {
    schemaVersion: SCHEMA_VERSION,
    characters: { [c.id]: c },
    folders: {},
    characterOrder: [c.id],
    activeCharacterId: c.id,
    activeInventoryId: c.inventories[0].id,
  };
};

// Backward-compat helpers (legacy items missing activeFieldIds)
export const getActiveFieldIds = (item, character) => {
  if (Array.isArray(item.activeFieldIds)) return item.activeFieldIds;
  // Legacy: derive from filled fields
  return character.infoFields
    .filter((f) => (item.fields?.[f.id] ?? '') !== '')
    .map((f) => f.id);
};

export const normalizeCharacter = (character) => {
  const categories = Array.isArray(character.categories) && character.categories.length
    ? character.categories.map((category) => ({ side: 'mundane', isCurrency: false, ...category }))
    : createCharacter(character.name || 'New Character', character.parentId ?? null).categories;
  const infoFields = Array.isArray(character.infoFields) && character.infoFields.length ? character.infoFields : defaultFields();
  const qualityTiers = (Array.isArray(character.qualityTiers) && character.qualityTiers.length ? character.qualityTiers : defaultTiers())
    .map(t => ({
      ...t,
      gradOpacityTop: t.gradOpacityTop ?? 10,
      gradOpacityBottom: t.gradOpacityBottom ?? 6,
    }));
  const fallbackCategory = categories.find((category) => !category.isCurrency)?.id || categories[0]?.id || null;

  const defaultInvId = uid();
  const inventories = Array.isArray(character.inventories) && character.inventories.length
    ? character.inventories
    : [{ id: defaultInvId, name: 'Main Inventory' }];
  const mainInvId = inventories[0].id;

  return {
    ...character,
    avatar: character.avatar ?? null,
    parentId: character.parentId ?? null,
    categories,
    infoFields,
    qualityTiers,
    inventories: inventories.map(inv => ({
      id: inv.id || uid(),
      name: inv.name || 'Inventory',
    })),
    items: (character.items || []).map((item) => ({
      subtype: item.isCollection ? 'Collection' : '',
      side: 'mundane',
      tierId: null,
      hasStack: false,
      stack: 1,
      fields: {},
      activeFieldIds: getActiveFieldIds(item, { infoFields }),
      createdAt: Date.now(),
      inventoryId: item.inventoryId || mainInvId,
      isCollection: false,
      containerId: null,
      isDaily: false,
      isDailyUsed: false,
      ...item,
      categoryId: item.categoryId || fallbackCategory,
    })),
  };
};

export const normalizeState = (state) => {
  const base = state && typeof state === 'object' ? state : initialState();
  const characters = Object.fromEntries(
    Object.values(base.characters || {}).filter((character) => character?.id).map((character) => [character.id, normalizeCharacter(character)])
  );
  const ids = Object.keys(characters);
  if (ids.length === 0) return initialState();

  const activeCharId = characters[base.activeCharacterId] ? base.activeCharacterId : ids[0];
  const activeChar = characters[activeCharId];
  let activeInventoryId = base.activeInventoryId;
  if (activeChar) {
    if (!activeInventoryId || !activeChar.inventories.find(inv => inv.id === activeInventoryId)) {
      activeInventoryId = activeChar.inventories[0]?.id || null;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    characters,
    folders: base.folders || {},
    characterOrder: (base.characterOrder || ids).filter((id) => characters[id]),
    activeCharacterId: activeCharId,
    activeInventoryId,
    archive: Array.isArray(base.archive) ? base.archive : [],
  };
};

export const itemCanExpand = (item, character) => {
  if (!item || !character) return false;
  if (item.isCollection) return true;
  if (item.hasStack) return true;

  const descField = character.infoFields.find((f) => f.name.toLowerCase() === 'description');
  const descVal = descField ? (item.fields?.[descField.id] || '') : '';
  if (descVal) return true;

  const activeFieldIds = getActiveFieldIds(item, character);
  const activeFields = activeFieldIds
    .map((id) => character.infoFields.find((f) => f.id === id))
    .filter(Boolean);
  const invisibleFields = activeFields.filter(
    (f) => f.visible === false && f.name.toLowerCase() !== 'description' && (item.fields?.[f.id] ?? '') !== ''
  );

  return invisibleFields.length > 0;
};

