'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import type { ActiveView, NoteItemType } from '@/types/models';
import { useLocalWorkspaceData } from '@/hooks/useLocalData';
import { metaRepository, noteRepository, storyRepository } from '@/lib/db/repository';
import { driveSyncEngine, type SyncStateSnapshot } from '@/lib/sync/driveSyncEngine';
import {
  reminderScheduler,
  type InAppReminderEvent,
} from '@/lib/notifications/reminderService';
import { PwaRegistrar } from '@/components/pwa/PwaRegistrar';
import { TopNav } from '@/components/layout/TopNav';
import { StoryListView } from '@/components/stories/StoryListView';
import { CalendarView } from '@/components/calendar/CalendarView';
import { TodoView } from '@/components/todo/TodoView';

const EditorialEditor = dynamic(
  () => import('@/components/editor/EditorialEditor').then((m) => m.EditorialEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-serif text-sm text-ink-muted">에디터를 여는 중…</p>
      </div>
    ),
  }
);

const StoryManagerModal = dynamic(
  () => import('@/components/stories/StoryManagerModal').then((m) => m.StoryManagerModal),
  { ssr: false }
);

const SyncModal = dynamic(
  () => import('@/components/sync/SyncModal').then((m) => m.SyncModal),
  { ssr: false }
);

const SearchModal = dynamic(
  () => import('@/components/search/SearchModal').then((m) => m.SearchModal),
  { ssr: false }
);

const DesktopUpdateBanner = dynamic(
  () => import('@/components/desktop/DesktopUpdateBanner').then((m) => m.DesktopUpdateBanner),
  { ssr: false }
);

export function YeobaekApp() {
  const { ready, stories, notes } = useLocalWorkspaceData();

  const [activeView, setActiveView] = useState<ActiveView>('stories');
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const [storyManagerOpen, setStoryManagerOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const [syncState, setSyncState] = useState<SyncStateSnapshot>(driveSyncEngine.getState());
  const [activeToast, setActiveToast] = useState<InAppReminderEvent | null>(null);

  // Sync activeStoryId safely once stories load
  const resolvedStoryId = useMemo(() => {
    if (activeStoryId && stories.some((s) => s.id === activeStoryId)) {
      return activeStoryId;
    }
    return stories[0]?.id ?? null;
  }, [activeStoryId, stories]);

  const activeStory = useMemo(
    () => stories.find((s) => s.id === resolvedStoryId),
    [stories, resolvedStoryId]
  );

  const activeStoryNotes = useMemo(
    () =>
      notes
        .filter((n) => n.storyId === resolvedStoryId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [notes, resolvedStoryId]
  );

  const editingNote = useMemo(
    () => (editingNoteId ? notes.find((n) => n.id === editingNoteId) ?? null : null),
    [notes, editingNoteId]
  );

  // Sync native status bar color with current paper/ink theme on Android & iOS
  const applyNativeStatusBar = (dark: boolean) => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: dark ? '#171614' : '#FAF9F6' }).catch(
      () => undefined
    );
  };

  // Initialize theme, Drive sync engine, and reminder scheduler
  useEffect(() => {
    void metaRepository.get<'light' | 'dark'>('app_theme').then((saved) => {
      const preferDark =
        saved === 'dark' ||
        (!saved && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      setIsDark(preferDark);
      document.documentElement.classList.toggle('dark', preferDark);
      applyNativeStatusBar(preferDark);
    });

    const unsubSync = driveSyncEngine.subscribe(setSyncState);
    void driveSyncEngine.init();

    const unsubReminder = reminderScheduler.subscribe((event) => {
      setActiveToast(event);
    });
    reminderScheduler.start();

    return () => {
      unsubSync();
      unsubReminder();
      reminderScheduler.stop();
      driveSyncEngine.destroy();
    };
  }, []);

  // Global keyboard shortcut Cmd/Ctrl + K for quick search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keep native Android/iOS OS-level reminder schedules synced with local notes
  useEffect(() => {
    if (!ready) return;
    void reminderScheduler.syncNativeSchedules(notes);
  }, [ready, notes]);

  const handleToggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    applyNativeStatusBar(next);
    void metaRepository.set('app_theme', next ? 'dark' : 'light');
  };

  const handleCreateNote = async (
    type: NoteItemType = 'note',
    targetDate?: string
  ) => {
    let targetStoryId = resolvedStoryId;
    if (!targetStoryId) {
      const createdStory = await storyRepository.create('일상');
      targetStoryId = createdStory.id;
      setActiveStoryId(createdStory.id);
    }

    const created = await noteRepository.create({
      storyId: targetStoryId,
      type,
      targetDate,
    });
    setEditingNoteId(created.id);
  };

  const handleQuickCreateStory = () => {
    setStoryManagerOpen(true);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-center">
          <p className="font-serif text-lg text-ink">여백</p>
          <p className="mt-2 text-xs text-ink-muted">기록을 불러오는 중…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PwaRegistrar />

      <AnimatePresence mode="wait">
        {editingNote ? (
          <EditorialEditor
            key={editingNote.id}
            note={editingNote}
            stories={stories}
            onClose={() => setEditingNoteId(null)}
            onDeleted={() => setEditingNoteId(null)}
          />
        ) : (
          <motion.div
            key="workspace-shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-screen bg-paper"
          >
            <TopNav
              activeView={activeView}
              onChangeView={setActiveView}
              stories={stories}
              activeStoryId={resolvedStoryId}
              onSelectStory={(id) => setActiveStoryId(id)}
              onOpenStoryManager={() => setStoryManagerOpen(true)}
              onQuickCreateStory={handleQuickCreateStory}
              onOpenSearch={() => setSearchOpen(true)}
              onOpenSync={() => setSyncModalOpen(true)}
              syncState={syncState}
              isDark={isDark}
              onToggleTheme={handleToggleTheme}
            />

            <main>
              {activeView === 'stories' && (
                <StoryListView
                  story={activeStory}
                  entries={activeStoryNotes}
                  onOpenNote={(id) => setEditingNoteId(id)}
                  onCreateNote={(type) => void handleCreateNote(type)}
                />
              )}

              {activeView === 'calendar' && (
                <CalendarView
                  notes={notes}
                  stories={stories}
                  onOpenNote={(id) => setEditingNoteId(id)}
                  onCreateForDate={(dateStr) => void handleCreateNote('event', dateStr)}
                />
              )}

              {activeView === 'todo' && (
                <TodoView
                  notes={notes}
                  stories={stories}
                  defaultStoryId={resolvedStoryId}
                  onOpenNote={(id) => setEditingNoteId(id)}
                />
              )}
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Auto-Update Banner (visible only in packaged Electron app) */}
      <DesktopUpdateBanner />

      {/* In-app Reminder Toast Banner */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-hairline bg-paper-elevated px-4 py-3.5 shadow-lg"
          >
            <Bell className="h-4 w-4 shrink-0 text-accent" />
            <button
              type="button"
              onClick={() => {
                setEditingNoteId(activeToast.noteId);
                setActiveToast(null);
              }}
              className="flex-1 text-left"
            >
              <p className="text-xs font-medium text-ink">{activeToast.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">리마인더 시각이 되었습니다 · 눌러서 열기</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              className="rounded-full p-1 text-ink-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals (loaded lazily on first open) */}
      {storyManagerOpen && (
        <StoryManagerModal
          open={storyManagerOpen}
          onClose={() => setStoryManagerOpen(false)}
          stories={stories}
          activeStoryId={resolvedStoryId}
          onSelectStory={(id) => setActiveStoryId(id)}
        />
      )}

      {syncModalOpen && (
        <SyncModal
          open={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          syncState={syncState}
        />
      )}

      {searchOpen && (
        <SearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          notes={notes}
          stories={stories}
          onSelectNote={(id) => setEditingNoteId(id)}
        />
      )}
    </>
  );
}
