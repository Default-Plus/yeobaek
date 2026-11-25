'use client';

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DEFAULT_MOBILE_REDIRECT_URI = 'app.defaultplus.yeobaek:/oauth2redirect';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
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

export interface AuthTokenResult {
  accessToken: string;
  refreshToken?: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function isNativeMobile(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

export function getBuiltInGoogleClientId(): string {
  if (isNativeMobile()) {
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      return (
        process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        ''
      );
    }
    if (platform === 'ios') {
      return (
        process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        ''
      );
    }
  }
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
}

function resolveMobileRedirectUri(clientId: string): string {
  if (process.env.NEXT_PUBLIC_GOOGLE_MOBILE_REDIRECT_URI) {
    return process.env.NEXT_PUBLIC_GOOGLE_MOBILE_REDIRECT_URI;
  }
  // Google iOS/Android native OAuth clients accept reversed client ID scheme or app custom scheme
  if (
    Capacitor.getPlatform() === 'ios' &&
    clientId.endsWith('.apps.googleusercontent.com')
  ) {
    const prefix = clientId.replace('.apps.googleusercontent.com', '');
    return `com.googleusercontent.apps.${prefix}:/oauth2redirect`;
  }
  return DEFAULT_MOBILE_REDIRECT_URI;
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
  ): Promise<AuthTokenResult> {
    const trimmed = clientId.trim();
    if (!trimmed) {
      throw new Error('Google OAuth Client ID가 설정되어 있지 않습니다.');
    }

    if (isNativeMobile()) {
      return this.requestMobilePkceToken(trimmed);
    }

    const token = await this.requestWebGisToken(trimmed, prompt);
    return { accessToken: token };
  }

  private async requestWebGisToken(
    clientId: string,
    prompt: '' | 'consent' | 'select_account'
  ): Promise<string> {
    await this.loadGisScript();
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google OAuth 클라이언트를 초기화할 수 없습니다.');
    }

    return new Promise<string>((resolve, reject) => {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPES,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(
              new Error(
                response.error_description || response.error || 'Google 로그인이 취소되었습니다.'
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
          reject(new Error(err.message || `Google 로그인 팝업 오류 (${err.type})`));
        },
      });

      tokenClient.requestAccessToken({ prompt });
    });
  }

  /**
   * RFC 7636 OAuth 2.0 Authorization Code + PKCE flow for Android & iOS via system browser
   * (Chrome Custom Tabs / ASWebAuthenticationSession). Returns access_token + refresh_token.
   */
  private async requestMobilePkceToken(clientId: string): Promise<AuthTokenResult> {
    const codeVerifier = generateRandomToken(48);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomToken(24);
    const redirectUri = resolveMobileRedirectUri(clientId);

    const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', DRIVE_SCOPES);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account consent');

    const callbackUrl = await new Promise<string>((resolve, reject) => {
      let settled = false;
      let urlListenerHandle: { remove: () => Promise<void> } | null = null;
      let browserFinishedHandle: { remove: () => Promise<void> } | null = null;

      const cleanup = () => {
        void urlListenerHandle?.remove();
        void browserFinishedHandle?.remove();
      };

      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Google 로그인 시간이 초과되었습니다.'));
      }, 180_000);

      void App.addListener('appUrlOpen', (event) => {
        if (settled) return;
        if (!event.url.startsWith(redirectUri)) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();
        void Browser.close().catch(() => undefined);
        resolve(event.url);
      }).then((h) => {
        urlListenerHandle = h;
      });

      void Browser.addListener('browserFinished', () => {
        // Give appUrlOpen a brief moment to deliver the redirect before treating as cancel
        window.setTimeout(() => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          cleanup();
          reject(new Error('Google 로그인이 취소되었습니다.'));
        }, 700);
      }).then((h) => {
        browserFinishedHandle = h;
      });

      void Browser.open({ url: authUrl.toString(), presentationStyle: 'popover' }).catch((err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();
        reject(err instanceof Error ? err : new Error('시스템 브라우저를 열 수 없습니다.'));
      });
    });

    const parsed = new URL(callbackUrl);
    const returnedError = parsed.searchParams.get('error');
    if (returnedError) {
      throw new Error(`Google 로그인 오류: ${returnedError}`);
    }
    const returnedState = parsed.searchParams.get('state');
    if (returnedState !== state) {
      throw new Error('보안 검증(state)에 실패했습니다. 다시 시도해 주세요.');
    }
    const code = parsed.searchParams.get('code');
    if (!code) {
      throw new Error('인증 코드를 받지 못했습니다.');
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(
        tokenData.error_description || tokenData.error || 'Google 토큰 교환에 실패했습니다.'
      );
    }

    this.accessToken = tokenData.access_token;
    this.expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    };
  }

  async refreshAccessToken(clientId: string, refreshToken: string): Promise<string | null> {
    const trimmed = clientId.trim();
    if (!trimmed || !refreshToken) return null;

    try {
      const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: trimmed,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as GoogleTokenResponse;
      if (!data.access_token) return null;

      this.accessToken = data.access_token;
      this.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      return data.access_token;
    } catch {
      return null;
    }
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

    if (!token) return;
    if (isNativeMobile()) {
      void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      }).catch(() => undefined);
    } else if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(token);
      } catch {
        // Ignore revoke errors
      }
    }
  }
}

export const googleAuthManager = new GoogleAuthManager();
