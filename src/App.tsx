import React, { useEffect, useState } from 'react';
import { WifiConfig, QrCustomization, SavedNetwork } from './types';
import { Navbar } from './components/Navbar';
import { WifiForm } from './components/WifiForm';
import { QrDisplay } from './components/QrDisplay';
import { PrintableCard } from './components/PrintableCard';
import { SavedNetworks } from './components/SavedNetworks';
import { QrDecoder } from './components/QrDecoder';
import { ShieldCheck, Wifi, Github, ExternalLink, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'scottstechx_wifi_saved_networks_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<'generator' | 'saved' | 'print' | 'scanner'>('generator');

  // Default Wi-Fi configuration matching ScottsTechX wifi brand blueprint
  const [wifiConfig, setWifiConfig] = useState<WifiConfig>({
    ssid: 'ScottsTechX_WiFi',
    password: 'ScottsGuest2026!',
    security: 'WPA',
    hidden: false,
    notes: 'Primary Guest Network',
  });

  // Customization settings
  const [qrCustomization, setQrCustomization] = useState<QrCustomization>({
    fgColor: '#6200EE',
    bgColor: '#FFFFFF',
    size: 260,
    margin: 2,
    errorCorrectionLevel: 'M',
    centerIcon: 'wifi',
    cardTitle: 'ScottsTechX wifi',
    cardSubtitle: 'Scan to connect instantly without typing',
  });

  // Saved Networks State
  const [savedNetworks, setSavedNetworks] = useState<SavedNetwork[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (err) {
      console.error('Failed to parse saved networks:', err);
    }
    // Default initial saved network
    return [
      {
        id: 'default-1',
        ssid: 'ScottsTechX_WiFi',
        password: 'ScottsGuest2026!',
        security: 'WPA',
        hidden: false,
        notes: 'Primary Guest Network',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNetworks));
    } catch (err) {
      console.error('Failed to persist saved networks:', err);
    }
  }, [savedNetworks]);

  const isCurrentSaved = savedNetworks.some((item) => item.ssid === wifiConfig.ssid);

  const handleSaveToFavorites = () => {
    if (!wifiConfig.ssid) return;

    if (isCurrentSaved) {
      // Remove
      setSavedNetworks((prev) => prev.filter((item) => item.ssid !== wifiConfig.ssid));
    } else {
      // Add
      const newEntry: SavedNetwork = {
        ...wifiConfig,
        id: 'net-' + Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSavedNetworks((prev) => [newEntry, ...prev]);
    }
  };

  const handleDeleteSaved = (id: string) => {
    setSavedNetworks((prev) => prev.filter((item) => item.id !== id));
  };

  const handleImportNetworks = (imported: SavedNetwork[]) => {
    setSavedNetworks((prev) => {
      const existingSsids = new Set(prev.map((i) => i.ssid));
      const fresh = imported.filter((item) => !existingSsids.has(item.ssid));
      return [...fresh, ...prev];
    });
  };

  const handleClearAllSaved = () => {
    if (confirm('Are you sure you want to delete all saved networks?')) {
      setSavedNetworks([]);
    }
  };

  const handleLoadNetwork = (config: WifiConfig) => {
    setWifiConfig(config);
    setActiveTab('generator');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Navigation Header */}
      <div className="no-print">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          savedCount={savedNetworks.length}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6">
        {/* Generator Tab */}
        {activeTab === 'generator' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Hero Subheader */}
            <div className="no-print text-center max-w-2xl mx-auto space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>ScottsTechX wifi QR Engine</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Share Wi-Fi Instantly with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">QR Code</span>
              </h1>
              <p className="text-sm text-slate-400">
                Generate secure, camera-scannable Wi-Fi QR codes. Guests simply point their iPhone or Android camera to join your network—no manual typing required.
              </p>
            </div>

            {/* Grid Layout: Input Form + QR Display */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <WifiForm
                config={wifiConfig}
                onChange={setWifiConfig}
                onSaveToFavorites={handleSaveToFavorites}
                isSaved={isCurrentSaved}
              />

              <QrDisplay
                config={wifiConfig}
                customization={qrCustomization}
                onCustomizationChange={setQrCustomization}
                onSaveNetwork={handleSaveToFavorites}
                onOpenPrint={() => setActiveTab('print')}
                isSaved={isCurrentSaved}
              />
            </div>
          </div>
        )}

        {/* Saved Networks Tab */}
        {activeTab === 'saved' && (
          <SavedNetworks
            networks={savedNetworks}
            onSelectNetwork={handleLoadNetwork}
            onDeleteNetwork={handleDeleteSaved}
            onImportNetworks={handleImportNetworks}
            onClearAll={handleClearAllSaved}
          />
        )}

        {/* Printable Card Studio Tab */}
        {activeTab === 'print' && (
          <PrintableCard
            config={wifiConfig}
            customization={qrCustomization}
            onBack={() => setActiveTab('generator')}
          />
        )}

        {/* QR Decoder / Scanner Tab */}
        {activeTab === 'scanner' && (
          <QrDecoder onLoadDecoded={handleLoadNetwork} />
        )}
      </main>

      {/* Footer */}
      <footer className="no-print border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold text-slate-300">ScottsTechX wifi</span>
            <span>— Fast, Secure & Offline Wi-Fi QR Generator</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Zero Data Logging</span>
            </span>
            <span>•</span>
            <span>WPA3 / WPA2 / WEP Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
