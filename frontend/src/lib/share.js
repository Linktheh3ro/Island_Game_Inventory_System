import { SCHEMA_VERSION, normalizeState, normalizeCharacter } from './defaults';
import LZString from 'lz-string';

const PREFIX_V2 = 'TTI2:';
const PREFIX_V1 = 'TTI1:';

const b64decode = (str) => {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export const encodeShare = (state) => {
  const activeCharId = state.activeCharacterId;
  const character = state.characters?.[activeCharId];
  if (!character) return '';

  const payload = {
    type: "single-character",
    schemaVersion: state.schemaVersion ?? SCHEMA_VERSION,
    exportedAt: Date.now(),
    character: {
      name: character.name,
      avatar: character.avatar,
      inventories: character.inventories || [],
      items: character.items || [],
      categories: character.categories || [],
      qualityTiers: character.qualityTiers || [],
      infoFields: character.infoFields || []
    }
  };
  const json = JSON.stringify(payload);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return PREFIX_V2 + compressed;
};

// Returns { ok, state, error }
export const decodeShare = (raw) => {
  if (!raw) return { ok: false, error: 'Empty input' };

  let cleanRaw = raw.replace(/^\ufeff/, '').trim();
  if ((cleanRaw.startsWith('"') && cleanRaw.endsWith('"')) ||
      (cleanRaw.startsWith("'") && cleanRaw.endsWith("'")) ||
      (cleanRaw.startsWith('`') && cleanRaw.endsWith('`'))) {
    cleanRaw = cleanRaw.slice(1, -1).trim();
  }

  const trimmed = cleanRaw;
  let body = trimmed;

  try {
    // Check if it's the new TTI2 compressed format
    if (trimmed.startsWith(PREFIX_V2)) {
      body = trimmed.slice(PREFIX_V2.length);
      const decompressed = LZString.decompressFromEncodedURIComponent(body);
      if (!decompressed) {
        return { ok: false, error: 'Failed to decompress share code' };
      }
      const parsed = JSON.parse(decompressed);
      return { ok: true, state: migrate(parsed) };
    }

    // Check if it's the old TTI1 format
    if (trimmed.startsWith(PREFIX_V1)) {
      body = trimmed.slice(PREFIX_V1.length);
      const json = b64decode(body);
      const parsed = JSON.parse(json);
      return { ok: true, state: migrate(parsed) };
    }

    // Allow raw JSON fallback
    if (body.startsWith('{')) {
      const parsed = JSON.parse(body);
      return { ok: true, state: migrate(parsed) };
    }

    // Fallback base64 or compression without prefix
    try {
      const json = b64decode(body);
      const parsed = JSON.parse(json);
      return { ok: true, state: migrate(parsed) };
    } catch {
      const decompressed = LZString.decompressFromEncodedURIComponent(body);
      if (decompressed) {
        const parsed = JSON.parse(decompressed);
        return { ok: true, state: migrate(parsed) };
      }
    }

    return { ok: false, error: 'Invalid share code format' };
  } catch (e) {
    return { ok: false, error: 'Invalid share code' };
  }
};

// Forward migration: keep adding cases as schema evolves.
const migrate = (s) => {
  if (!s || typeof s !== 'object') throw new Error('bad');
  if (s.type === 'single-character') {
    return {
      ...s,
      character: normalizeCharacter(s.character)
    };
  }
  const v = s.schemaVersion ?? 1;
  if (v > SCHEMA_VERSION) {
    return normalizeState({ ...s, schemaVersion: SCHEMA_VERSION });
  }
  return normalizeState(s);
};
