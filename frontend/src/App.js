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

  const isNative = new URLSearchParams(window.location.search).get('native') === 'true';
  const [showShortcutPrompt, setShowShortcutPrompt] = useState(false);

  // Auto-load latest save from backend on startup
  useEffect(() => {
    fetch('/api/load_latest')
      .then(res => res.json())
      .then(data => {
        if (data && data.ok && data.state) {
          replaceState(data.state);
          const activeCharId = data.state.activeCharacterId;
          if (activeCharId && data.state.characters?.[activeCharId]) {
            setView('inventory');
          }
          toast.success(`Restored latest save: ${data.filename}`);
        }
      })
      .catch(err => console.warn('Failed to load latest save from backend:', err));
  }, []);

  // Shortcut check (focus & paint guarded to prevent Edge WebView2 interop deadlocks when opened in background)
  useEffect(() => {
    if (!isNative) return;
    if (localStorage.getItem('hide_shortcut_prompt') === 'true') return;
    
    let hasRun = false;
    let checkTimer = null;
    let frameId1 = null;
    let frameId2 = null;
    
    const runCheck = () => {
      if (hasRun) return;
      window.removeEventListener('focus', runCheck);
      
      // Phase 1: Wait for browser rendering paint cycles to complete
      frameId1 = requestAnimationFrame(() => {
        frameId2 = requestAnimationFrame(() => {
          // Phase 2: Add a 200ms buffer for WinForms thread message pump stabilization
          checkTimer = setTimeout(() => {
            if (window.pywebview?.api?.check_shortcut) {
              hasRun = true;
              window.pywebview.api.check_shortcut()
                .then((exists) => {
                  if (!exists) {
                    setShowShortcutPrompt(true);
                  }
                })
                .catch((err) => {
                  console.warn('Failed to check desktop shortcut:', err);
                  hasRun = false; // allow retry if failed
                });
            }
          }, 200);
        });
      });
    };

    if (document.hasFocus()) {
      checkTimer = setTimeout(runCheck, 1500);
    } else {
      window.addEventListener('focus', runCheck);
    }
    
    return () => {
      if (checkTimer) clearTimeout(checkTimer);
      if (frameId1) cancelAnimationFrame(frameId1);
      if (frameId2) cancelAnimationFrame(frameId2);
      window.removeEventListener('focus', runCheck);
    };
  }, [isNative]);

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

      {/* Premium Desktop Shortcut Prompt Dialog */}
      {showShortcutPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0D0E12] border border-[#1F222F] rounded-xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-lg font-semibold text-white tracking-wide">Create Desktop Shortcut?</h3>
              <p className="text-sm text-[#8F96A3] leading-relaxed">
                Would you like to place a desktop shortcut for quick launch next time?
              </p>
            </div>
            
            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="dont-ask-shortcut"
                className="w-4 h-4 rounded border-[#2C3142] bg-[#141722] text-[#3B82F6] focus:ring-offset-0 focus:ring-0"
              />
              <label htmlFor="dont-ask-shortcut" className="text-xs text-[#8F96A3] select-none cursor-pointer">
                Don't ask me again
              </label>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={() => {
                  const hideVal = document.getElementById('dont-ask-shortcut')?.checked;
                  if (hideVal) {
                    localStorage.setItem('hide_shortcut_prompt', 'true');
                  }
                  setShowShortcutPrompt(false);
                }}
                className="px-4 py-2 rounded-lg text-sm text-[#8F96A3] hover:text-white bg-transparent hover:bg-white/5 transition-all duration-150 active:scale-95"
              >
                No, Thanks
              </button>
              <button
                onClick={() => {
                  const hideVal = document.getElementById('dont-ask-shortcut')?.checked;
                  if (hideVal) {
                    localStorage.setItem('hide_shortcut_prompt', 'true');
                  }
                  if (window.pywebview?.api?.create_shortcut) {
                    window.pywebview.api.create_shortcut()
                      .then(() => toast.success('Shortcut created on your Desktop!'))
                      .catch(() => toast.error('Failed to create shortcut.'));
                  }
                  setShowShortcutPrompt(false);
                }}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-150 active:scale-95"
              >
                Yes, Create
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster theme="dark" position="top-center" />
    </div>
  );
}

export default App;
