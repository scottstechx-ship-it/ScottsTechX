import React, { useRef, useState } from 'react';
import jsQR from 'jsqr';
import { WifiConfig } from '../types';
import { parseWifiString } from '../utils/wifi';
import { Upload, Sparkles, CheckCircle2, AlertCircle, ArrowRight, Copy, Check, Eye, EyeOff, Lock } from 'lucide-react';

interface QrDecoderProps {
  onLoadDecoded: (config: WifiConfig) => void;
}

export const QrDecoder: React.FC<QrDecoderProps> = ({ onLoadDecoded }) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decodedConfig, setDecodedConfig] = useState<WifiConfig | null>(null);
  const [rawCode, setRawCode] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copiedPass, setCopiedPass] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processImageFile = (file: File) => {
    setErrorMsg(null);
    setDecodedConfig(null);
    setRawCode(null);

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          setRawCode(code.data);
          const parsed = parseWifiString(code.data);
          if (parsed) {
            setDecodedConfig(parsed);
          } else {
            setErrorMsg(`QR code scanned, but it is not in standard Wi-Fi format. Raw content: "${code.data}"`);
          }
        } else {
          setErrorMsg('No QR code could be detected in the uploaded image. Please try a clearer or higher resolution image.');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleCopyPass = async () => {
    if (!decodedConfig) return;
    try {
      await navigator.clipboard.writeText(decodedConfig.password);
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-xl max-w-2xl mx-auto">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <span>Decode & Read Wi-Fi QR Code</span>
        </h2>
        <p className="text-xs text-slate-400">Upload or drag & drop any Wi-Fi QR code image to reveal credentials</p>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-all text-center ${
          dragActive
            ? 'border-indigo-500 bg-indigo-950/30'
            : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900/50'
        }`}
      >
        <Upload className="h-10 w-10 text-indigo-400 mb-3 animate-bounce" />
        <p className="text-sm font-semibold text-white">Click or Drag & Drop Wi-Fi QR Image Here</p>
        <p className="text-xs text-slate-500 mt-1">Supports PNG, JPG, WEBP formats</p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              processImageFile(e.target.files[0]);
            }
          }}
          className="hidden"
        />
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-900/50 bg-rose-950/30 p-4 text-xs text-rose-300">
          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Decoded Output Card */}
      {decodedConfig && (
        <div className="flex flex-col gap-4 rounded-xl border border-emerald-800/50 bg-slate-950 p-5 animate-fadeIn">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <CheckCircle2 className="h-5 w-5" />
            <span>Wi-Fi Network Decoded Successfully!</span>
          </div>

          <div className="space-y-3 rounded-lg bg-slate-900 p-4 border border-slate-800">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Wi-Fi Name (SSID)</span>
              <p className="text-base font-bold text-white flex items-center gap-2">
                <span>{decodedConfig.ssid}</span>
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                  {decodedConfig.security}
                </span>
              </p>
            </div>

            {decodedConfig.security !== 'nopass' && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Password</span>
                  <button
                    onClick={handleCopyPass}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    {copiedPass ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedPass ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1 rounded bg-slate-950 px-3 py-2 border border-slate-800">
                  <span className="font-mono text-sm text-white">
                    {showPassword ? decodedConfig.password : '••••••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => onLoadDecoded(decodedConfig)}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
          >
            <span>Load Decoded Network into Generator</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
