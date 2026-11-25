import { getDb } from './dexie';
import type { NoteItem, NoteItemType, Story, SyncIndex, SyncSettings } from '@/types/models';
import { addDays, getTodayString } from '@/lib/utils/date';

type MutationListener = () => void;
const mutationListeners = new Set<MutationListener>();

export function subscribeToLocalMutations(listener: MutationListener): () => void {
  mutationListeners.add(listener);
  return () => {
    mutationListeners.delete(listener);
  };
}

function notifyLocalMutation(): void {
  mutationListeners.forEach((listener) => listener());
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

const META_KEYS = {
  SEEDED: 'app_seeded_v1',
  LAST_SYNC_INDEX: 'last_sync_index',
  SYNC_SETTINGS: 'sync_settings',
  LAST_SYNCED_AT: 'last_synced_at',
  NOTIFIED_REMINDERS: 'notified_reminders',
  THEME: 'app_theme',
} as const;

export const metaRepository = {
  async get<T>(key: string): Promise<T | undefined> {
    const db = getDb();
    const record = await db.meta.get(key);
    return record?.value as T | undefined;
  },

  async set<T>(key: string, value: T): Promise<void> {
    const db = getDb();
    await db.meta.put({ key, value });
  },

  async getSyncSettings(): Promise<SyncSettings> {
    const saved = await this.get<SyncSettings>(META_KEYS.SYNC_SETTINGS);
    return {
      clientId: saved?.clientId ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      autoSync: saved?.autoSync ?? true,
      userEmail: saved?.userEmail,
      userName: saved?.userName,
      connectedAt: saved?.connectedAt,
    };
  },

  async saveSyncSettings(patch: Partial<SyncSettings>): Promise<SyncSettings> {
    const current = await this.getSyncSettings();
    const next = { ...current, ...patch };
    await this.set(META_KEYS.SYNC_SETTINGS, next);
    return next;
  },

  async getLastSyncIndex(): Promise<SyncIndex | undefined> {
    return this.get<SyncIndex>(META_KEYS.LAST_SYNC_INDEX);
  },

  async saveLastSyncIndex(index: SyncIndex): Promise<void> {
    await this.set(META_KEYS.LAST_SYNC_INDEX, index);
    await this.set(META_KEYS.LAST_SYNCED_AT, index.updatedAt);
  },

  async getLastSyncedAt(): Promise<number | undefined> {
    return this.get<number>(META_KEYS.LAST_SYNCED_AT);
  },

  async getNotifiedReminders(): Promise<Record<string, string>> {
    return (await this.get<Record<string, string>>(META_KEYS.NOTIFIED_REMINDERS)) ?? {};
  },

  async markReminderNotified(noteId: string, reminderAt: string): Promise<void> {
    const map = await this.getNotifiedReminders();
    map[noteId] = reminderAt;
    await this.set(META_KEYS.NOTIFIED_REMINDERS, map);
  },
};

export const storyRepository = {
  async listActive(): Promise<Story[]> {
    const db = getDb();
    const all = await db.stories.orderBy('order').toArray();
    return all.filter((s) => !s.isDeleted);
  },

  async listAllIncludingDeleted(): Promise<Story[]> {
    const db = getDb();
    return db.stories.toArray();
  },

  async getById(id: string): Promise<Story | undefined> {
    const db = getDb();
    return db.stories.get(id);
  },

  async create(title: string): Promise<Story> {
    const db = getDb();
    const existing = await this.listActive();
    const maxOrder = existing.reduce((max, s) => Math.max(max, s.order), -1);
    const now = Date.now();
    const story: Story = {
      id: generateId(),
      title: title.trim() || '새 이야기',
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await db.stories.put(story);
    notifyLocalMutation();
    return story;
  },

  async rename(id: string, title: string): Promise<void> {
    const db = getDb();
    const trimmed = title.trim();
    if (!trimmed) return;
    await db.stories.update(id, {
      title: trimmed,
      updatedAt: Date.now(),
    });
    notifyLocalMutation();
  },

  async reorder(orderedIds: string[]): Promise<void> {
    const db = getDb();
    const now = Date.now();
    await db.transaction('rw', db.stories, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.stories.update(orderedIds[i], { order: i, updatedAt: now });
      }
    });
    notifyLocalMutation();
  },

  async softDelete(id: string): Promise<void> {
    const db = getDb();
    const now = Date.now();
    await db.transaction('rw', [db.stories, db.notes], async () => {
      await db.stories.update(id, { isDeleted: true, updatedAt: now });
      const childNotes = await db.notes.where('storyId').equals(id).toArray();
      for (const note of childNotes) {
        if (!note.isDeleted) {
          await db.notes.update(note.id, { isDeleted: true, updatedAt: now });
        }
      }
    });
    notifyLocalMutation();
  },

  async upsertFromSync(story: Story): Promise<void> {
    const db = getDb();
    await db.stories.put(story);
  },
};

export interface CreateNoteInput {
  storyId: string;
  type?: NoteItemType;
  title?: string;
  content?: string;
  targetDate?: string;
  startTime?: string;
  endTime?: string;
  isCompleted?: boolean;
  reminderAt?: string;
}

export const noteRepository = {
  async listByStory(storyId: string): Promise<NoteItem[]> {
    const db = getDb();
    const rows = await db.notes.where('storyId').equals(storyId).toArray();
    return rows
      .filter((n) => !n.isDeleted)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async listAllActive(): Promise<NoteItem[]> {
    const db = getDb();
    const rows = await db.notes.toArray();
    return rows
      .filter((n) => !n.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async listAllIncludingDeleted(): Promise<NoteItem[]> {
    const db = getDb();
    return db.notes.toArray();
  },

  async getById(id: string): Promise<NoteItem | undefined> {
    const db = getDb();
    return db.notes.get(id);
  },

  async create(input: CreateNoteInput): Promise<NoteItem> {
    const db = getDb();
    const now = Date.now();
    const type: NoteItemType = input.type ?? 'note';
    const note: NoteItem = {
      id: generateId(),
      storyId: input.storyId,
      type,
      title: input.title ?? '',
      content:
        input.content ??
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      targetDate: input.targetDate,
      startTime: input.startTime,
      endTime: input.endTime,
      isCompleted: type === 'task' ? (input.isCompleted ?? false) : input.isCompleted,
      reminderAt: input.reminderAt,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await db.notes.put(note);
    notifyLocalMutation();
    return note;
  },

  async update(
    id: string,
    patch: Partial<Omit<NoteItem, 'id' | 'createdAt'>>
  ): Promise<void> {
    const db = getDb();
    await db.notes.update(id, {
      ...patch,
      updatedAt: Date.now(),
    });
    notifyLocalMutation();
  },

  async toggleComplete(id: string): Promise<void> {
    const db = getDb();
    const item = await db.notes.get(id);
    if (!item) return;
    await db.notes.update(id, {
      isCompleted: !item.isCompleted,
      updatedAt: Date.now(),
    });
    notifyLocalMutation();
  },

  async softDelete(id: string): Promise<void> {
    const db = getDb();
    await db.notes.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });
    notifyLocalMutation();
  },

  async upsertFromSync(note: NoteItem): Promise<void> {
    const db = getDb();
    await db.notes.put(note);
  },

  async createConflictCopy(note: NoteItem): Promise<NoteItem> {
    const db = getDb();
    const now = Date.now();
    const baseTitle = note.title.trim() || '제목 없는 글';
    const copy: NoteItem = {
      ...note,
      id: generateId(),
      title: `${baseTitle} (충돌 사본)`,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await db.notes.put(copy);
    return copy;
  },
};

export async function exportLocalBackup(): Promise<{
  exportedAt: number;
  version: 1;
  stories: Story[];
  notes: NoteItem[];
}> {
  const [stories, notes] = await Promise.all([
    storyRepository.listAllIncludingDeleted(),
    noteRepository.listAllIncludingDeleted(),
  ]);
  return {
    exportedAt: Date.now(),
    version: 1,
    stories,
    notes,
  };
}

export async function importLocalBackup(payload: {
  stories?: Story[];
  notes?: NoteItem[];
}): Promise<{ storiesCount: number; notesCount: number }> {
  const db = getDb();
  const stories = Array.isArray(payload.stories) ? payload.stories : [];
  const notes = Array.isArray(payload.notes) ? payload.notes : [];

  await db.transaction('rw', [db.stories, db.notes], async () => {
    for (const s of stories) {
      if (s && typeof s.id === 'string' && typeof s.title === 'string') {
        await db.stories.put(s);
      }
    }
    for (const n of notes) {
      if (n && typeof n.id === 'string' && typeof n.storyId === 'string') {
        await db.notes.put(n);
      }
    }
  });

  notifyLocalMutation();
  return { storiesCount: stories.length, notesCount: notes.length };
}

export async function ensureSeedData(): Promise<void> {
  const db = getDb();
  const seeded = await metaRepository.get<boolean>(META_KEYS.SEEDED);
  if (seeded) return;

  const existingStories = await db.stories.count();
  if (existingStories > 0) {
    await metaRepository.set(META_KEYS.SEEDED, true);
    return;
  }

  const now = Date.now();
  const today = getTodayString();
  const tomorrow = addDays(today, 1);

  const storyDaily: Story = {
    id: generateId(),
    title: '일상',
    order: 0,
    createdAt: now - 4000,
    updatedAt: now - 4000,
    isDeleted: false,
  };
  const storyMemo: Story = {
    id: generateId(),
    title: '메모',
    order: 1,
    createdAt: now - 3000,
    updatedAt: now - 3000,
    isDeleted: false,
  };
  const storyTodo: Story = {
    id: generateId(),
    title: '할 일',
    order: 2,
    createdAt: now - 2000,
    updatedAt: now - 2000,
    isDeleted: false,
  };
  const storyIdea: Story = {
    id: generateId(),
    title: '아이디어',
    order: 3,
    createdAt: now - 1000,
    updatedAt: now - 1000,
    isDeleted: false,
  };

  const welcomeDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '방해 요소 없는 하얀 여백 위에 생각과 하루의 흐름을 차분히 적어 내려가 보세요.',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '줄 맨 앞에서 ',
          },
          {
            type: 'text',
            marks: [{ type: 'code' }],
            text: '- [ ] ',
          },
          {
            type: 'text',
            text: '를 입력하면 바로 체크리스트가 만들어지고, 본문에 ',
          },
          {
            type: 'text',
            marks: [{ type: 'code' }],
            text: '@오늘',
          },
          {
            type: 'text',
            text: ' 또는 ',
          },
          {
            type: 'text',
            marks: [{ type: 'code' }],
            text: '@내일',
          },
          {
            type: 'text',
            text: '을 적으면 캘린더 날짜를 손쉽게 연결할 수 있습니다.',
          },
        ],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '상단 탭에서 새 이야기(Story) 만들어 보기' }],
              },
            ],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '우측 상단 구름 아이콘에서 Google Drive 동기화 연결하기' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const sampleTaskDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '할 일 유형으로 작성한 글은 모든 이야기에 흩어져 있어도 상단의 To-do 뷰에서 한눈에 모아볼 수 있습니다.',
          },
        ],
      },
    ],
  };

  const sampleEventDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '조용한 카페에서 한 주를 돌아보고 다음 주 계획을 천천히 정리하는 시간.',
          },
        ],
      },
    ],
  };

  const notes: NoteItem[] = [
    {
      id: generateId(),
      storyId: storyDaily.id,
      type: 'note',
      title: '여백에 오신 것을 환영합니다',
      content: JSON.stringify(welcomeDoc),
      targetDate: today,
      createdAt: now - 300,
      updatedAt: now - 300,
      isDeleted: false,
    },
    {
      id: generateId(),
      storyId: storyTodo.id,
      type: 'task',
      title: '오늘의 가장 중요한 일 한 가지 마무리하기',
      content: JSON.stringify(sampleTaskDoc),
      targetDate: today,
      isCompleted: false,
      createdAt: now - 200,
      updatedAt: now - 200,
      isDeleted: false,
    },
    {
      id: generateId(),
      storyId: storyDaily.id,
      type: 'event',
      title: '주간 회고 및 독서 시간',
      content: JSON.stringify(sampleEventDoc),
      targetDate: tomorrow,
      startTime: '19:00',
      endTime: '20:30',
      createdAt: now - 100,
      updatedAt: now - 100,
      isDeleted: false,
    },
  ];

  await db.transaction('rw', [db.stories, db.notes, db.meta], async () => {
    await db.stories.bulkPut([storyDaily, storyMemo, storyTodo, storyIdea]);
    await db.notes.bulkPut(notes);
    await db.meta.put({ key: META_KEYS.SEEDED, value: true });
  });
}
