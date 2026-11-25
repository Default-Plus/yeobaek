'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bell, Calendar, Check, Feather } from 'lucide-react';
import type { NoteItem, Story } from '@/types/models';
import { noteRepository } from '@/lib/db/repository';
import { extractExcerpt, extractInlineTasks } from '@/lib/utils/content';
import { formatShortDate, formatTimestamp } from '@/lib/utils/date';

interface StoryListViewProps {
  story: Story | undefined;
  entries: NoteItem[];
  onOpenNote: (noteId: string) => void;
  onCreateNote: (type?: 'note' | 'task' | 'event') => void;
}

export function StoryListView({
  story,
  entries,
  onOpenNote,
  onCreateNote,
}: StoryListViewProps) {
  const entrySummaries = useMemo(
    () =>
      entries.map((entry) => {
        const excerpt = extractExcerpt(entry.content, 120);
        const inlineTasks = extractInlineTasks(entry.content);
        const completedInline = inlineTasks.filter((t) => t.checked).length;
        return {
          entry,
          excerpt,
          inlineTotal: inlineTasks.length,
          completedInline,
        };
      }),
    [entries]
  );

  if (!story) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-28 text-center">
        <p className="font-serif text-lg text-ink-secondary">
          첫 번째 이야기를 만들어 기록을 시작해 보세요.
        </p>
      </div>
    );
  }

  return (
    <motion.section
      key={story.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl px-5 pb-28 pt-10 sm:px-8 sm:pt-14"
    >
      {/* Editorial Story Header */}
      <div className="mb-10 flex items-end justify-between border-b border-hairline pb-6">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {story.title}
          </h1>
          <p className="mt-2 text-xs tracking-wide text-ink-muted">
            {entries.length === 0 ? '아직 쓰인 글이 없습니다' : `${entries.length}편의 기록`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCreateNote('note')}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper-elevated px-4 py-2 text-xs font-medium text-ink transition-all duration-200 hover:border-ink-secondary hover:bg-paper-subtle"
        >
          <Feather className="h-3.5 w-3.5" strokeWidth={1.7} />
          <span>새 글 쓰기</span>
        </button>
      </div>

      {/* Entries List */}
      {entries.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-serif text-base leading-relaxed text-ink-secondary">
            조용한 여백이 기다리고 있습니다.
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            떠오르는 문장, 오늘의 할 일, 기억할 일정을 자유롭게 남겨 보세요.
          </p>
          <div className="mt-8 flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => onCreateNote('note')}
              className="rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-paper transition-opacity hover:opacity-90"
            >
              첫 글 쓰기
            </button>
            <button
              type="button"
              onClick={() => onCreateNote('task')}
              className="rounded-full border border-hairline px-4 py-2.5 text-xs text-ink-secondary transition-colors hover:border-ink-secondary hover:text-ink"
            >
              할 일 추가
            </button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-hairline/75">
          {entrySummaries.map(({ entry, excerpt, inlineTotal, completedInline }) => {
            const isTask = entry.type === 'task';
            const displayTitle = entry.title.trim() || '제목 없는 글';

            return (
              <li key={entry.id} className="group py-6 transition-colors">
                <div className="flex items-start gap-3.5">
                  {isTask && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void noteRepository.toggleComplete(entry.id);
                      }}
                      aria-label={entry.isCompleted ? '완료 해제' : '완료 표시'}
                      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        entry.isCompleted
                          ? 'border-ink bg-ink text-paper'
                          : 'border-ink-muted hover:border-ink'
                      }`}
                    >
                      {entry.isCompleted && <Check className="h-3 w-3" strokeWidth={2.4} />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenNote(entry.id)}
                    className="flex-1 text-left focus:outline-none"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <h2
                        className={`font-serif text-[1.08rem] font-bold leading-snug tracking-tight transition-colors group-hover:text-accent ${
                          isTask && entry.isCompleted
                            ? 'text-ink-muted line-through decoration-hairline'
                            : 'text-ink'
                        }`}
                      >
                        {displayTitle}
                      </h2>
                      <span className="shrink-0 text-[11px] text-ink-muted">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </div>

                    {excerpt && (
                      <p className="mt-2 line-clamp-2 text-[0.9rem] leading-relaxed text-ink-secondary">
                        {excerpt}
                      </p>
                    )}

                    {/* Subtle inline metadata row */}
                    {(entry.targetDate ||
                      entry.reminderAt ||
                      entry.type === 'event' ||
                      inlineTotal > 0) && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
                        {entry.targetDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" strokeWidth={1.6} />
                            <span>
                              {formatShortDate(entry.targetDate)}
                              {entry.startTime
                                ? ` · ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ''}`
                                : ''}
                            </span>
                          </span>
                        )}

                        {entry.reminderAt && (
                          <span className="inline-flex items-center gap-1 text-accent">
                            <Bell className="h-3 w-3" strokeWidth={1.6} />
                            <span>리마인더</span>
                          </span>
                        )}

                        {inlineTotal > 0 && (
                          <span>
                            체크리스트 {completedInline}/{inlineTotal}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
