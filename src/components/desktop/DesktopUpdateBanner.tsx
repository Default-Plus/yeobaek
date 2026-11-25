'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, RotateCw, X } from 'lucide-react';
import type { DesktopUpdateStatus } from '@/types/desktop';

export function DesktopUpdateBanner() {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.yeobaekDesktop : undefined;
    if (!bridge?.isDesktop) return;

    const unsubscribe = bridge.onUpdateStatus((next) => {
      setStatus(next);
      if (next.phase === 'downloaded') {
        setDismissed(false);
      }
    });

    return unsubscribe;
  }, []);

  if (dismissed || !status) return null;
  if (status.phase !== 'downloading' && status.phase !== 'downloaded') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-2xl border border-hairline bg-paper-elevated px-4 py-3 text-xs shadow-lg"
      >
        {status.phase === 'downloading' ? (
          <>
            <Download className="h-3.5 w-3.5 text-ink-secondary" />
            <span className="text-ink-secondary">
              새 버전{status.version ? ` v${status.version}` : ''} 다운로드 중…{' '}
              {status.percent ?? 0}%
            </span>
          </>
        ) : (
          <>
            <RotateCw className="h-3.5 w-3.5 text-accent" />
            <span className="text-ink">
              새 버전{status.version ? ` v${status.version}` : ''} 준비 완료
            </span>
            <button
              type="button"
              onClick={() => void window.yeobaekDesktop?.installUpdate()}
              className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              지금 재시작
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="닫기"
              className="rounded-full p-1 text-ink-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
