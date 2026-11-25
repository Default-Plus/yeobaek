import Dexie, { type EntityTable } from 'dexie';
import type { NoteItem, Story } from '@/types/models';

export interface MetaRecord {
  key: string;
  value: unknown;
}

class YeobaekDatabase extends Dexie {
  stories!: EntityTable<Story, 'id'>;
  notes!: EntityTable<NoteItem, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor() {
    super('YeobaekMinimalDB');
    this.version(1).stores({
      stories: 'id, order, updatedAt, isDeleted',
      notes: 'id, storyId, type, targetDate, isCompleted, reminderAt, updatedAt, isDeleted',
      meta: 'key',
    });
  }
}

let dbInstance: YeobaekDatabase | null = null;

export function getDb(): YeobaekDatabase {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in browser environments.');
  }
  if (!dbInstance) {
    dbInstance = new YeobaekDatabase();
  }
  return dbInstance;
}
