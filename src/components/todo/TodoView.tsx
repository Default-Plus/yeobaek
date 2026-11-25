'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Calendar, Check, Plus } from 'lucide-react';
import type { NoteItem, Story } from '@/types/models';
import { noteRepository } from '@/lib/db/repository';
import { addDays, formatShortDate, getTodayString } from '@/lib/utils/date';
import { extractInlineTasks, toggleInlineTaskAtIndex } from '@/lib/utils/content';

interface TodoViewProps {
  notes: NoteItem[];
  stories: Story[];
  defaultStoryId: string | null;
  onOpenNote: (noteId: string) => void;
}

type FilterMode = 'active' | 'completed' | 'all';

export function TodoView({
  notes,
  stories,
  defaultStoryId,
  onOpenNote,
}: TodoViewProps) {
  const [filter, setFilter] = useState<FilterMode>('active');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDate, setQuickDate] = useState<string>('');
  const [quickStoryId, setQuickStoryId] = useState<string>(
    defaultStoryId ?? stories[0]?.id ?? ''
  );

  const today = getTodayString();
  const tomorrow = addDays(today, 1);

  const storyMap = useMemo(
    () => new Map<string, string>(stories.map((s) => [s.id, s.title])),
    [stories]
  );

  const resolvedStoryId =
    quickStoryId && storyMap.has(quickStoryId)
      ? quickStoryId
      : defaultStoryId ?? stories[0]?.id ?? '';

  const tasks = useMemo(() => {
    return notes.filter((n) => n.type === 'task');
  }, [notes]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === 'active') return !t.isCompleted;
      if (filter === 'completed') return Boolean(t.isCompleted);
      return true;
    });
  }, [tasks, filter]);

  const grouped = useMemo(() => {
    const overdue: NoteItem[] = [];
    const todayList: NoteItem[] = [];
    const upcoming: NoteItem[] = [];
    const someday: NoteItem[] = [];

    for (const item of filteredTasks) {
      if (!item.targetDate) {
        someday.push(item);
      } else if (item.targetDate < today && !item.isCompleted) {
        overdue.push(item);
      } else if (item.targetDate === today) {
        todayList.push(item);
      } else if (item.targetDate > today) {
        upcoming.push(item);
      } else {
        someday.push(item);
      }
    }

    const byDateAsc = (a: NoteItem, b: NoteItem) =>
      (a.targetDate ?? '').localeCompare(b.targetDate ?? '') || b.createdAt - a.createdAt;
    overdue.sort(byDateAsc);
    upcoming.sort(byDateAsc);
    todayList.sort((a, b) => b.createdAt - a.createdAt);
    someday.sort((a, b) => b.createdAt - a.createdAt);

    return { overdue, todayList, upcoming, someday };
  }, [filteredTasks, today]);

  // Extract inline `- [ ]` checklist items from regular notes/events too
  const inlineNoteTasks = useMemo(() => {
    const items: { note: NoteItem; index: number; text: string; checked: boolean }[] = [];
    for (const note of notes) {
      const extracted = extractInlineTasks(note.content);
      for (const t of extracted) {
        if (filter === 'active' && t.checked) continue;
        if (filter === 'completed' && !t.checked) continue;
        items.push({ note, ...t });
      }
    }
    return items;
  }, [notes, filter]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed || !resolvedStoryId) return;

    await noteRepository.create({
      storyId: resolvedStoryId,
      type: 'task',
      title: trimmed,
      targetDate: quickDate || undefined,
      isCompleted: false,
    });
    setQuickTitle('');
  };

  const handleToggleInlineTask = async (note: NoteItem, index: number) => {
    const updatedContent = toggleInlineTaskAtIndex(note.content, index);
    await noteRepository.update(note.id, { content: updatedContent });
  };

  const remainingCount = tasks.filter((t) => !t.isCompleted).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl px-5 pb-28 pt-10 sm:px-8 sm:pt-12"
    >
      {/* Header */}
      <div className="mb-8 flex items-end justify-between border-b border-hairline pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">할 일</h1>
          <p className="mt-1.5 text-xs text-ink-muted">
            모든 이야기에 흩어져 있는 미완료 할 일 {remainingCount}개
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-hairline bg-paper-subtle/60 p-0.5 text-[11px]">
          {(
            [
              ['active', '미완료'],
              ['completed', '완료'],
              ['all', '전체'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 transition-colors ${
                filter === id
                  ? 'bg-paper-elevated font-medium text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Minimal Quick-Add Bar */}
      <form
        onSubmit={handleQuickAdd}
        className="mb-10 rounded-xl border border-hairline bg-paper-elevated px-4 py-3 transition-colors focus-within:border-ink-secondary"
      >
        <div className="flex items-center gap-2.5">
          <Plus className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.7} />
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="할 일을 적고 Enter를 누르세요"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={!quickTitle.trim()}
            className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            추가
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-hairline/60 pt-2.5 text-[11px] text-ink-muted">
          <select
            aria-label="저장할 이야기"
            value={resolvedStoryId}
            onChange={(e) => setQuickStoryId(e.target.value)}
            className="cursor-pointer rounded bg-paper-subtle px-2 py-0.5 text-ink-secondary focus:outline-none"
          >
            {stories.map((s) => (
              <option key={s.id} value={s.id} className="bg-paper text-ink">
                {s.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setQuickDate((d) => (d === today ? '' : today))}
            className={`rounded-full px-2 py-0.5 transition-colors ${
              quickDate === today
                ? 'bg-ink text-paper'
                : 'hover:bg-paper-subtle hover:text-ink'
            }`}
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => setQuickDate((d) => (d === tomorrow ? '' : tomorrow))}
            className={`rounded-full px-2 py-0.5 transition-colors ${
              quickDate === tomorrow
                ? 'bg-ink text-paper'
                : 'hover:bg-paper-subtle hover:text-ink'
            }`}
          >
            내일
          </button>
          <input
            type="date"
            value={quickDate}
            onChange={(e) => setQuickDate(e.target.value)}
            className="rounded bg-transparent text-[11px] text-ink-secondary focus:outline-none"
          />
        </div>
      </form>

      {/* Grouped Task Lists */}
      <div className="space-y-9">
        <TaskGroup
          title="지난 할 일"
          accent
          items={grouped.overdue}
          storyMap={storyMap}
          onOpenNote={onOpenNote}
        />
        <TaskGroup
          title="오늘"
          items={grouped.todayList}
          storyMap={storyMap}
          onOpenNote={onOpenNote}
        />
        <TaskGroup
          title="예정된 할 일"
          items={grouped.upcoming}
          storyMap={storyMap}
          onOpenNote={onOpenNote}
        />
        <TaskGroup
          title={filter === 'completed' ? '완료된 할 일' : '언젠가'}
          items={grouped.someday}
          storyMap={storyMap}
          onOpenNote={onOpenNote}
        />

        {filteredTasks.length === 0 && inlineNoteTasks.length === 0 && (
          <div className="py-14 text-center">
            <p className="font-serif text-base text-ink-secondary">
              {filter === 'active'
                ? '모든 할 일을 비웠습니다.'
                : '표시할 할 일이 없습니다.'}
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">
              새 할 일을 추가하거나 글 본문에 - [ ] 체크리스트를 적어 보세요.
            </p>
          </div>
        )}

        {/* Inline checklist items extracted from notes */}
        {inlineNoteTasks.length > 0 && (
          <div className="pt-4">
            <h2 className="mb-3 text-xs font-medium tracking-wide text-ink-muted">
              글 속 체크리스트 ({inlineNoteTasks.length})
            </h2>
            <ul className="divide-y divide-hairline/60 border-t border-hairline/70">
              {inlineNoteTasks.map((item) => (
                <li
                  key={`${item.note.id}-${item.index}`}
                  className="flex items-start gap-3 py-3"
                >
                  <button
                    type="button"
                    onClick={() => void handleToggleInlineTask(item.note, item.index)}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      item.checked
                        ? 'border-ink bg-ink text-paper'
                        : 'border-ink-muted hover:border-ink'
                    }`}
                  >
                    {item.checked && <Check className="h-3 w-3" strokeWidth={2.4} />}
                  </button>

                  <div className="flex-1">
                    <p
                      className={`text-sm ${
                        item.checked
                          ? 'text-ink-muted line-through'
                          : 'text-ink'
                      }`}
                    >
                      {item.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenNote(item.note.id)}
                      className="mt-0.5 text-[11px] text-ink-muted hover:text-accent"
                    >
                      {storyMap.get(item.note.storyId) ?? '이야기'} ·{' '}
                      {item.note.title.trim() || '제목 없는 글'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function TaskGroup({
  title,
  accent,
  items,
  storyMap,
  onOpenNote,
}: {
  title: string;
  accent?: boolean;
  items: NoteItem[];
  storyMap: Map<string, string>;
  onOpenNote: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h2
        className={`mb-2 text-xs font-medium tracking-wide ${
          accent ? 'text-accent' : 'text-ink-muted'
        }`}
      >
        {title} · {items.length}
      </h2>
      <ul className="divide-y divide-hairline/65 border-t border-hairline/75">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-3.5 py-3.5">
            <button
              type="button"
              onClick={() => void noteRepository.toggleComplete(item.id)}
              aria-label={item.isCompleted ? '완료 해제' : '완료 표시'}
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                item.isCompleted
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink-muted hover:border-ink'
              }`}
            >
              {item.isCompleted && <Check className="h-3 w-3" strokeWidth={2.4} />}
            </button>

            <button
              type="button"
              onClick={() => onOpenNote(item.id)}
              className="flex-1 text-left"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`text-[0.95rem] leading-snug transition-colors group-hover:text-accent ${
                    item.isCompleted ? 'text-ink-muted line-through' : 'text-ink'
                  }`}
                >
                  {item.title.trim() || '제목 없는 할 일'}
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {storyMap.get(item.storyId) ?? '이야기'}
                </span>
              </div>

              {(item.targetDate || item.reminderAt) && (
                <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-muted">
                  {item.targetDate && (
                    <span className={`inline-flex items-center gap-1 ${accent ? 'text-accent' : ''}`}>
                      <Calendar className="h-3 w-3" />
                      {formatShortDate(item.targetDate)}
                    </span>
                  )}
                  {item.reminderAt && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Bell className="h-3 w-3" />
                      리마인더
                    </span>
                  )}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
