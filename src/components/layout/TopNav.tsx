'use client';

import { motion } from 'framer-motion';
import {
  Cloud,
  CloudOff,
  Loader2,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import type { ActiveView, Story } from '@/types/models';
import type { SyncStateSnapshot } from '@/lib/sync/driveSyncEngine';

interface TopNavProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  stories: Story[];
  activeStoryId: string | null;
  onSelectStory: (storyId: string) => void;
  onOpenStoryManager: () => void;
  onQuickCreateStory: () => void;
  onOpenSearch: () => void;
  onOpenSync: () => void;
  syncState: SyncStateSnapshot;
  isDark: boolean;
  onToggleTheme: () => void;
}

const VIEW_TABS: { id: ActiveView; label: string }[] = [
  { id: 'stories', label: '이야기' },
  { id: 'calendar', label: '캘린더' },
  { id: 'todo', label: '할 일' },
];

export function TopNav({
  activeView,
  onChangeView,
  stories,
  activeStoryId,
  onSelectStory,
  onOpenStoryManager,
  onQuickCreateStory,
  onOpenSearch,
  onOpenSync,
  syncState,
  isDark,
  onToggleTheme,
}: TopNavProps) {
  const syncLabel = (() => {
    switch (syncState.status) {
      case 'syncing':
        return '동기화 중';
      case 'pending':
        return '대기 중';
      case 'synced':
        return '동기화됨';
      case 'offline':
        return '오프라인';
      case 'error':
        return '동기화 오류';
      default:
        return '로컬';
    }
  })();

  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-md">
      {/* Primary minimal bar */}
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => onChangeView('stories')}
          className="group flex items-baseline gap-2 text-left"
        >
          <span className="font-serif text-lg font-bold tracking-tight text-ink">여백</span>
          <span className="hidden text-[11px] tracking-widest text-ink-muted sm:inline">
            YEOBAEK
          </span>
        </button>

        {/* Center view switcher */}
        <nav
          aria-label="주요 화면"
          className="flex items-center gap-1 rounded-full border border-hairline/80 bg-paper-subtle/60 p-0.5"
        >
          {VIEW_TABS.map((tab) => {
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeView(tab.id)}
                className={`relative rounded-full px-3.5 py-1 text-xs font-medium transition-colors duration-200 ${
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-view-pill"
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 rounded-full bg-paper-elevated shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-hairline/70"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quiet utility actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            title="검색 (⌘K)"
            aria-label="검색"
            className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-paper-subtle hover:text-ink"
          >
            <Search className="h-4 w-4" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={onOpenSync}
            title={`동기화 상태: ${syncLabel}`}
            aria-label="동기화 설정"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-paper-subtle hover:text-ink"
          >
            {syncState.status === 'syncing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.7} />
            ) : syncState.status === 'offline' ? (
              <CloudOff className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.6} />
            ) : (
              <Cloud
                className={`h-3.5 w-3.5 ${
                  syncState.isConnected
                    ? 'text-ink'
                    : syncState.status === 'error'
                      ? 'text-accent'
                      : 'text-ink-muted'
                }`}
                strokeWidth={1.6}
              />
            )}
            <span className="hidden text-[11px] sm:inline">{syncLabel}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            title={isDark ? '밝은 종이 테마' : '어두운 잉크 테마'}
            aria-label="테마 전환"
            className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-paper-subtle hover:text-ink"
          >
            {isDark ? (
              <Sun className="h-4 w-4" strokeWidth={1.6} />
            ) : (
              <Moon className="h-4 w-4" strokeWidth={1.6} />
            )}
          </button>
        </div>
      </div>

      {/* Editorial Story horizontal tabs */}
      {activeView === 'stories' && (
        <div className="border-b border-hairline/80">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 sm:px-8">
            <div className="no-scrollbar flex flex-1 items-center gap-6 overflow-x-auto pt-1">
              {stories.map((story) => {
                const isSelected = story.id === activeStoryId;
                return (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => onSelectStory(story.id)}
                    className={`relative shrink-0 pb-3 text-sm transition-colors duration-200 ${
                      isSelected
                        ? 'font-medium text-ink'
                        : 'text-ink-muted hover:text-ink-secondary'
                    }`}
                  >
                    <span>{story.title}</span>
                    {isSelected && (
                      <motion.span
                        layoutId="active-story-underline"
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-x-0 bottom-0 h-[1.5px] bg-ink"
                      />
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={onQuickCreateStory}
                title="새 이야기 추가"
                aria-label="새 이야기 추가"
                className="mb-2.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink-muted transition-colors hover:bg-paper-subtle hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenStoryManager}
              title="이야기 관리"
              aria-label="이야기 관리"
              className="mb-2 shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-paper-subtle hover:text-ink"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      )}

      {activeView !== 'stories' && <div className="border-b border-hairline/70" />}
    </header>
  );
}
