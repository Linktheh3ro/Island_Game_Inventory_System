import { SCHEMA_VERSION, normalizeState } from './defaults';

// Forward-compatible payload: prefix + base64(JSON). Avoids fragile compression.
const PREFIX = 'TTI1:'; // Table Top Inventory v1 prefix - future versions can detect prefix.

const b64encode = (str) => {
  // Handle unicode safely
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
};

const b64decode = (str) => {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export const encodeShare = (state) => {
  const payload = { ...state, exportedAt: Date.now(), schemaVersion: state.schemaVersion ?? SCHEMA_VERSION };
  return PREFIX + b64encode(JSON.stringify(payload));
};

// Returns { ok, state, error }
export const decodeShare = (raw) => {
  if (!raw) return { ok: false, error: 'Empty input' };
  const trimmed = raw.trim();
  let body = trimmed;
  if (trimmed.startsWith(PREFIX)) body = trimmed.slice(PREFIX.length);
  // Allow raw JSON fallback
  try {
    if (body.trim().startsWith('{')) {
      const parsed = JSON.parse(body);
      return { ok: true, state: migrate(parsed) };
    }
    const json = b64decode(body);
    const parsed = JSON.parse(json);
    return { ok: true, state: migrate(parsed) };
  } catch (e) {
    return { ok: false, error: 'Invalid share code' };
  }
};

// Forward migration: keep adding cases as schema evolves.
const migrate = (s) => {
  if (!s || typeof s !== 'object') throw new Error('bad');
  const v = s.schemaVersion ?? 1;
  // v1 is current; future versions would handle here.
  if (v > SCHEMA_VERSION) {
    // Newer schema imported into older app: try best-effort by keeping known keys.
    return normalizeState({ ...s, schemaVersion: SCHEMA_VERSION });
  }
  return normalizeState(s);
};
