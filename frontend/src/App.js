import { useEffect, useState } from 'react';
import { useInventoryStore } from '@/lib/store';
import { CharacterSelect } from '@/components/CharacterSelect';
import { InventoryView } from '@/components/InventoryView';
import { PasteBar } from '@/components/PasteBar';
import { Toaster } from '@/components/ui/sonner';
import { encodeShare, decodeShare } from '@/lib/share';
import { toast } from 'sonner';

function App() {
  const { state, setState, save, undo, redo, replaceState } = useInventoryStore();
  const [view, setView] = useState('roster');
  const activeCharacter = state.characters[state.activeCharacterId];

  // Import from URL fragment on first load: #TTI1:...
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const raw = decodeURIComponent(hash.slice(1));
      const res = decodeShare(raw);
      if (res.ok) {
        replaceState(res.state);
        toast.success('Inventory imported from link');
        // Clean the URL so refresh doesn't re-import
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+C, Ctrl+V
  useEffect(() => {
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const inField = isEditable(document.activeElement);
      const key = e.key.toLowerCase();
      // Undo
      if (key === 'z' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        if (undo()) toast.message('Undo');
        return;
      }
      // Redo
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (inField) return;
        e.preventDefault();
        if (redo()) toast.message('Redo');
        return;
      }
      // Copy share code
      if (key === 'c') {
        if (view !== 'roster') return;
        const sel = window.getSelection()?.toString();
        if (inField || sel) return; // let browser handle
        e.preventDefault();
        const code = encodeShare(state);
        navigator.clipboard.writeText(code).then(() => toast.success('Share code copied'));
        return;
      }
      // Paste share code
      if (key === 'v') {
        if (view !== 'roster') return;
        if (inField) return;
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (!text) return;
          const res = decodeShare(text);
          if (res.ok) { replaceState(res.state); toast.success('Imported from clipboard'); }
          else toast.error('Clipboard does not contain a valid share code');
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, undo, redo, replaceState, view]);

  return (
    <div className="min-h-screen text-[#E2E4E9]" data-testid="app-root">
      <PasteBar
        state={state}
        setState={replaceState}
        save={save}
      />

      {view === 'roster' || !activeCharacter ? (
        <CharacterSelect
          state={state}
          setState={setState}
          initialFolderId={activeCharacter?.parentId ?? null}
          onOpen={(id) => {
            setState((s) => ({ ...s, activeCharacterId: id }));
            setView('inventory');
          }}
        />
      ) : (
        <InventoryView
          character={activeCharacter}
          state={state}
          setState={setState}
          onBack={() => setView('roster')}
        />
      )}

      <Toaster theme="dark" position="top-center" />
    </div>
  );
}

export default App;
