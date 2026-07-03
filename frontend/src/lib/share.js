import { SCHEMA_VERSION, normalizeState, normalizeCharacter } from './defaults';
import LZString from 'lz-string';
import { toast } from 'sonner';

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
  const trimmed = raw.replace(/^\ufeff/, '').trim();
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

const getApiUrl = () => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
    if (process.env.REACT_APP_BACKEND_URL) return `${process.env.REACT_APP_BACKEND_URL}/api`;
  }
  return 'http://localhost:8000/api';
};
const API_URL = getApiUrl();

const fetchWithTimeout = async (resource, options = {}) => {
  const { timeout = 1500 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const encodeShareRemote = async (state) => {
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

  try {
    const res = await fetchWithTimeout(`${API_URL}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: payload }),
      timeout: 1500
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (data.is_fallback) {
      toast.warning("Database offline. Generated a long share code for compatibility.");
      return PREFIX_V2 + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    }
    return data.id; // 6-character short code
  } catch (err) {
    console.warn('Fallback to local encoding:', err);
    toast.warning("Database offline. Generated a long share code for compatibility.");
    return PREFIX_V2 + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  }
};

export const decodeShareRemote = async (raw) => {
  if (!raw) return { ok: false, error: 'Empty input' };
  
  let cleanRaw = raw.replace(/^\ufeff/, '').trim();
  if ((cleanRaw.startsWith('"') && cleanRaw.endsWith('"')) ||
      (cleanRaw.startsWith("'") && cleanRaw.endsWith("'")) ||
      (cleanRaw.startsWith("`") && cleanRaw.endsWith("`"))) {
    cleanRaw = cleanRaw.slice(1, -1).trim();
  }

  let code = cleanRaw;
  if (cleanRaw.includes('/') || cleanRaw.includes('#')) {
    const hashIdx = cleanRaw.indexOf('#');
    const path = hashIdx >= 0 ? cleanRaw.slice(hashIdx + 1) : cleanRaw;
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    code = decodeURIComponent(lastPart).trim();
  }

  if ((code.startsWith('"') && code.endsWith('"')) ||
      (code.startsWith("'") && code.endsWith("'")) ||
      (code.startsWith("`") && code.endsWith("`"))) {
    code = code.slice(1, -1).trim();
  }

  // If it's a legacy/local prefix or long raw JSON
  if (code.startsWith('TTI1:') || code.startsWith('TTI2:') || code.startsWith('{') || code.length > 12) {
    return decodeShare(code);
  }

  // Fetch short code from backend
  try {
    const res = await fetchWithTimeout(`${API_URL}/shares/${code}`, { timeout: 1500 });
    if (!res.ok) {
      if (res.status === 404) return { ok: false, error: 'Share code not found' };
      throw new Error('Server error');
    }
    const data = await res.json();
    return { ok: true, state: migrate(data.state) };
  } catch (err) {
    console.error('Failed to fetch share code:', err);
    if (cleanRaw.startsWith('TTI1:') || cleanRaw.startsWith('TTI2:')) {
      return decodeShare(cleanRaw);
    }
    return { ok: false, error: 'Could not connect to sharing server or invalid code' };
  }
};

export const autosaveRemote = async (state, isClosing = false) => {
  try {
    const res = await fetch(`${API_URL}/autosave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
      keepalive: isClosing
    });
    return res.ok;
  } catch (err) {
    console.warn('Autosave to backend failed:', err);
    return false;
  }
};

export const manualSaveRemote = async (state) => {
  try {
    const res = await fetch(`${API_URL}/manual_save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    return res.ok;
  } catch (err) {
    console.warn('Manual save copy to backend failed:', err);
    return false;
  }
};
