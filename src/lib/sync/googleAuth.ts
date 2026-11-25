'use client';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: '' | 'consent' | 'select_account' }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }) => GoogleTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export interface GoogleUserInfo {
  email?: string;
  name?: string;
}

class GoogleAuthManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private scriptPromise: Promise<void> | null = null;

  private loadGisScript(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('브라우저 환경에서만 인증할 수 있습니다.'));
    }
    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GIS_SCRIPT_URL}"]`
      );
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Google Identity Services 스크립트를 불러오지 못했습니다.')),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptPromise = null;
        reject(new Error('Google Identity Services 스크립트를 불러오지 못했습니다.'));
      };
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }

  hasValidToken(): boolean {
    return Boolean(this.accessToken && Date.now() < this.expiresAt - 60_000);
  }

  getAccessToken(): string | null {
    return this.hasValidToken() ? this.accessToken : null;
  }

  async requestToken(
    clientId: string,
    prompt: '' | 'consent' | 'select_account' = 'select_account'
  ): Promise<string> {
    const trimmed = clientId.trim();
    if (!trimmed) {
      throw new Error('Google OAuth Client ID가 설정되어 있지 않습니다.');
    }

    await this.loadGisScript();
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google OAuth 클라이언트를 초기화할 수 없습니다.');
    }

    return new Promise<string>((resolve, reject) => {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: trimmed,
        scope: DRIVE_SCOPES,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(
              new Error(
                response.error_description || response.error || 'Google 인증이 취소되었습니다.'
              )
            );
            return;
          }
          this.accessToken = response.access_token;
          const expiresInSec = response.expires_in ?? 3600;
          this.expiresAt = Date.now() + expiresInSec * 1000;
          resolve(response.access_token);
        },
        error_callback: (err) => {
          reject(new Error(err.message || `Google 인증 팝업 오류 (${err.type})`));
        },
      });

      tokenClient.requestAccessToken({ prompt });
    });
  }

  async fetchUserInfo(token: string): Promise<GoogleUserInfo> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return {};
      const data = (await res.json()) as { email?: string; name?: string };
      return { email: data.email, name: data.name };
    } catch {
      return {};
    }
  }

  signOut(): void {
    const token = this.accessToken;
    this.accessToken = null;
    this.expiresAt = 0;
    if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(token);
      } catch {
        // Ignore revoke errors
      }
    }
  }
}

export const googleAuthManager = new GoogleAuthManager();
