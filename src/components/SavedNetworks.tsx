import React, { useState } from 'react';
import { SavedNetwork, WifiConfig } from '../types';
import { 
  BookmarkCheck, 
  Search, 
  Trash2, 
  ArrowRight, 
  Download, 
  Upload, 
  Copy, 
  Check, 
  Wifi, 
  Lock, 
  Eye, 
  EyeOff 
} from 'lucide-react';

interface SavedNetworksProps {
  networks: SavedNetwork[];
  onSelectNetwork: (config: WifiConfig) => void;
  onDeleteNetwork: (id: string) => void;
  onImportNetworks: (imported: SavedNetwork[]) => void;
  onClearAll: () => void;
}

export const SavedNetworks: React.FC<SavedNetworksProps> = ({
  networks,
  onSelectNetwork,
  onDeleteNetwork,
  onImportNetworks,
  onClearAll,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showPasswordId, setShowPasswordId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = networks.filter(
    (item) =>
      item.ssid.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCopyPass = async (id: string, pass: string) => {
    try {
      await navigator.clipboard.writeText(pass);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(networks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `scottstechx_wifi_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportNetworks(parsed);
          alert(`Successfully imported ${parsed.length} network(s).`);
        }
      } catch (err) {
        alert('Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-xl max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BookmarkCheck className="h-5 w-5 text-indigo-400" />
            <span>Saved Wi-Fi Networks</span>
          </h2>
          <p className="text-xs text-slate-400">Manage your saved Wi-Fi profiles and export backups</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            disabled={networks.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-all"
          >
            <Download className="h-3.5 w-3.5 text-indigo-400" />
            <span>Export JSON</span>
          </button>

          <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer transition-all">
            <Upload className="h-3.5 w-3.5 text-indigo-400" />
            <span>Import JSON</span>
            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by network SSID or label..."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Networks List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
          <Wifi className="h-10 w-10 text-slate-700 mb-2" />
          <p className="text-sm font-medium text-slate-400">No saved networks found</p>
          <p className="text-xs text-slate-600">Save Wi-Fi networks in the Generator tab to access them later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 transition-all hover:border-slate-700"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{item.ssid}</span>
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                        {item.security}
                      </span>
                    </h3>
                    {item.notes && <p className="text-xs text-slate-400 mt-0.5">{item.notes}</p>}
                  </div>

                  <button
                    onClick={() => onDeleteNetwork(item.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Delete saved network"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {item.security !== 'nopass' && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 border border-slate-800">
                    <span className="text-xs font-mono text-slate-300">
                      {showPasswordId === item.id ? item.password : '••••••••••••'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPasswordId(showPasswordId === item.id ? null : item.id)}
                        className="text-slate-400 hover:text-white"
                      >
                        {showPasswordId === item.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleCopyPass(item.id, item.password)}
                        className="text-slate-400 hover:text-indigo-300"
                      >
                        {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() =>
                  onSelectNetwork({
                    ssid: item.ssid,
                    password: item.password,
                    security: item.security,
                    hidden: item.hidden,
                    notes: item.notes,
                  })
                }
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600/20 py-2 text-xs font-semibold text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all"
              >
                <span>Load into Generator</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {networks.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-slate-800/80">
          <button
            onClick={onClearAll}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium"
          >
            Clear All Saved Networks
          </button>
        </div>
      )}
    </div>
  );
};
