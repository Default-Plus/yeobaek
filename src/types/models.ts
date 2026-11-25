export interface Story {
  id: string; // UUID
  title: string; // 카테고리(이야기) 제목
  order: number; // 정렬 순서
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

export type NoteItemType = 'note' | 'task' | 'event';

export interface NoteItem {
  id: string; // UUID
  storyId: string; // 상위 Story ID
  type: NoteItemType;
  title: string;
  content: string; // Markdown 또는 Tiptap JSON 문자열

  // 캘린더 및 일정 속성 (선택)
  targetDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm

  // To-do 및 리마인더 속성 (선택)
  isCompleted?: boolean;
  reminderAt?: string; // ISO 8601 타임스탬프

  // 동기화 메타데이터
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean; // 동기화 시 삭제 전파를 위한 Soft Delete 플래그
}

export interface SyncIndexEntry {
  updatedAt: number;
  isDeleted: boolean;
  fileId?: string;
}

export interface SyncIndex {
  version: 1;
  updatedAt: number;
  stories: Record<string, SyncIndexEntry>;
  notes: Record<string, SyncIndexEntry>;
}

export type SyncStatus =
  | 'idle'
  | 'disconnected'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface SyncSummary {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  syncedAt: number;
}

export interface SyncSettings {
  autoSync: boolean;
  userEmail?: string;
  userName?: string;
  connectedAt?: number;
}

export type ActiveView = 'stories' | 'calendar' | 'todo';

export interface InlineTaskSummary {
  index: number;
  text: string;
  checked: boolean;
}
