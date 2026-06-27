import { useEffect, useRef, useState, useCallback } from 'react';
import { initialState, normalizeState } from './defaults';

const KEY = 'tabletop-inventory-v1';
const HISTORY_LIMIT = 80;

const loadInitial = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.characters) return initialState();
    return normalizeState(parsed);
  } catch {
    return initialState();
  }
};

export const useInventoryStore = () => {
  const [state, _setState] = useState(loadInitial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const history = useRef({ past: [], future: [] });

  const setState = useCallback((updater) => {
    _setState((cur) => {
      const next = typeof updater === 'function' ? updater(cur) : updater;
      if (next === cur) return cur;
      history.current.past.push(cur);
      if (history.current.past.length > HISTORY_LIMIT) history.current.past.shift();
      history.current.future = [];
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (history.current.past.length === 0) return false;
    const prev = history.current.past.pop();
    history.current.future.push(stateRef.current);
    _setState(prev);
    return true;
  }, []);

  const redo = useCallback(() => {
    if (history.current.future.length === 0) return false;
    const nxt = history.current.future.pop();
    history.current.past.push(stateRef.current);
    _setState(nxt);
    return true;
  }, []);

  const replaceState = useCallback((next) => {
    history.current.past.push(stateRef.current);
    if (history.current.past.length > HISTORY_LIMIT) history.current.past.shift();
    history.current.future = [];
    _setState(next);
  }, []);

  const save = useCallback(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(stateRef.current));
    } catch (e) {
      console.warn('Save failed', e);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(save, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [save]);

  useEffect(() => {
    const id = setTimeout(save, 300);
    return () => clearTimeout(id);
  }, [state, save]);

  useEffect(() => {
    const handler = () => save();
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [save]);

  return { state, setState, save, undo, redo, replaceState };
};
