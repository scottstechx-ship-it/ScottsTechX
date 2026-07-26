import React, { useEffect, useRef, useState } from 'react';
import { WifiConfig, QrCustomization } from '../types';
import { generateWifiString, renderQrToCanvas, downloadCanvasImage, generateQrSvg } from '../utils/wifi';
import { 
  Download, 
  Copy, 
  Printer, 
  BookmarkCheck, 
  Check, 
  Palette, 
  Sliders, 
  Sparkles, 
  Maximize2, 
  Shield, 
  Wifi, 
  Lock, 
  Star,
  FileCode
} from 'lucide-react';

interface QrDisplayProps {
  config: WifiConfig;
  customization: QrCustomization;
  onCustomizationChange: (updated: QrCustomization) => void;
  onSaveNetwork: () => void;
  onOpenPrint: () => void;
  isSaved: boolean;
}

const COLOR_PRESETS = [
  { name: 'Scotts Purple', fg: '#6200EE', bg: '#FFFFFF' },
  { name: 'Classic Dark', fg: '#0F172A', bg: '#FFFFFF' },
  { name: 'Emerald Tech', fg: '#059669', bg: '#F0FDF4' },
  { name: 'Midnight Neon', fg: '#818CF8', bg: '#0F172A' },
  { name: 'Cyber Gold', fg: '#D97706', bg: '#FFFBEB' },
  { name: 'Deep Sapphire', fg: '#1E3A8A', bg: '#EFF6FF' },
];

export const QrDisplay: React.FC<QrDisplayProps> = ({
  config,
  customization,
  onCustomizationChange,
  onSaveNetwork,
  onOpenPrint,
  isSaved,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copiedImage, setCopiedImage] = useState<boolean>(false);
  const [showCustomizer, setShowCustomizer] = useState<boolean>(false);

  const rawWifiString = generateWifiString(config);

  useEffect(() => {
    if (canvasRef.current && config.ssid) {
      renderQrToCanvas(canvasRef.current, rawWifiString, customization).catch((err) => {
        console.error('QR Render Error:', err);
      });
    }
  }, [config, customization, rawWifiString]);

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    const filename = `${config.ssid.replace(/\s+/g, '_')}_wifi_qr.png`;
    downloadCanvasImage(canvasRef.current, filename);
  };

  const handleDownloadSvg = async () => {
    try {
      const svgString = await generateQrSvg(rawWifiString, customization);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.ssid.replace(/\s+/g, '_')}_wifi_qr.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
      });
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      alert('Clipboard API error. You can download the PNG instead.');
    }
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Share QR Code</h2>
          <p className="text-xs text-slate-400">Scan with camera to connect instantly</p>
        </div>

        <button
          onClick={() => setShowCustomizer(!showCustomizer)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            showCustomizer
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          <span>Style & Colors</span>
        </button>
      </div>

      {/* Style & Colors Drawer */}
      {showCustomizer && (
        <div className="space-y-4 rounded-xl border border-indigo-900/50 bg-slate-950 p-4 transition-all animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold text-indigo-300">Customization Palette</span>
            <span className="text-[11px] text-slate-400">Personalize QR style</span>
          </div>

          {/* Color Presets */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-300">Theme Presets</label>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() =>
                    onCustomizationChange({
                      ...customization,
                      fgColor: preset.fg,
                      bgColor: preset.bg,
                    })
                  }
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2 text-left hover:border-indigo-500 transition-all"
                >
                  <div className="flex h-5 w-5 rounded-md border border-slate-700 overflow-hidden shrink-0">
                    <div className="w-1/2 h-full" style={{ backgroundColor: preset.fg }} />
                    <div className="w-1/2 h-full" style={{ backgroundColor: preset.bg }} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-300 truncate">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Foreground & Background Pickers */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Foreground Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customization.fgColor}
                  onChange={(e) =>
                    onCustomizationChange({ ...customization, fgColor: e.target.value })
                  }
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
                <span className="text-xs font-mono text-slate-300 uppercase">{customization.fgColor}</span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Background Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customization.bgColor}
                  onChange={(e) =>
                    onCustomizationChange({ ...customization, bgColor: e.target.value })
                  }
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
                <span className="text-xs font-mono text-slate-300 uppercase">{customization.bgColor}</span>
              </div>
            </div>
          </div>

          {/* Center Badge Icon Choice */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-300">Center Badge Icon</label>
            <div className="flex items-center gap-2">
              {[
                { id: 'wifi', icon: Wifi, label: 'Wi-Fi' },
                { id: 'shield', icon: Shield, label: 'Shield' },
                { id: 'lock', icon: Lock, label: 'Lock' },
                { id: 'star', icon: Star, label: 'Star' },
                { id: 'none', icon: Palette, label: 'None' },
              ].map((item) => {
                const IconComponent = item.icon;
                const isSelected = customization.centerIcon === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() =>
                      onCustomizationChange({
                        ...customization,
                        centerIcon: item.id as QrCustomization['centerIcon'],
                      })
                    }
                    className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-600/30 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <IconComponent className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Canvas Box */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 p-8 shadow-inner relative group">
        {!config.ssid ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <Wifi className="h-12 w-12 text-slate-700 animate-pulse mb-3" />
            <p className="text-sm font-medium text-slate-400">Enter a Wi-Fi Name above</p>
            <p className="text-xs text-slate-600">Your QR code will generate automatically in real time</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div 
              className="p-4 rounded-2xl shadow-2xl transition-transform hover:scale-105 duration-200"
              style={{ backgroundColor: customization.bgColor }}
            >
              <canvas ref={canvasRef} className="block rounded-lg" />
            </div>

            {/* Network Badge details */}
            <div className="text-center">
              <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
                <span>{config.ssid}</span>
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
                  {config.security}
                </span>
              </h3>
              {config.notes && (
                <p className="text-xs text-slate-400 mt-0.5">{config.notes}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={handleDownloadPng}
          disabled={!config.ssid}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition-all"
        >
          <Download className="h-4 w-4" />
          <span>PNG Image</span>
        </button>

        <button
          onClick={handleDownloadSvg}
          disabled={!config.ssid}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white active:scale-95 disabled:opacity-50 transition-all border border-slate-700"
        >
          <FileCode className="h-4 w-4 text-indigo-400" />
          <span>SVG Vector</span>
        </button>

        <button
          onClick={handleCopyImage}
          disabled={!config.ssid}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white active:scale-95 disabled:opacity-50 transition-all border border-slate-700"
        >
          {copiedImage ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 text-indigo-400" />
              <span>Copy Image</span>
            </>
          )}
        </button>

        <button
          onClick={onOpenPrint}
          disabled={!config.ssid}
          className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500 active:scale-95 disabled:opacity-50 transition-all"
        >
          <Printer className="h-4 w-4" />
          <span>Print Card</span>
        </button>
      </div>

      {/* Favorite / Bookmark Row */}
      <button
        onClick={onSaveNetwork}
        disabled={!config.ssid}
        className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold transition-all ${
          isSaved
            ? 'border-emerald-600/40 bg-emerald-950/30 text-emerald-300'
            : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
        }`}
      >
        <BookmarkCheck className={`h-4 w-4 ${isSaved ? 'text-emerald-400' : 'text-slate-400'}`} />
        <span>{isSaved ? 'Saved to Favorites' : 'Save Network to Favorites'}</span>
      </button>
    </div>
  );
};
