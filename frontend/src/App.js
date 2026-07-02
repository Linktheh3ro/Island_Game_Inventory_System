import { useEffect, useState } from 'react';
import { useInventoryStore } from '@/lib/store';
import { CharacterSelect } from '@/components/CharacterSelect';
import { InventoryView } from '@/components/InventoryView';
import { PasteBar } from '@/components/PasteBar';
import { Toaster } from '@/components/ui/sonner';
import { encodeShareRemote, decodeShareRemote } from '@/lib/share';
import { toast } from 'sonner';

import { Sidebar } from '@/components/Sidebar';

function App() {
  const { state, setState, save, undo, redo, replaceState } = useInventoryStore();
  const [view, setView] = useState('roster');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeCharacter = state.characters[state.activeCharacterId];

  // Import from URL fragment on first load: #TTI1:... or #/share/...
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const raw = decodeURIComponent(hash.slice(1));
      decodeShareRemote(raw).then((res) => {
        if (res.ok) {
          replaceState(res.state);
          toast.success('Inventory imported from link');
          // Clean the URL so refresh doesn't re-import
          history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
          toast.error(res.error || 'Failed to import inventory from link');
        }
      });
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
        encodeShareRemote(state).then((code) => {
          navigator.clipboard.writeText(code).then(() => toast.success('Share code copied'));
        });
        return;
      }
      // Paste share code
      if (key === 'v') {
        if (view !== 'roster') return;
        if (inField) return;
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (!text) return;
          decodeShareRemote(text).then((res) => {
            if (res.ok) { replaceState(res.state); toast.success('Imported from clipboard'); }
            else toast.error(res.error || 'Clipboard does not contain a valid share code');
          });
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, undo, redo, replaceState, view]);

  // Clean up global dragging class on dragend
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      document.body.classList.remove('is-dragging');
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => window.removeEventListener('dragend', handleGlobalDragEnd);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden text-[#E2E4E9] bg-[#050507]" data-testid="app-root">
      <Sidebar
        state={state}
        setState={setState}
        view={view}
        setView={setView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(true)}
      />

      <div className="flex-1 min-w-0 flex flex-col relative h-full overflow-hidden">
        <PasteBar
          state={state}
          setState={setState}
          replaceState={replaceState}
          save={save}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
        />

        <main className={`flex-1 flex flex-col min-h-0 ${view === 'roster' || !activeCharacter ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          {view === 'roster' || !activeCharacter ? (
            <CharacterSelect
              state={state}
              setState={setState}
              initialFolderId={activeCharacter?.parentId ?? null}
              onOpen={(id) => {
                const char = state.characters[id];
                const firstInv = char?.inventories?.[0]?.id || null;
                setState((s) => ({ ...s, activeCharacterId: id, activeInventoryId: firstInv }));
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
        </main>
      </div>

      <Toaster theme="dark" position="top-center" />
    </div>
  );
}

export default App;
