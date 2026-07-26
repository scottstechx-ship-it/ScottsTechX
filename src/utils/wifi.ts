import QRCode from 'qrcode';
import { WifiConfig, QrCustomization } from '../types';

/**
 * Escapes special characters for Wi-Fi QR code format:
 * '\', ';', ',', ':' must be escaped with a backslash.
 */
export function escapeWifiString(str: string): string {
  return str.replace(/([\\;,:])/g, '\\$1');
}

/**
 * Unescapes special characters from Wi-Fi QR code string.
 */
export function unescapeWifiString(str: string): string {
  return str.replace(/\\([\\;,:])/g, '$1');
}

/**
 * Formats a WifiConfig into standard Wi-Fi QR string:
 * e.g., WIFI:S:MyNetwork;T:WPA;P:Secret123;H:false;;
 */
export function generateWifiString(config: WifiConfig): string {
  const { ssid, password, security, hidden } = config;

  const escapedSsid = escapeWifiString(ssid);
  const escapedPass = escapeWifiString(password);

  let result = `WIFI:S:${escapedSsid};`;

  if (security !== 'nopass') {
    result += `T:${security};`;
    result += `P:${escapedPass};`;
  } else {
    result += `T:nopass;`;
  }

  if (hidden) {
    result += `H:true;`;
  } else {
    result += `H:false;`;
  }

  result += `;`;
  return result;
}

/**
 * Parses a standard Wi-Fi QR code string back into WifiConfig object.
 */
export function parseWifiString(qrString: string): WifiConfig | null {
  if (!qrString.startsWith('WIFI:')) return null;

  const content = qrString.substring(5); // remove 'WIFI:'
  const parts = content.split(/(?<!\\);/);

  let ssid = '';
  let password = '';
  let security: WifiConfig['security'] = 'WPA';
  let hidden = false;

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('S:')) {
      ssid = unescapeWifiString(part.substring(2));
    } else if (part.startsWith('P:')) {
      password = unescapeWifiString(part.substring(2));
    } else if (part.startsWith('T:')) {
      const sec = part.substring(2);
      if (sec === 'WEP') security = 'WEP';
      else if (sec === 'nopass' || sec === 'Open') security = 'nopass';
      else security = 'WPA';
    } else if (part.startsWith('H:')) {
      const h = part.substring(2);
      hidden = h === 'true' || h === '1';
    }
  }

  if (!ssid) return null;

  return { ssid, password, security, hidden };
}

/**
 * Draws QR code onto canvas with optional center icon badge.
 */
export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: QrCustomization
): Promise<void> {
  const { fgColor, bgColor, size, margin, errorCorrectionLevel, centerIcon } = options;

  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin,
    color: {
      dark: fgColor,
      light: bgColor,
    },
    errorCorrectionLevel: centerIcon !== 'none' ? 'H' : errorCorrectionLevel,
  });

  if (centerIcon && centerIcon !== 'none') {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerSize = Math.floor(size * 0.22);
    const x = (size - centerSize) / 2;
    const y = (size - centerSize) / 2;
    const padding = 6;

    // Draw background badge pill behind icon
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, centerSize, centerSize, 12);
    ctx.fill();

    // Draw border around badge
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Icon symbol inside center badge
    ctx.fillStyle = fgColor;
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cx = size / 2;
    const cy = size / 2;

    if (centerIcon === 'wifi') {
      // Draw Wi-Fi arcs
      const r1 = centerSize * 0.32;
      const r2 = centerSize * 0.20;
      const r3 = centerSize * 0.08;

      ctx.beginPath();
      ctx.arc(cx, cy + 4, r1, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + 4, r2, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + 4, r3, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (centerIcon === 'shield') {
      const sw = centerSize * 0.45;
      const sh = centerSize * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sh / 2);
      ctx.lineTo(cx + sw / 2, cy - sh / 3);
      ctx.lineTo(cx + sw / 2, cy + sh / 6);
      ctx.quadraticCurveTo(cx + sw / 2, cy + sh / 2, cx, cy + sh / 2);
      ctx.quadraticCurveTo(cx - sw / 2, cy + sh / 2, cx - sw / 2, cy + sh / 6);
      ctx.lineTo(cx - sw / 2, cy - sh / 3);
      ctx.closePath();
      ctx.stroke();
    } else if (centerIcon === 'lock') {
      const lw = centerSize * 0.4;
      const lh = centerSize * 0.35;
      ctx.beginPath();
      ctx.roundRect(cx - lw / 2, cy - lh / 4, lw, lh, 4);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy - lh / 4, lw * 0.35, Math.PI, 0);
      ctx.stroke();
    } else if (centerIcon === 'star') {
      const outerR = centerSize * 0.3;
      const innerR = centerSize * 0.15;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const xPos = cx + outerR * Math.cos(angle);
        const yPos = cy + outerR * Math.sin(angle);
        if (i === 0) ctx.moveTo(xPos, yPos);
        else ctx.lineTo(xPos, yPos);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Downloads a canvas element as PNG image.
 */
export function downloadCanvasImage(canvas: HTMLCanvasElement, filename: string): void {
  const image = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = image;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generates an SVG string representation of the QR code.
 */
export async function generateQrSvg(text: string, options: QrCustomization): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    width: options.size,
    margin: options.margin,
    color: {
      dark: options.fgColor,
      light: options.bgColor,
    },
    errorCorrectionLevel: options.errorCorrectionLevel,
  });
}
