export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateStatus {
  phase: DesktopUpdatePhase;
  version?: string;
  percent?: number;
  message?: string;
}

export interface YeobaekDesktopBridge {
  isDesktop: boolean;
  platform: string;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ ok: boolean; reason?: string }>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    yeobaekDesktop?: YeobaekDesktopBridge;
  }
}

export {};
