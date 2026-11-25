'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronDown,
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
import { getBuiltInGoogleClientId, isNativeMobile } from '@/lib/sync/googleAuth';
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
  const [showAdvancedOAuth, setShowAdvancedOAuth] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionState>('default');
  const [connecting, setConnecting] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const builtInClientId = getBuiltInGoogleClientId();
  const effectiveClientId = (clientId || builtInClientId).trim();

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setBackupNotice(null);
    void reminderScheduler.getPermissionAsync().then(setNotifPerm);
    void metaRepository.getSyncSettings().then((s) => {
      const resolved = s.clientId || getBuiltInGoogleClientId();
      setClientId(resolved);
      setShowAdvancedOAuth(!resolved);
    });

    const bridge = typeof window !== 'undefined' ? window.yeobaekDesktop : undefined;
    if (bridge?.isDesktop) {
      void bridge.getVersion().then(setDesktopVersion);
      return bridge.onUpdateStatus(setUpdateStatus);
    }
  }, [open]);

  const handleConnect = async () => {
    setLocalError(null);
    if (!effectiveClientId) {
      setShowAdvancedOAuth(true);
      setLocalError(
        '이 빌드에는 Google OAuth Client ID가 아직 내장되어 있지 않습니다. 아래 고급 설정에서 입력하거나 환경변수에 등록해 주세요.'
      );
      return;
    }

    setConnecting(true);
    try {
      await driveSyncEngine.connect(effectiveClientId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.');
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
                    GOOGLE DRIVE 동기화
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
                          title="로그아웃"
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
                  <div className="space-y-3.5 rounded-xl border border-hairline bg-paper-subtle/50 p-4">
                    <p className="text-xs leading-relaxed text-ink-secondary">
                      Google 계정으로 로그인하면 내 Google Drive 앱 전용 공간에 변경된 글만 자동
                      동기화됩니다. PC와 모바일 간 별도 서버 없이 안전하게 이어 쓸 수 있습니다.
                    </p>

                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => void handleConnect()}
                      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-hairline bg-paper-elevated px-4 py-2.5 text-xs font-medium text-ink shadow-sm transition-colors hover:border-ink-secondary hover:bg-paper disabled:opacity-50"
                    >
                      {connecting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-ink-secondary" />
                      ) : (
                        <GoogleMark />
                      )}
                      <span>Google 계정으로 로그인</span>
                    </button>

                    {/* Developer / Self-host OAuth Client ID disclosure */}
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedOAuth((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink-secondary"
                      >
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${
                            showAdvancedOAuth ? 'rotate-180' : ''
                          }`}
                        />
                        <span>개발자 설정 (OAuth Client ID)</span>
                      </button>

                      {showAdvancedOAuth && (
                        <div className="mt-2.5 space-y-1.5 rounded-lg border border-hairline/80 bg-paper p-3">
                          <label
                            htmlFor="google-client-id"
                            className="block text-[11px] font-medium text-ink-secondary"
                          >
                            {isNativeMobile()
                              ? '모바일 OAuth 2.0 Client ID (Android / iOS)'
                              : '웹 OAuth 2.0 Client ID'}
                          </label>
                          <input
                            id="google-client-id"
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="xxxx.apps.googleusercontent.com"
                            className="w-full rounded-lg border border-hairline bg-paper-elevated px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-ink-secondary focus:outline-none"
                          />
                          <p className="text-[11px] text-ink-muted">
                            GitHub Secrets 또는 <code>.env.local</code>에 Client ID를 등록해
                            빌드하면 이 입력 없이 버튼만으로 로그인됩니다.
                          </p>
                        </div>
                      )}
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

              {/* Notifications Section */}
              <section className="space-y-2.5 border-t border-hairline pt-5">
                <h3 className="text-xs font-medium tracking-wide text-ink-muted">리마인더 알림</h3>
                <div className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Bell className="h-4 w-4 text-ink-secondary" strokeWidth={1.6} />
                    <div>
                      <p className="text-xs font-medium text-ink">
                        {isNativeMobile() ? '기기 알림 권한' : '브라우저 알림 권한'}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {notifPerm === 'granted'
                          ? isNativeMobile()
                            ? '허용됨 · 앱이 꺼져 있어도 예약 시각에 알림을 보냅니다'
                            : '허용됨 · 설정한 리마인더 시각에 알림을 보냅니다'
                          : notifPerm === 'denied'
                            ? '차단됨 · 기기/브라우저 설정에서 알림을 허용해 주세요'
                            : notifPerm === 'unsupported'
                              ? '시스템 알림을 지원하지 않습니다 (앱 내 배너 사용)'
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

function GoogleMark() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
