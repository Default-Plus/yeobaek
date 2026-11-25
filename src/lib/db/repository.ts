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
  MOBILE_REFRESH_TOKEN: 'mobile_oauth_refresh_token',
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

  async getMobileRefreshToken(): Promise<string | undefined> {
    return this.get<string>(META_KEYS.MOBILE_REFRESH_TOKEN);
  },

  async saveMobileRefreshToken(token: string | undefined): Promise<void> {
    const db = getDb();
    if (!token) {
      await db.meta.delete(META_KEYS.MOBILE_REFRESH_TOKEN);
    } else {
      await db.meta.put({ key: META_KEYS.MOBILE_REFRESH_TOKEN, value: token });
    }
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

export const SEED_TIMESTAMP = 1_700_000_000_000;

export const SEED_STORY_IDS = {
  daily: 'seed-story-daily',
  memo: 'seed-story-memo',
  todo: 'seed-story-todo',
  idea: 'seed-story-idea',
} as const;

export const SEED_NOTE_IDS = {
  welcome: 'seed-note-welcome',
  sampleTask: 'seed-note-sample-task',
  sampleEvent: 'seed-note-sample-event',
} as const;

const DEFAULT_SEED_STORY_TITLES = new Set(['일상', '메모', '할 일', '아이디어']);
const DEFAULT_SEED_NOTE_TITLES = new Set([
  '여백에 오신 것을 환영합니다',
  '오늘의 가장 중요한 일 한 가지 마무리하기',
  '주간 회고 및 독서 시간',
]);

/**
 * Returns true if the local database only contains untouched initial onboarding seed data
 * (including legacy random-UUID seeds from versions prior to deterministic seed IDs).
 */
export async function isLocalOnlyUntouchedSeed(): Promise<boolean> {
  const [stories, notes] = await Promise.all([
    storyRepository.listAllIncludingDeleted(),
    noteRepository.listAllIncludingDeleted(),
  ]);

  const activeStories = stories.filter((s) => !s.isDeleted);
  const activeNotes = notes.filter((n) => !n.isDeleted);

  if (activeStories.length === 0 && activeNotes.length === 0) return true;
  if (activeStories.length > DEFAULT_SEED_STORY_TITLES.size) return false;
  if (activeNotes.length > DEFAULT_SEED_NOTE_TITLES.size) return false;

  const allDefaultStories = activeStories.every(
    (s) =>
      DEFAULT_SEED_STORY_TITLES.has(s.title) &&
      (s.updatedAt <= SEED_TIMESTAMP + 5000 || s.updatedAt === s.createdAt)
  );
  const allDefaultNotes = activeNotes.every(
    (n) =>
      DEFAULT_SEED_NOTE_TITLES.has(n.title) &&
      (n.updatedAt <= SEED_TIMESTAMP + 5000 || n.updatedAt === n.createdAt)
  );

  return allDefaultStories && allDefaultNotes;
}

export async function clearLocalSeedBeforeInitialPull(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.stories, db.notes], async () => {
    await db.stories.clear();
    await db.notes.clear();
  });
}

/**
 * Safely merges duplicate default stories (created when two devices seeded random UUIDs before syncing)
 * without losing any user-written notes. Re-parents all user notes into the canonical story,
 * deduplicates identical untouched welcome notes, and soft-deletes the duplicate stories.
 */
export async function deduplicateSeedArtifacts(): Promise<{
  changedStories: Story[];
  changedNotes: NoteItem[];
}> {
  const db = getDb();
  const [allStories, allNotes] = await Promise.all([
    db.stories.toArray(),
    db.notes.toArray(),
  ]);

  const activeStories = allStories.filter((s) => !s.isDeleted);
  const activeNotes = allNotes.filter((n) => !n.isDeleted);

  const now = Date.now();
  const changedStoryMap = new Map<string, Story>();
  const changedNoteMap = new Map<string, NoteItem>();

  // 1. Deduplicate default stories that share the exact same default title
  const storiesByDefaultTitle = new Map<string, Story[]>();
  for (const story of activeStories) {
    if (!DEFAULT_SEED_STORY_TITLES.has(story.title)) continue;
    const list = storiesByDefaultTitle.get(story.title) ?? [];
    list.push(story);
    storiesByDefaultTitle.set(story.title, list);
  }

  const storyNoteCount = new Map<string, number>();
  for (const n of activeNotes) {
    storyNoteCount.set(n.storyId, (storyNoteCount.get(n.storyId) ?? 0) + 1);
  }

  for (const [, group] of storiesByDefaultTitle) {
    if (group.length < 2) continue;

    // Pick canonical: prefer deterministic seed ID, then story with most notes, then earliest createdAt
    group.sort((a, b) => {
      const aDet = a.id.startsWith('seed-story-') ? 0 : 1;
      const bDet = b.id.startsWith('seed-story-') ? 0 : 1;
      if (aDet !== bDet) return aDet - bDet;
      const aCnt = storyNoteCount.get(a.id) ?? 0;
      const bCnt = storyNoteCount.get(b.id) ?? 0;
      if (aCnt !== bCnt) return bCnt - aCnt;
      return a.createdAt - b.createdAt;
    });

    const canonical = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      // Re-parent every active note belonging to the duplicate story into canonical
      for (const note of activeNotes) {
        if (note.storyId === dup.id) {
          const moved: NoteItem = {
            ...note,
            storyId: canonical.id,
            updatedAt: now,
          };
          note.storyId = canonical.id;
          note.updatedAt = now;
          changedNoteMap.set(moved.id, moved);
        }
      }

      const deletedDup: Story = {
        ...dup,
        isDeleted: true,
        updatedAt: now,
      };
      changedStoryMap.set(deletedDup.id, deletedDup);
    }
  }

  // 2. Deduplicate identical untouched welcome/sample notes
  const seenSeedNotes = new Map<string, NoteItem>();
  const sortedActiveNotes = [...activeNotes].sort((a, b) => a.createdAt - b.createdAt);

  for (const note of sortedActiveNotes) {
    if (!DEFAULT_SEED_NOTE_TITLES.has(note.title)) continue;
    const signature = `${note.title}::${note.content}`;
    const existing = seenSeedNotes.get(signature);
    if (!existing) {
      seenSeedNotes.set(signature, note);
    } else {
      const deletedNote: NoteItem = {
        ...note,
        isDeleted: true,
        updatedAt: now,
      };
      changedNoteMap.set(deletedNote.id, deletedNote);
    }
  }

  const changedStories = Array.from(changedStoryMap.values());
  const changedNotes = Array.from(changedNoteMap.values());

  if (changedStories.length > 0 || changedNotes.length > 0) {
    await db.transaction('rw', [db.stories, db.notes], async () => {
      if (changedStories.length > 0) await db.stories.bulkPut(changedStories);
      if (changedNotes.length > 0) await db.notes.bulkPut(changedNotes);
    });
  }

  return { changedStories, changedNotes };
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

  const today = getTodayString();
  const tomorrow = addDays(today, 1);

  const storyDaily: Story = {
    id: SEED_STORY_IDS.daily,
    title: '일상',
    order: 0,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    isDeleted: false,
  };
  const storyMemo: Story = {
    id: SEED_STORY_IDS.memo,
    title: '메모',
    order: 1,
    createdAt: SEED_TIMESTAMP + 1000,
    updatedAt: SEED_TIMESTAMP + 1000,
    isDeleted: false,
  };
  const storyTodo: Story = {
    id: SEED_STORY_IDS.todo,
    title: '할 일',
    order: 2,
    createdAt: SEED_TIMESTAMP + 2000,
    updatedAt: SEED_TIMESTAMP + 2000,
    isDeleted: false,
  };
  const storyIdea: Story = {
    id: SEED_STORY_IDS.idea,
    title: '아이디어',
    order: 3,
    createdAt: SEED_TIMESTAMP + 3000,
    updatedAt: SEED_TIMESTAMP + 3000,
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
      id: SEED_NOTE_IDS.welcome,
      storyId: storyDaily.id,
      type: 'note',
      title: '여백에 오신 것을 환영합니다',
      content: JSON.stringify(welcomeDoc),
      targetDate: today,
      createdAt: SEED_TIMESTAMP + 100,
      updatedAt: SEED_TIMESTAMP + 100,
      isDeleted: false,
    },
    {
      id: SEED_NOTE_IDS.sampleTask,
      storyId: storyTodo.id,
      type: 'task',
      title: '오늘의 가장 중요한 일 한 가지 마무리하기',
      content: JSON.stringify(sampleTaskDoc),
      targetDate: today,
      isCompleted: false,
      createdAt: SEED_TIMESTAMP + 200,
      updatedAt: SEED_TIMESTAMP + 200,
      isDeleted: false,
    },
    {
      id: SEED_NOTE_IDS.sampleEvent,
      storyId: storyDaily.id,
      type: 'event',
      title: '주간 회고 및 독서 시간',
      content: JSON.stringify(sampleEventDoc),
      targetDate: tomorrow,
      startTime: '19:00',
      endTime: '20:30',
      createdAt: SEED_TIMESTAMP + 300,
      updatedAt: SEED_TIMESTAMP + 300,
      isDeleted: false,
    },
  ];

  await db.transaction('rw', [db.stories, db.notes, db.meta], async () => {
    await db.stories.bulkPut([storyDaily, storyMemo, storyTodo, storyIdea]);
    await db.notes.bulkPut(notes);
    await db.meta.put({ key: META_KEYS.SEEDED, value: true });
  });
}
