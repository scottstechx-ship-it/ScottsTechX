export type SecurityType = 'WPA' | 'WEP' | 'nopass';

export interface WifiConfig {
  ssid: string;
  password: string;
  security: SecurityType;
  hidden: boolean;
  notes?: string;
}

export interface QrCustomization {
  fgColor: string;
  bgColor: string;
  size: number;
  margin: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  centerIcon: 'wifi' | 'shield' | 'star' | 'lock' | 'none';
  cardTitle: string;
  cardSubtitle: string;
}

export interface SavedNetwork extends WifiConfig {
  id: string;
  createdAt: number;
  updatedAt: number;
  customization?: Partial<QrCustomization>;
}
