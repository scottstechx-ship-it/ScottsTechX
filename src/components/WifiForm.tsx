import React, { useState } from 'react';
import { WifiConfig, SecurityType } from '../types';
import { 
  Wifi, 
  Eye, 
  EyeOff, 
  Lock, 
  ShieldAlert, 
  KeyRound, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw,
  Info
} from 'lucide-react';
import { generateWifiString } from '../utils/wifi';

interface WifiFormProps {
  config: WifiConfig;
  onChange: (updated: WifiConfig) => void;
  onSaveToFavorites: () => void;
  isSaved: boolean;
}

export const WifiForm: React.FC<WifiFormProps> = ({
  config,
  onChange,
  onSaveToFavorites,
  isSaved,
}) => {
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copiedRaw, setCopiedRaw] = useState<boolean>(false);

  const handleFieldChange = (key: keyof WifiConfig, value: any) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let newPass = '';
    for (let i = 0; i < 16; i++) {
      newPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleFieldChange('password', newPass);
    setShowPassword(true);
  };

  const applyPreset = (presetSsid: string, security: SecurityType, pass: string = '') => {
    onChange({
      ssid: presetSsid,
      password: pass,
      security,
      hidden: false,
    });
  };

  const rawString = generateWifiString(config);

  const copyRawToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(rawString);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Network Credentials</h2>
            <p className="text-xs text-slate-400">Enter your Wi-Fi details to generate a shareable QR code</p>
          </div>
        </div>

        {/* Quick Presets Dropdown / Buttons */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-slate-400">Presets:</span>
          <button
            onClick={() => applyPreset('ScottsTechX_Guest', 'WPA', 'ScottsGuest2026!')}
            className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            Guest
          </button>
          <button
            onClick={() => applyPreset('ScottsTechX_Office_5G', 'WPA', 'SuperSecurePass123')}
            className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            Office 5G
          </button>
        </div>
      </div>

      {/* Form Controls */}
      <div className="space-y-4">
        {/* Network Name (SSID) */}
        <div>
          <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300">
            <span>Wi-Fi Network Name (SSID) *</span>
            <span className="text-slate-500">{config.ssid.length} chars</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={config.ssid}
              onChange={(e) => handleFieldChange('ssid', e.target.value)}
              placeholder="e.g., ScottsTechX_WiFi"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Security Type */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300">
            Security Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleFieldChange('security', 'WPA')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                config.security === 'WPA'
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/50'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              WPA / WPA2 / WPA3
            </button>

            <button
              type="button"
              onClick={() => handleFieldChange('security', 'WEP')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                config.security === 'WEP'
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/50'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              WEP (Legacy)
            </button>

            <button
              type="button"
              onClick={() => handleFieldChange('security', 'nopass')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                config.security === 'nopass'
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/50'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Open (No Password)
            </button>
          </div>
        </div>

        {/* Password Input (Hidden if security is 'nopass') */}
        {config.security !== 'nopass' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300">
              <span>Network Password *</span>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Generate Random
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={config.password}
                onChange={(e) => handleFieldChange('password', e.target.value)}
                placeholder="Enter Wi-Fi password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-10 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Hidden Network Checkbox */}
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
          <div className="flex items-center gap-2.5">
            <input
              id="hiddenSsid"
              type="checkbox"
              checked={config.hidden}
              onChange={(e) => handleFieldChange('hidden', e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
            />
            <label htmlFor="hiddenSsid" className="cursor-pointer text-xs font-medium text-slate-200">
              Hidden Network (Unbroadcasted SSID)
            </label>
          </div>
          <span className="text-[11px] text-slate-500">Adds H:true flag</span>
        </div>

        {/* Additional Notes / Location */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300">
            Location / Label (Optional)
          </label>
          <input
            type="text"
            value={config.notes || ''}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            placeholder="e.g., Living Room Router, Guest Suite"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Raw Wi-Fi Code Preview & Copy */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Standard Wi-Fi String Format
          </span>
          <button
            onClick={copyRawToClipboard}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
          >
            {copiedRaw ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copiedRaw ? 'Copied String' : 'Copy String'}</span>
          </button>
        </div>
        <div className="font-mono text-xs text-slate-300 break-all bg-slate-900 p-2 rounded border border-slate-800/60 select-all">
          {rawString}
        </div>
      </div>

      {/* Privacy Guarantee Note */}
      <div className="flex items-start gap-2.5 text-xs text-slate-400 bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-xl">
        <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
        <p>
          <strong className="text-indigo-300">Privacy Notice:</strong> Network passwords and SSIDs are processed strictly in your browser memory. Nothing is sent to any remote server or database.
        </p>
      </div>
    </div>
  );
};
