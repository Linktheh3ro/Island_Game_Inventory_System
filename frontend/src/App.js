import { useEffect, useState } from 'react';
import { useInventoryStore } from '@/lib/store';
import { CharacterSelect } from '@/components/CharacterSelect';
import { InventoryView } from '@/components/InventoryView';
import { PasteBar } from '@/components/PasteBar';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

import { Sidebar } from '@/components/Sidebar';

function App() {
  const { state, setState, save, undo, redo, replaceState } = useInventoryStore();
  const [view, setView] = useState('roster');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeCharacter = state.characters[state.activeCharacterId];

  // Global keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Clean up global dragging class on dragend or drop
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      document.body.classList.remove('is-dragging');
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('drop', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('drop', handleGlobalDragEnd);
    };
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
          view={view}
          setView={setView}
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
