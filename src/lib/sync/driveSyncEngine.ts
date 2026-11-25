'use client';

import {
  clearLocalSeedBeforeInitialPull,
  deduplicateSeedArtifacts,
  isLocalOnlyUntouchedSeed,
  metaRepository,
  noteRepository,
  SEED_TIMESTAMP,
  storyRepository,
  subscribeToLocalMutations,
} from '@/lib/db/repository';
import {
  getBuiltInGoogleClientId,
  googleAuthManager,
  isNativeMobile,
} from './googleAuth';
import type {
  NoteItem,
  Story,
  SyncIndex,
  SyncIndexEntry,
  SyncStatus,
  SyncSummary,
} from '@/types/models';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const SYNC_INDEX_FILENAME = 'sync_index.json';
const DEBOUNCE_MS = 4000;

export interface SyncStateSnapshot {
  status: SyncStatus;
  lastSyncedAt?: number;
  lastSummary?: SyncSummary;
  errorMessage?: string;
  isConnected: boolean;
  userEmail?: string;
  userName?: string;
}

type SyncStateListener = (snapshot: SyncStateSnapshot) => void;

interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
}

function emptyIndex(): SyncIndex {
  return {
    version: 1,
    updatedAt: 0,
    stories: {},
    notes: {},
  };
}

class DriveSyncEngine {
  private state: SyncStateSnapshot = {
    status: 'disconnected',
    isConnected: false,
  };
  private listeners = new Set<SyncStateListener>();
  private debounceTimer: number | null = null;
  private isRunning = false;
  private initialized = false;
  private unsubLocal: (() => void) | null = null;

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SyncStateSnapshot {
    return this.state;
  }

  private emit(patch: Partial<SyncStateSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async init(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const [settings, lastSyncedAt, savedRefreshToken] = await Promise.all([
      metaRepository.getSyncSettings(),
      metaRepository.getLastSyncedAt(),
      metaRepository.getMobileRefreshToken(),
    ]);

    const resolvedClientId = getBuiltInGoogleClientId().trim();

    if (isNativeMobile() && savedRefreshToken && resolvedClientId && navigator.onLine) {
      await googleAuthManager.refreshAccessToken(resolvedClientId, savedRefreshToken);
    }

    const connected = Boolean(
      (settings.userEmail || savedRefreshToken) && googleAuthManager.hasValidToken()
    );
    this.emit({
      isConnected: connected,
      userEmail: settings.userEmail,
      userName: settings.userName,
      lastSyncedAt,
      status: !navigator.onLine ? 'offline' : connected ? 'synced' : 'disconnected',
    });

    if (connected && navigator.onLine) {
      void this.syncNow({ interactive: false });
    }

    this.unsubLocal = subscribeToLocalMutations(() => {
      this.scheduleAutoSync();
    });

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  destroy(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.unsubLocal?.();
    this.unsubLocal = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.initialized = false;
  }

  private handleOnline = (): void => {
    if (googleAuthManager.hasValidToken()) {
      this.scheduleAutoSync();
    } else {
      this.emit({ status: 'disconnected' });
    }
  };

  private handleOffline = (): void => {
    this.emit({ status: 'offline' });
  };

  scheduleAutoSync(): void {
    if (typeof window === 'undefined') return;
    if (!navigator.onLine) {
      this.emit({ status: 'offline' });
      return;
    }
    if (!googleAuthManager.hasValidToken()) {
      return;
    }

    this.emit({ status: 'pending', errorMessage: undefined });

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow({ interactive: false });
    }, DEBOUNCE_MS);
  }

  async connect(): Promise<void> {
    const resolvedClientId = getBuiltInGoogleClientId().trim();
    if (!resolvedClientId) {
      throw new Error('이 빌드에는 Google 동기화 설정이 포함되어 있지 않습니다.');
    }

    const { accessToken, refreshToken } = await googleAuthManager.requestToken(
      resolvedClientId,
      'select_account'
    );
    if (refreshToken) {
      await metaRepository.saveMobileRefreshToken(refreshToken);
    }
    const info = await googleAuthManager.fetchUserInfo(accessToken);

    await metaRepository.saveSyncSettings({
      userEmail: info.email,
      userName: info.name,
      connectedAt: Date.now(),
    });

    this.emit({
      isConnected: true,
      userEmail: info.email,
      userName: info.name,
      errorMessage: undefined,
    });

    await this.syncNow({ interactive: false });
  }

  async disconnect(): Promise<void> {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    googleAuthManager.signOut();
    await metaRepository.saveMobileRefreshToken(undefined);
    await metaRepository.saveSyncSettings({
      userEmail: undefined,
      userName: undefined,
      connectedAt: undefined,
    });
    this.emit({
      isConnected: false,
      userEmail: undefined,
      userName: undefined,
      status: 'disconnected',
      errorMessage: undefined,
    });
  }

  async syncNow(options: { interactive?: boolean } = {}): Promise<SyncSummary | null> {
    if (typeof window === 'undefined') return null;
    if (!navigator.onLine) {
      this.emit({ status: 'offline', errorMessage: '오프라인 상태입니다. 로컬에 안전하게 저장되었습니다.' });
      return null;
    }
    if (this.isRunning) return null;

    const settings = await metaRepository.getSyncSettings();
    const resolvedClientId = getBuiltInGoogleClientId().trim();
    let token = googleAuthManager.getAccessToken();

    if (!token && isNativeMobile() && resolvedClientId) {
      const savedRefresh = await metaRepository.getMobileRefreshToken();
      if (savedRefresh) {
        token = await googleAuthManager.refreshAccessToken(resolvedClientId, savedRefresh);
      }
    }

    if (!token) {
      if (!options.interactive) {
        this.emit({ isConnected: false, status: 'disconnected' });
        return null;
      }
      if (!resolvedClientId) {
        this.emit({
          status: 'error',
          errorMessage: 'Google Client ID가 설정되어 있지 않습니다.',
        });
        return null;
      }
      try {
        const result = await googleAuthManager.requestToken(resolvedClientId, '');
        token = result.accessToken;
        if (result.refreshToken) {
          await metaRepository.saveMobileRefreshToken(result.refreshToken);
        }
        const info = await googleAuthManager.fetchUserInfo(token);
        await metaRepository.saveSyncSettings({
          userEmail: info.email ?? settings.userEmail,
          userName: info.name ?? settings.userName,
          connectedAt: Date.now(),
        });
        this.emit({
          isConnected: true,
          userEmail: info.email ?? settings.userEmail,
          userName: info.name ?? settings.userName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.';
        this.emit({ status: 'error', errorMessage: message });
        return null;
      }
    }

    this.isRunning = true;
    this.emit({ status: 'syncing', errorMessage: undefined });

    try {
      const summary = await this.performDiffSync(token);
      this.emit({
        status: 'synced',
        isConnected: true,
        lastSyncedAt: summary.syncedAt,
        lastSummary: summary,
        errorMessage: undefined,
      });
      return summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.';
      this.emit({ status: 'error', errorMessage: message });
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 3-way metadata index diff sync against Google Drive appDataFolder:
   * - Fetches sync_index.json first to minimize API calls and traffic
   * - Uploads/downloads only changed story_<id>.json and note_<id>.json files
   * - On concurrent offline edits (both local & remote changed since lastSyncIndex),
   *   keeps the newer updatedAt version and saves the older version as "(충돌 사본)"
   */
  private async performDiffSync(token: string): Promise<SyncSummary> {
    const lastSyncIndex = await metaRepository.getLastSyncIndex();
    const baseIndex = lastSyncIndex ?? emptyIndex();
    const remoteIndexMeta = await this.findAppDataFile(token, SYNC_INDEX_FILENAME);
    const remoteIndex: SyncIndex = remoteIndexMeta
      ? (await this.downloadJson<SyncIndex>(token, remoteIndexMeta.id)) ?? emptyIndex()
      : emptyIndex();

    // On a brand-new device's first sync, discard untouched local onboarding seed data
    // when Google Drive already has remote stories so default stories never duplicate.
    const hasRemoteStories = Object.keys(remoteIndex.stories).length > 0;
    if (!lastSyncIndex && hasRemoteStories && (await isLocalOnlyUntouchedSeed())) {
      await clearLocalSeedBeforeInitialPull();
    }

    const [localStories, localNotes] = await Promise.all([
      storyRepository.listAllIncludingDeleted(),
      noteRepository.listAllIncludingDeleted(),
    ]);

    const mergedIndex: SyncIndex = {
      version: 1,
      updatedAt: Date.now(),
      stories: { ...remoteIndex.stories },
      notes: { ...remoteIndex.notes },
    };

    let uploaded = 0;
    let downloaded = 0;
    let conflicts = 0;

    // 1. Sync Stories
    const localStoryMap = new Map<string, Story>(localStories.map((s) => [s.id, s]));
    const allStoryIds = new Set<string>([
      ...localStoryMap.keys(),
      ...Object.keys(remoteIndex.stories),
    ]);

    for (const id of allStoryIds) {
      const local = localStoryMap.get(id);
      const remoteEntry = remoteIndex.stories[id];
      const baseEntry = baseIndex.stories[id];
      const filename = `story_${id}.json`;

      const isUntouchedSeed = Boolean(local && local.updatedAt <= SEED_TIMESTAMP + 5000);
      const localChanged = Boolean(
        local &&
          (!baseEntry
            ? !(isUntouchedSeed && remoteEntry)
            : local.updatedAt > baseEntry.updatedAt)
      );
      const remoteChanged = Boolean(
        remoteEntry && (!baseEntry || remoteEntry.updatedAt > baseEntry.updatedAt)
      );

      if (local && (!remoteEntry || (localChanged && !remoteChanged))) {
        const fileId = await this.upsertJsonFile(token, filename, local, remoteEntry?.fileId);
        mergedIndex.stories[id] = {
          updatedAt: local.updatedAt,
          isDeleted: local.isDeleted,
          fileId,
        };
        uploaded++;
      } else if (remoteEntry && (!local || (remoteChanged && !localChanged))) {
        const remoteStory = await this.downloadByEntry<Story>(token, filename, remoteEntry);
        if (remoteStory) {
          await storyRepository.upsertFromSync(remoteStory);
          mergedIndex.stories[id] = remoteEntry;
          downloaded++;
        }
      } else if (local && remoteEntry && localChanged && remoteChanged) {
        if (local.updatedAt >= remoteEntry.updatedAt) {
          const fileId = await this.upsertJsonFile(token, filename, local, remoteEntry.fileId);
          mergedIndex.stories[id] = {
            updatedAt: local.updatedAt,
            isDeleted: local.isDeleted,
            fileId,
          };
          uploaded++;
        } else {
          const remoteStory = await this.downloadByEntry<Story>(token, filename, remoteEntry);
          if (remoteStory) {
            await storyRepository.upsertFromSync(remoteStory);
            mergedIndex.stories[id] = remoteEntry;
            downloaded++;
          }
        }
      } else if (local && remoteEntry) {
        mergedIndex.stories[id] = remoteEntry;
      }
    }

    // 2. Sync Notes (with conflict copy preservation)
    const localNoteMap = new Map<string, NoteItem>(localNotes.map((n) => [n.id, n]));
    const allNoteIds = new Set<string>([
      ...localNoteMap.keys(),
      ...Object.keys(remoteIndex.notes),
    ]);

    for (const id of allNoteIds) {
      const local = localNoteMap.get(id);
      const remoteEntry = remoteIndex.notes[id];
      const baseEntry = baseIndex.notes[id];
      const filename = `note_${id}.json`;

      const isUntouchedSeedNote = Boolean(local && local.updatedAt <= SEED_TIMESTAMP + 5000);
      const localChanged = Boolean(
        local &&
          (!baseEntry
            ? !(isUntouchedSeedNote && remoteEntry)
            : local.updatedAt > baseEntry.updatedAt)
      );
      const remoteChanged = Boolean(
        remoteEntry && (!baseEntry || remoteEntry.updatedAt > baseEntry.updatedAt)
      );

      if (local && (!remoteEntry || (localChanged && !remoteChanged))) {
        const fileId = await this.upsertJsonFile(token, filename, local, remoteEntry?.fileId);
        mergedIndex.notes[id] = {
          updatedAt: local.updatedAt,
          isDeleted: local.isDeleted,
          fileId,
        };
        uploaded++;
      } else if (remoteEntry && (!local || (remoteChanged && !localChanged))) {
        const remoteNote = await this.downloadByEntry<NoteItem>(token, filename, remoteEntry);
        if (remoteNote) {
          await noteRepository.upsertFromSync(remoteNote);
          mergedIndex.notes[id] = remoteEntry;
          downloaded++;
        }
      } else if (local && remoteEntry && localChanged && remoteChanged) {
        // Concurrent offline edit on both devices -> keep newer as canonical, duplicate older as (충돌 사본)
        const remoteNote = await this.downloadByEntry<NoteItem>(token, filename, remoteEntry);
        if (remoteNote) {
          const sameContent =
            local.title === remoteNote.title &&
            local.content === remoteNote.content &&
            local.isCompleted === remoteNote.isCompleted &&
            local.targetDate === remoteNote.targetDate &&
            local.isDeleted === remoteNote.isDeleted;

          if (local.updatedAt >= remoteNote.updatedAt) {
            const fileId = await this.upsertJsonFile(token, filename, local, remoteEntry.fileId);
            mergedIndex.notes[id] = {
              updatedAt: local.updatedAt,
              isDeleted: local.isDeleted,
              fileId,
            };
            uploaded++;

            if (!sameContent && !remoteNote.isDeleted) {
              const conflictCopy = await noteRepository.createConflictCopy(remoteNote);
              const copyFileId = await this.upsertJsonFile(
                token,
                `note_${conflictCopy.id}.json`,
                conflictCopy
              );
              mergedIndex.notes[conflictCopy.id] = {
                updatedAt: conflictCopy.updatedAt,
                isDeleted: false,
                fileId: copyFileId,
              };
              uploaded++;
              conflicts++;
            }
          } else {
            await noteRepository.upsertFromSync(remoteNote);
            mergedIndex.notes[id] = remoteEntry;
            downloaded++;

            if (!sameContent && !local.isDeleted) {
              const conflictCopy = await noteRepository.createConflictCopy(local);
              const copyFileId = await this.upsertJsonFile(
                token,
                `note_${conflictCopy.id}.json`,
                conflictCopy
              );
              mergedIndex.notes[conflictCopy.id] = {
                updatedAt: conflictCopy.updatedAt,
                isDeleted: false,
                fileId: copyFileId,
              };
              uploaded++;
              conflicts++;
            }
          }
        }
      } else if (local && remoteEntry) {
        mergedIndex.notes[id] = remoteEntry;
      }
    }

    // 3. Self-heal any legacy duplicate default stories/welcome notes and propagate cleanup to Drive
    const { changedStories: cleanedStories, changedNotes: cleanedNotes } =
      await deduplicateSeedArtifacts();

    for (const story of cleanedStories) {
      const existingFileId = mergedIndex.stories[story.id]?.fileId;
      const fileId = await this.upsertJsonFile(
        token,
        `story_${story.id}.json`,
        story,
        existingFileId
      );
      mergedIndex.stories[story.id] = {
        updatedAt: story.updatedAt,
        isDeleted: story.isDeleted,
        fileId,
      };
      uploaded++;
    }

    for (const note of cleanedNotes) {
      const existingFileId = mergedIndex.notes[note.id]?.fileId;
      const fileId = await this.upsertJsonFile(
        token,
        `note_${note.id}.json`,
        note,
        existingFileId
      );
      mergedIndex.notes[note.id] = {
        updatedAt: note.updatedAt,
        isDeleted: note.isDeleted,
        fileId,
      };
      uploaded++;
    }

    // 4. Persist updated sync_index.json to Google Drive & local meta
    mergedIndex.updatedAt = Date.now();
    await this.upsertJsonFile(token, SYNC_INDEX_FILENAME, mergedIndex, remoteIndexMeta?.id);
    await metaRepository.saveLastSyncIndex(mergedIndex);

    return {
      uploaded,
      downloaded,
      conflicts,
      syncedAt: mergedIndex.updatedAt,
    };
  }

  private async findAppDataFile(token: string, name: string): Promise<DriveFileMeta | null> {
    const query = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and trashed=false`);
    const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&pageSize=1`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Google Drive 조회 실패 (${res.status})`);
    }
    const data = (await res.json()) as { files?: DriveFileMeta[] };
    return data.files?.[0] ?? null;
  }

  private async downloadJson<T>(token: string, fileId: string): Promise<T | null> {
    const res = await fetch(`${DRIVE_FILES_API}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Google Drive 파일 다운로드 실패 (${res.status})`);
    }
    return (await res.json()) as T;
  }

  private async downloadByEntry<T>(
    token: string,
    filename: string,
    entry: SyncIndexEntry
  ): Promise<T | null> {
    if (entry.fileId) {
      const direct = await this.downloadJson<T>(token, entry.fileId);
      if (direct) return direct;
    }
    const found = await this.findAppDataFile(token, filename);
    if (!found) return null;
    entry.fileId = found.id;
    return this.downloadJson<T>(token, found.id);
  }

  private async upsertJsonFile(
    token: string,
    filename: string,
    payload: unknown,
    existingFileId?: string
  ): Promise<string> {
    const jsonBody = JSON.stringify(payload);

    if (existingFileId) {
      const patchRes = await fetch(`${DRIVE_UPLOAD_API}/${existingFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonBody,
      });
      if (patchRes.ok) {
        return existingFileId;
      }
      if (patchRes.status !== 404) {
        throw new Error(`Google Drive 파일 업데이트 실패 (${patchRes.status})`);
      }
    }

    // Create new file inside appDataFolder via multipart upload
    const boundary = `yeobaek_sync_${Date.now()}`;
    const metadata = JSON.stringify({
      name: filename,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    });

    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      jsonBody,
      `--${boundary}--`,
    ].join('\r\n');

    const createRes = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!createRes.ok) {
      throw new Error(`Google Drive 파일 업로드 실패 (${createRes.status})`);
    }
    const created = (await createRes.json()) as { id: string };
    return created.id;
  }
}

export const driveSyncEngine = new DriveSyncEngine();
