import { useState } from 'react';
import { Copy, Check, Upload, Download, Link } from 'lucide-react';
import { encodeShare, decodeShare } from '@/lib/share';
import { toast } from 'sonner';

export const PasteBar = ({ state, setState, save }) => {
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

  const handleCopyLink = async () => {
    const code = encodeShare(state);
    const url = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied');
    } catch {
      setInput(url);
    }
  };

  const handleImport = () => {
    const trimmed = input.trim();
    if (!trimmed) return toast.error('Paste a share code first');
    // Allow pasting a full URL with hash too
    let body = trimmed;
    const hashIdx = body.indexOf('#');
    if (hashIdx >= 0) body = decodeURIComponent(body.slice(hashIdx + 1));
    const res = decodeShare(body);
    if (!res.ok) return toast.error(res.error || 'Invalid code');
    setState(res.state);
    setInput('');
    toast.success('Inventory imported');
    save?.();
  };

  const handleDownload = () => {
    const code = encodeShare(state);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${Date.now()}.tti`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = decodeShare(text);
    if (!res.ok) return toast.error(res.error || 'Invalid file');
    setState(res.state);
    toast.success('Inventory imported');
    e.target.value = '';
  };

  return (
    <div className="sticky top-0 z-40 border-b border-[#1f1f23] bg-[#050507]/95 backdrop-blur-md" data-testid="paste-bar">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="font-display text-[10px] tracking-[0.35em] text-[#8A9196] select-none hidden sm:inline">
          SHARE&nbsp;LINK
        </span>
        <input
          type="text"
          placeholder="Paste an inventory share code or link here — or copy yours →"
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
        <button onClick={handleCopyLink} title="Copy as URL with embedded inventory" className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196]" data-testid="paste-bar-link-btn">
          <Link size={14} />
        </button>
        <button onClick={handleDownload} title="Download as file" className="p-2 silver-border bg-[#0d0d0f] hover:bg-[#16161a] text-[#8A9196]" data-testid="paste-bar-download-btn">
          <Download size={14} />
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
