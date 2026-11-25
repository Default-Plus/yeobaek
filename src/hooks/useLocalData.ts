'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ensureSeedData, noteRepository, storyRepository } from '@/lib/db/repository';
import type { NoteItem, Story } from '@/types/models';

export function useLocalWorkspaceData(): {
  ready: boolean;
  stories: Story[];
  notes: NoteItem[];
} {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void ensureSeedData().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const stories = useLiveQuery(
    async () => {
      if (!ready) return [] as Story[];
      return storyRepository.listActive();
    },
    [ready],
    [] as Story[]
  );

  const notes = useLiveQuery(
    async () => {
      if (!ready) return [] as NoteItem[];
      return noteRepository.listAllActive();
    },
    [ready],
    [] as NoteItem[]
  );

  return {
    ready,
    stories: stories ?? [],
    notes: notes ?? [],
  };
}
