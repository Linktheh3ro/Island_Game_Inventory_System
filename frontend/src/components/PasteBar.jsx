import { useState } from 'react';
import { Copy, Check, Upload, Download, PanelLeftOpen, Save } from 'lucide-react';
import { encodeShare, decodeShare } from '@/lib/share';
import { toast } from 'sonner';

export const PasteBar = ({ state, setState, save, sidebarCollapsed, onExpandSidebar, replaceState, view, setView }) => {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const code = encodeShare(state);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Inventory code copied');
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setInput(code);
      toast.message('Copied to bar — select & copy manually');
    }
  };

  const handleImport = () => {
    const trimmed = input.trim();
    if (!trimmed) return toast.error('Paste a share code first');
    const res = decodeShare(trimmed);
    if (!res.ok) return toast.error(res.error || 'Invalid code');
    replaceState(res.state, view === 'roster');
    setInput('');
    toast.success('Inventory imported');
    if (view === 'roster') setView?.('inventory');
    save?.();
  };

  const handleDownload = () => {
    const code = encodeShare(state);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const activeChar = state.characters?.[state.activeCharacterId];
    const charName = (activeChar?.name || 'Unknown_Character')
      .replace(/[^a-z0-9_-]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${dateStr}_${charName}.tti`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded file to PC');
  };

  const handleSaveToBackend = async () => {
    try {
      const res = await fetch('/api/manual_save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      if (res.ok) {
        toast.success('Inventory saved to backend "saves" folder');
      } else {
        toast.error('Failed to save to backend');
      }
    } catch (err) {
      console.warn('Manual save copy to backend failed:', err);
      toast.error('Failed to save to backend');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = decodeShare(text);
    if (!res.ok) return toast.error(res.error || 'Invalid file');
    replaceState(res.state, view === 'roster');
    toast.success('Inventory imported');
    if (view === 'roster') setView?.('inventory');
    e.target.value = '';
  };

  return (
    <div className="sticky top-0 z-40 border-b border-[#1f1f23] bg-[#050507]/95 backdrop-blur-md" data-testid="paste-bar">
      <div className="flex items-center gap-2 px-4 py-2">
        {sidebarCollapsed && (
          <button
            onClick={onExpandSidebar}
            className="p-1.5 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196] hover:text-[#C8CCD2]"
            title="Expand Sidebar"
            data-testid="expand-sidebar-btn"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}
        <span className="font-display text-[10px] tracking-[0.35em] text-[#8A9196] select-none hidden sm:inline">
          IMPORT
        </span>
        <input
          type="text"
          placeholder="Paste code..."
          className="flex-1 bg-[#0a0a0c] silver-border px-3 py-2 text-sm font-meta text-[#C8CCD2] placeholder:text-[#4a4d52] focus:outline-none focus:border-[#6a6c70]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); }}
          data-testid="paste-bar-input"
        />
        <button onClick={handleImport} className="px-3 py-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2]" data-testid="paste-bar-import-btn">
          IMPORT
        </button>
        <button onClick={handleCopy} className="px-3 py-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] font-meta text-xs tracking-[0.2em] text-[#C8CCD2] flex items-center gap-2" data-testid="paste-bar-copy-btn">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
        <button onClick={handleDownload} title="Download file to PC" className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196]" data-testid="paste-bar-download-btn">
          <Download size={14} />
        </button>
        <button onClick={handleSaveToBackend} title="Save to local backend" className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196]" data-testid="paste-bar-save-btn">
          <Save size={14} />
        </button>
        <label title="Upload from file" className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196] cursor-pointer" data-testid="paste-bar-upload-label">
          <Upload size={14} />
          <input type="file" accept=".tti,.txt,.json" className="hidden" onChange={handleUpload} data-testid="paste-bar-upload-input" />
        </label>
      </div>
      <div className="silver-divider" />
    </div>
  );
};
