'use client';

import { useEffect, useState } from 'react';

const APP_REDIRECT_BASE = 'app.defaultplus.yeobaek://oauth2redirect';

export default function MobileAuthCallbackPage() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('여백 앱으로 로그인 정보를 전달하는 중…');

  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const suffix = hash || search;

    if (!suffix) {
      setStatusMessage('전달할 인증 정보가 없습니다. 앱에서 다시 시도해 주세요.');
      return;
    }

    const target = `${APP_REDIRECT_BASE}${suffix}`;
    setDeepLink(target);
    window.location.replace(target);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-center text-ink">
      <div className="max-w-sm space-y-5">
        <p className="font-serif text-xl font-bold tracking-tight">여백</p>
        <p className="text-xs leading-relaxed text-ink-secondary">{statusMessage}</p>
        {deepLink && (
          <a
            href={deepLink}
            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-paper transition-opacity hover:opacity-90"
          >
            여백 앱으로 돌아가기
          </a>
        )}
      </div>
    </main>
  );
}
