import React, { useEffect, useRef, useState } from 'react';
import { WifiConfig, QrCustomization } from '../types';
import { generateWifiString, renderQrToCanvas } from '../utils/wifi';
import { Printer, Download, ArrowLeft, Eye, EyeOff, Sparkles, Wifi, Shield } from 'lucide-react';

interface PrintableCardProps {
  config: WifiConfig;
  customization: QrCustomization;
  onBack: () => void;
}

export const PrintableCard: React.FC<PrintableCardProps> = ({
  config,
  customization,
  onBack,
}) => {
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardTitle, setCardTitle] = useState<string>('ScottsTechX wifi');
  const [cardSubtitle, setCardSubtitle] = useState<string>('Point your smartphone camera at the QR code to join automatically.');
  const [showPasswordText, setShowPasswordText] = useState<boolean>(true);
  const [cardStyle, setCardStyle] = useState<'modern' | 'minimal' | 'bold'>('modern');

  const rawWifiString = generateWifiString(config);

  useEffect(() => {
    if (cardCanvasRef.current && config.ssid) {
      renderQrToCanvas(cardCanvasRef.current, rawWifiString, {
        ...customization,
        size: 260,
      }).catch((err) => console.error(err));
    }
  }, [config, customization, rawWifiString]);

  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Top Bar Controls (Hidden in Print Mode) */}
      <div className="no-print flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Generator</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTriggerPrint}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
          >
            <Printer className="h-4 w-4" />
            <span>Print Tent Card</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Settings Panel (Hidden in Print) */}
        <div className="no-print flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>Card Customizer</span>
          </h3>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Header Title</label>
            <input
              type="text"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Subheading Instructions</label>
            <textarea
              value={cardSubtitle}
              onChange={(e) => setCardSubtitle(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Display Options</label>
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <span className="text-xs text-slate-300">Show Password Text</span>
              <button
                type="button"
                onClick={() => setShowPasswordText(!showPasswordText)}
                className="text-slate-400 hover:text-white"
              >
                {showPasswordText ? <Eye className="h-4 w-4 text-indigo-400" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Theme Style</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['modern', 'minimal', 'bold'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setCardStyle(style)}
                  className={`rounded-lg py-1.5 text-xs capitalize font-medium transition-all ${
                    cardStyle === style
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* The Printable Card Display Area */}
        <div className="md:col-span-2 flex justify-center">
          <div 
            id="printable-card"
            className={`w-full max-w-md rounded-3xl p-8 transition-all shadow-2xl flex flex-col items-center text-center ${
              cardStyle === 'modern'
                ? 'bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950 border-2 border-indigo-500/40 text-white'
                : cardStyle === 'minimal'
                ? 'bg-white text-slate-900 border border-slate-200'
                : 'bg-indigo-950 border-4 border-indigo-500 text-white'
            }`}
          >
            {/* Logo Badge Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2.5 rounded-xl ${cardStyle === 'minimal' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-indigo-300'}`}>
                <Wifi className="h-6 w-6" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight">
                {cardTitle}
              </span>
            </div>

            <p className={`text-xs mb-6 max-w-xs ${cardStyle === 'minimal' ? 'text-slate-600' : 'text-slate-300'}`}>
              {cardSubtitle}
            </p>

            {/* Canvas QR Code */}
            <div className={`p-4 rounded-2xl shadow-xl mb-6 ${cardStyle === 'minimal' ? 'bg-slate-100' : 'bg-white'}`}>
              <canvas ref={cardCanvasRef} className="block rounded-lg" />
            </div>

            {/* Network Credentials Box */}
            <div className={`w-full rounded-2xl p-4 border text-left space-y-2 ${
              cardStyle === 'minimal' 
                ? 'bg-slate-50 border-slate-200 text-slate-900' 
                : 'bg-slate-900/80 border-slate-800 text-white'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Network Name (SSID)</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                  {config.security}
                </span>
              </div>
              <p className="text-base font-bold font-mono tracking-wide">{config.ssid || 'ScottsTechX_WiFi'}</p>

              {config.security !== 'nopass' && showPasswordText && (
                <div className="pt-2 border-t border-slate-700/50">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Wi-Fi Password</span>
                  <p className="text-sm font-semibold font-mono tracking-wider break-all text-indigo-300">
                    {config.password || '••••••••'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Tagline */}
            <div className="mt-6 flex items-center justify-center gap-2 text-[11px] opacity-70">
              <Shield className="h-3.5 w-3.5" />
              <span>ScottsTechX wifi • Instant Network Join</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
