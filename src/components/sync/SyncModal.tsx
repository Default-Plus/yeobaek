'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Cloud,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCw,
  Upload,
  X,
} from 'lucide-react';
import type { DesktopUpdateStatus } from '@/types/desktop';
import {
  exportLocalBackup,
  importLocalBackup,
  metaRepository,
} from '@/lib/db/repository';
import { driveSyncEngine, type SyncStateSnapshot } from '@/lib/sync/driveSyncEngine';
import {
  reminderScheduler,
  type NotificationPermissionState,
} from '@/lib/notifications/reminderService';
import { formatTimestamp } from '@/lib/utils/date';

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  syncState: SyncStateSnapshot;
}

export function SyncModal({ open, onClose, syncState }: SyncModalProps) {
  const [clientId, setClientId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionState>('default');
  const [connecting, setConnecting] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setBackupNotice(null);
    setNotifPerm(reminderScheduler.getPermission());
    void metaRepository.getSyncSettings().then((s) => {
      setClientId(s.clientId);
    });

    const bridge = typeof window !== 'undefined' ? window.yeobaekDesktop : undefined;
    if (bridge?.isDesktop) {
      void bridge.getVersion().then(setDesktopVersion);
      return bridge.onUpdateStatus(setUpdateStatus);
    }
  }, [open]);

  const handleConnect = async () => {
    setLocalError(null);
    setConnecting(true);
    try {
      await driveSyncEngine.connect(clientId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google 연결에 실패했습니다.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setLocalError(null);
    await driveSyncEngine.syncNow({ interactive: true });
  };

  const handleDisconnect = async () => {
    setLocalError(null);
    await driveSyncEngine.disconnect();
  };

  const handleExport = async () => {
    const payload = await exportLocalBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yeobaek-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupNotice('로컬 백업 JSON 파일을 내보냈습니다.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { stories?: never[]; notes?: never[] };
      const { storiesCount, notesCount } = await importLocalBackup(parsed);
      setBackupNotice(`이야기 ${storiesCount}개, 글 ${notesCount}개를 복원했습니다.`);
    } catch {
      setLocalError('유효한 백업 JSON 파일이 아닙니다.');
    } finally {
      e.target.value = '';
    }
  };

  const handleRequestNotifications = async () => {
    const next = await reminderScheduler.requestPermission();
    setNotifPerm(next);
  };

  const errorToDisplay = localError || syncState.errorMessage;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/20 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-paper shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-ink-secondary" strokeWidth={1.7} />
                <h2 className="font-serif text-base font-bold text-ink">
                  동기화 · 백업 · 알림
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1 text-ink-muted transition-colors hover:bg-paper-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5 text-sm">
              {/* Google Drive Sync Section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium tracking-wide text-ink-muted">
                    GOOGLE DRIVE 동기화 (APPDATAFOLDER)
                  </h3>
                  {syncState.lastSyncedAt && (
                    <span className="text-[11px] text-ink-muted">
                      마지막 동기화: {formatTimestamp(syncState.lastSyncedAt)}
                    </span>
                  )}
                </div>

                {syncState.isConnected ? (
                  <div className="rounded-xl border border-hairline bg-paper-subtle/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-ink" />
                        <div>
                          <p className="text-xs font-medium text-ink">
                            {syncState.userName || 'Google 계정 연결됨'}
                          </p>
                          {syncState.userEmail && (
                            <p className="text-[11px] text-ink-muted">{syncState.userEmail}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={syncState.status === 'syncing'}
                          onClick={() => void handleSyncNow()}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {syncState.status === 'syncing' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span>지금 동기화</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDisconnect()}
                          title="연결 해제"
                          className="rounded-full p-1.5 text-ink-muted hover:bg-paper-elevated hover:text-accent"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {syncState.lastSummary && (
                      <p className="mt-3 border-t border-hairline/70 pt-2.5 text-[11px] text-ink-secondary">
                        업로드 {syncState.lastSummary.uploaded}건 · 다운로드{' '}
                        {syncState.lastSummary.downloaded}건
                        {syncState.lastSummary.conflicts > 0
                          ? ` · 충돌 사본 ${syncState.lastSummary.conflicts}건 생성됨`
                          : ' · 충돌 없음'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-hairline bg-paper-subtle/50 p-4">
                    <p className="text-xs leading-relaxed text-ink-secondary">
                      모든 글은 브라우저 로컬(IndexedDB)에 즉시 저장되며, Google Drive를 연결하면
                      수정 후 4초 뒤 변경된 항목만 인덱스 비교(sync_index.json)로 자동 동기화됩니다.
                    </p>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="google-client-id"
                        className="block text-[11px] font-medium text-ink-secondary"
                      >
                        Google OAuth 2.0 Client ID
                      </label>
                      <input
                        id="google-client-id"
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="xxxx.apps.googleusercontent.com"
                        className="w-full rounded-lg border border-hairline bg-paper-elevated px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-ink-secondary focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-ink-muted">
                        .env.local의 NEXT_PUBLIC_GOOGLE_CLIENT_ID로도 설정 가능
                      </span>
                      <button
                        type="button"
                        disabled={connecting || !clientId.trim()}
                        onClick={() => void handleConnect()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        <span>Google 연결</span>
                      </button>
                    </div>
                  </div>
                )}

                {errorToDisplay && (
                  <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-xs text-accent">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{errorToDisplay}</span>
                  </div>
                )}
              </section>

              {/* Web Notifications Section */}
              <section className="space-y-2.5 border-t border-hairline pt-5">
                <h3 className="text-xs font-medium tracking-wide text-ink-muted">리마인더 알림</h3>
                <div className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Bell className="h-4 w-4 text-ink-secondary" strokeWidth={1.6} />
                    <div>
                      <p className="text-xs font-medium text-ink">브라우저 알림 권한</p>
                      <p className="text-[11px] text-ink-muted">
                        {notifPerm === 'granted'
                          ? '허용됨 · 설정한 리마인더 시각에 알림을 보냅니다'
                          : notifPerm === 'denied'
                            ? '차단됨 · 브라우저 설정에서 알림을 허용해 주세요'
                            : notifPerm === 'unsupported'
                              ? '이 브라우저는 시스템 알림을 지원하지 않습니다 (앱 내 배너 사용)'
                              : '리마인더 알림을 받으려면 권한을 허용해 주세요'}
                      </p>
                    </div>
                  </div>
                  {notifPerm === 'default' && (
                    <button
                      type="button"
                      onClick={() => void handleRequestNotifications()}
                      className="rounded-full border border-hairline px-3 py-1 text-xs text-ink transition-colors hover:border-ink-secondary hover:bg-paper-subtle"
                    >
                      권한 허용
                    </button>
                  )}
                </div>
              </section>

              {/* Local JSON Backup Section */}
              <section className="space-y-2.5 border-t border-hairline pt-5">
                <h3 className="text-xs font-medium tracking-wide text-ink-muted">
                  로컬 파일 백업 (JSON)
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper-elevated px-3.5 py-2 text-xs text-ink transition-colors hover:border-ink-secondary hover:bg-paper-subtle"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>JSON 내보내기</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper-elevated px-3.5 py-2 text-xs text-ink transition-colors hover:border-ink-secondary hover:bg-paper-subtle"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>JSON 가져오기</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={(e) => void handleImportFile(e)}
                    className="hidden"
                  />
                </div>
                {backupNotice && <p className="text-xs text-ink-secondary">{backupNotice}</p>}
              </section>

              {/* Desktop App Auto-Update Section (Electron only) */}
              {desktopVersion && (
                <section className="space-y-2.5 border-t border-hairline pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium tracking-wide text-ink-muted">
                      데스크탑 앱 업데이트
                    </h3>
                    <span className="text-[11px] text-ink-muted">v{desktopVersion}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline px-4 py-3">
                    <div className="text-xs text-ink-secondary">
                      {updateStatus.phase === 'checking' && '새 버전을 확인하는 중…'}
                      {updateStatus.phase === 'available' &&
                        `새 버전(v${updateStatus.version})을 내려받는 중…`}
                      {updateStatus.phase === 'downloading' &&
                        `다운로드 중… ${updateStatus.percent ?? 0}%`}
                      {updateStatus.phase === 'downloaded' &&
                        `v${updateStatus.version} 준비 완료 · 재시작하면 적용됩니다`}
                      {updateStatus.phase === 'not-available' &&
                        (updateStatus.message || '현재 최신 버전입니다.')}
                      {updateStatus.phase === 'error' &&
                        (updateStatus.message || '업데이트 확인에 실패했습니다.')}
                      {updateStatus.phase === 'idle' &&
                        'GitHub Releases를 통해 최신 버전을 자동으로 확인합니다.'}
                    </div>

                    {updateStatus.phase === 'downloaded' ? (
                      <button
                        type="button"
                        onClick={() => void window.yeobaekDesktop?.installUpdate()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper hover:opacity-90"
                      >
                        <RotateCw className="h-3 w-3" />
                        <span>재시작 적용</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          updateStatus.phase === 'checking' ||
                          updateStatus.phase === 'downloading'
                        }
                        onClick={() => void window.yeobaekDesktop?.checkForUpdates()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs text-ink transition-colors hover:border-ink-secondary hover:bg-paper-subtle disabled:opacity-40"
                      >
                        {updateStatus.phase === 'checking' ||
                        updateStatus.phase === 'downloading' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        <span>확인</span>
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
