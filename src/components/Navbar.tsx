import React from 'react';
import { Wifi, BookmarkCheck, Printer, QrCode, ShieldCheck, Sparkles } from 'lucide-react';

interface NavbarProps {
  activeTab: 'generator' | 'saved' | 'print' | 'scanner';
  setActiveTab: (tab: 'generator' | 'saved' | 'print' | 'scanner') => void;
  savedCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  savedCount,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo & Name */}
        <div 
          className="flex cursor-pointer items-center gap-3"
          onClick={() => setActiveTab('generator')}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Wifi className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                ScottsTechX <span className="text-indigo-400">wifi</span>
              </span>
              <span className="hidden rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-500/30 sm:inline-block">
                Pro QR
              </span>
            </div>
            <p className="text-xs text-slate-400">Instant Wi-Fi QR Generator & Printable Share Cards</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('generator')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === 'generator'
                ? 'bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/40'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <QrCode className="h-4 w-4" />
            <span className="hidden sm:inline">Generator</span>
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === 'saved'
                ? 'bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/40'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <BookmarkCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Saved</span>
            {savedCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold text-white">
                {savedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('print')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === 'print'
                ? 'bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/40'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print Card</span>
          </button>

          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === 'scanner'
                ? 'bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/40'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Decode QR</span>
          </button>
        </nav>

        {/* Security Badge */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded-full">
          <ShieldCheck className="h-4 w-4" />
          <span>100% Client-Side Private</span>
        </div>
      </div>
    </header>
  );
};
