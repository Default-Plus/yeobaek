'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Check, ChevronLeft, ChevronRight, Feather } from 'lucide-react';
import type { NoteItem, Story } from '@/types/models';
import { noteRepository } from '@/lib/db/repository';
import {
  buildMonthGrid,
  formatKoreanDate,
  getTodayString,
} from '@/lib/utils/date';
import { extractExcerpt } from '@/lib/utils/content';

interface CalendarViewProps {
  notes: NoteItem[];
  stories: Story[];
  onOpenNote: (noteId: string) => void;
  onCreateForDate: (dateStr: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarView({
  notes,
  stories,
  onOpenNote,
  onCreateForDate,
}: CalendarViewProps) {
  const today = getTodayString();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const storyMap = useMemo(
    () => new Map<string, string>(stories.map((s) => [s.id, s.title])),
    [stories]
  );

  const notesByDate = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const n of notes) {
      if (!n.targetDate) continue;
      const list = map.get(n.targetDate) ?? [];
      list.push(n);
      map.set(n.targetDate, list);
    }
    map.forEach((list) => {
      list.sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        if (a.startTime) return -1;
        if (b.startTime) return 1;
        return b.createdAt - a.createdAt;
      });
    });
    return map;
  }, [notes]);

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );

  const selectedEntries = notesByDate.get(selectedDate) ?? [];

  const moveMonth = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const jumpToToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(today);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl px-5 pb-28 pt-10 sm:px-8 sm:pt-12"
    >
      {/* Month Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">
            {cursor.year}년 {cursor.month + 1}월
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded-full border border-hairline px-3 py-1 text-xs text-ink-secondary transition-colors hover:border-ink-secondary hover:text-ink"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="이전 달"
            className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-paper-subtle hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.7} />
          </button>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="다음 달"
            className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-paper-subtle hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-ink-muted">
        {WEEKDAYS.map((day, idx) => (
          <div
            key={day}
            className={`py-2 ${idx === 0 ? 'text-accent/80' : ''}`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Minimal Calendar Grid */}
      <div className="grid grid-cols-7 border-t border-hairline/70">
        {cells.map((cell) => {
          const dayItems = notesByDate.get(cell.dateStr) ?? [];
          const isSelected = cell.dateStr === selectedDate;
          const hasEvent = dayItems.some((i) => i.type === 'event');
          const hasPendingTask = dayItems.some((i) => i.type === 'task' && !i.isCompleted);
          const hasNote = dayItems.some((i) => i.type === 'note' || i.isCompleted);

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => setSelectedDate(cell.dateStr)}
              className={`group relative flex h-14 flex-col items-center justify-center border-b border-hairline/40 transition-colors sm:h-16 ${
                !cell.inCurrentMonth ? 'opacity-35' : ''
              } ${
                isSelected
                  ? 'bg-paper-subtle/90'
                  : 'hover:bg-paper-subtle/40'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                  isSelected
                    ? 'bg-ink font-semibold text-paper'
                    : cell.isToday
                      ? 'font-semibold text-accent ring-1 ring-accent/50'
                      : cell.weekday === 0
                        ? 'text-accent/80'
                        : 'text-ink'
                }`}
              >
                {cell.day}
              </span>

              {/* Quiet dot indicators */}
              <div className="mt-1 flex h-1.5 items-center gap-1">
                {hasEvent && <span className="h-1 w-1 rounded-full bg-accent" />}
                {hasPendingTask && <span className="h-1 w-1 rounded-full bg-ink" />}
                {hasNote && !hasEvent && !hasPendingTask && (
                  <span className="h-1 w-1 rounded-full bg-ink-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Agenda */}
      <div className="mt-10">
        <div className="mb-5 flex items-center justify-between border-b border-hairline pb-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-ink">
              {formatKoreanDate(selectedDate)}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              {selectedEntries.length === 0
                ? '이 날짜에 연결된 기록이 없습니다'
                : `${selectedEntries.length}개의 기록`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCreateForDate(selectedDate)}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper-elevated px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink-secondary hover:bg-paper-subtle"
          >
            <Feather className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span>이 날짜에 글 쓰기</span>
          </button>
        </div>

        {selectedEntries.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            날짜가 지정된 메모, 할 일, 일정이 이곳에 차곡차곡 모입니다.
          </div>
        ) : (
          <ul className="divide-y divide-hairline/70">
            {selectedEntries.map((entry) => {
              const excerpt = extractExcerpt(entry.content, 95);
              const storyTitle = storyMap.get(entry.storyId) ?? '이야기';

              return (
                <li key={entry.id} className="group flex items-start gap-3 py-4">
                  {entry.type === 'task' ? (
                    <button
                      type="button"
                      onClick={() => void noteRepository.toggleComplete(entry.id)}
                      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        entry.isCompleted
                          ? 'border-ink bg-ink text-paper'
                          : 'border-ink-muted hover:border-ink'
                      }`}
                    >
                      {entry.isCompleted && <Check className="h-3 w-3" strokeWidth={2.4} />}
                    </button>
                  ) : (
                    <span
                      className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                        entry.type === 'event' ? 'bg-accent' : 'bg-ink-muted'
                      }`}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenNote(entry.id)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={`font-serif text-[0.98rem] font-bold transition-colors group-hover:text-accent ${
                          entry.type === 'task' && entry.isCompleted
                            ? 'text-ink-muted line-through'
                            : 'text-ink'
                        }`}
                      >
                        {entry.title.trim() || '제목 없는 글'}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-muted">
                        {entry.startTime
                          ? `${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ''}`
                          : storyTitle}
                      </span>
                    </div>

                    {excerpt && (
                      <p className="mt-1 line-clamp-1 text-xs text-ink-secondary">{excerpt}</p>
                    )}

                    <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-ink-muted">
                      <span>{storyTitle}</span>
                      {entry.reminderAt && (
                        <span className="inline-flex items-center gap-1 text-accent">
                          <Bell className="h-3 w-3" />
                          리마인더
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </motion.section>
  );
}
