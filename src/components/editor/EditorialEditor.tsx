'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  Bold,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Heading2,
  Highlighter,
  Italic,
  Quote,
  Strikethrough,
  Trash2,
  X,
} from 'lucide-react';
import type { NoteItem, NoteItemType, Story } from '@/types/models';
import { noteRepository } from '@/lib/db/repository';
import {
  countCharacters,
  detectInlineDateTag,
  parseContentToDoc,
} from '@/lib/utils/content';
import {
  addDays,
  formatReminderLabel,
  formatShortDate,
  fromDateTimeLocalValue,
  getTodayString,
  toDateTimeLocalValue,
} from '@/lib/utils/date';
import { reminderScheduler } from '@/lib/notifications/reminderService';

interface EditorialEditorProps {
  note: NoteItem;
  stories: Story[];
  onClose: () => void;
  onDeleted: () => void;
}

const ENTRY_TYPES: { id: NoteItemType; label: string }[] = [
  { id: 'note', label: '메모' },
  { id: 'task', label: '할 일' },
  { id: 'event', label: '일정' },
];

export function EditorialEditor({
  note,
  stories,
  onClose,
  onDeleted,
}: EditorialEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [storyId, setStoryId] = useState(note.storyId);
  const [type, setType] = useState<NoteItemType>(note.type);
  const [isCompleted, setIsCompleted] = useState(Boolean(note.isCompleted));
  const [targetDate, setTargetDate] = useState(note.targetDate ?? '');
  const [startTime, setStartTime] = useState(note.startTime ?? '');
  const [endTime, setEndTime] = useState(note.endTime ?? '');
  const [reminderAt, setReminderAt] = useState(note.reminderAt ?? '');

  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [detectedTag, setDetectedTag] = useState<{ token: string; dateStr: string } | null>(null);
  const [openMetaPanel, setOpenMetaPanel] = useState<'date' | 'reminder' | null>(null);
  const [dismissedTokens, setDismissedTokens] = useState<Record<string, boolean>>({});

  const saveTimerRef = useRef<number | null>(null);
  const latestPayloadRef = useRef<Partial<Omit<NoteItem, 'id' | 'createdAt'>>>({});

  const flushSave = useCallback(
    async (immediatePatch?: Partial<Omit<NoteItem, 'id' | 'createdAt'>>) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const patch = { ...latestPayloadRef.current, ...immediatePatch };
      latestPayloadRef.current = {};
      if (Object.keys(patch).length === 0) return;

      await noteRepository.update(note.id, patch);
      setSaveState('saved');
    },
    [note.id]
  );

  const scheduleSave = useCallback(
    (patch: Partial<Omit<NoteItem, 'id' | 'createdAt'>>) => {
      latestPayloadRef.current = { ...latestPayloadRef.current, ...patch };
      setSaveState('saving');
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        void flushSave();
      }, 320);
    },
    [flushSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (Object.keys(latestPayloadRef.current).length > 0) {
        void noteRepository.update(note.id, latestPayloadRef.current);
      }
    };
  }, [note.id]);

  const initialContent = useMemo(() => parseContentToDoc(note.content), [note.content]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder:
          '차분히 글을 적어 보세요. "- [ ] "로 체크리스트를, "@오늘"로 날짜를 연결할 수 있습니다.',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Typography,
      Highlight,
    ],
    content: initialContent,
    onCreate: ({ editor: instance }) => {
      setCharCount(countCharacters(instance.getText()));
    },
    onUpdate: ({ editor: instance }) => {
      const json = JSON.stringify(instance.getJSON());
      const plain = instance.getText();
      setCharCount(countCharacters(plain));

      const detected = detectInlineDateTag(plain);
      if (detected && !dismissedTokens[detected.token] && detected.dateStr !== targetDate) {
        setDetectedTag(detected);
      } else {
        setDetectedTag(null);
      }

      scheduleSave({ content: json });
    },
  });

  // Keyboard shortcut: Esc to go back cleanly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openMetaPanel) {
          setOpenMetaPanel(null);
          return;
        }
        void flushSave().then(onClose);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushSave, onClose, openMetaPanel]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    const detected = detectInlineDateTag(value);
    if (detected && !dismissedTokens[detected.token] && detected.dateStr !== targetDate) {
      setDetectedTag(detected);
    }
    scheduleSave({ title: value });
  };

  const handleStoryChange = (nextStoryId: string) => {
    setStoryId(nextStoryId);
    void flushSave({ storyId: nextStoryId });
  };

  const handleTypeChange = (nextType: NoteItemType) => {
    setType(nextType);
    const patch: Partial<Omit<NoteItem, 'id' | 'createdAt'>> = { type: nextType };
    if (nextType === 'task' && isCompleted === undefined) {
      patch.isCompleted = false;
    }
    if (nextType === 'event' && !targetDate) {
      const today = getTodayString();
      setTargetDate(today);
      patch.targetDate = today;
    }
    void flushSave(patch);
  };

  const handleToggleCompleted = () => {
    const next = !isCompleted;
    setIsCompleted(next);
    void flushSave({ isCompleted: next });
  };

  const handleDateChange = (nextDate: string) => {
    setTargetDate(nextDate);
    if (!nextDate) {
      setStartTime('');
      setEndTime('');
      void flushSave({ targetDate: undefined, startTime: undefined, endTime: undefined });
    } else {
      void flushSave({ targetDate: nextDate });
    }
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', val: string) => {
    if (field === 'startTime') setStartTime(val);
    else setEndTime(val);
    void flushSave({ [field]: val || undefined });
  };

  const handleReminderChange = async (localVal: string) => {
    const iso = fromDateTimeLocalValue(localVal);
    setReminderAt(iso ?? '');
    if (iso && reminderScheduler.getPermission() === 'default') {
      await reminderScheduler.requestPermission();
    }
    void flushSave({ reminderAt: iso });
  };

  const handleApplyDetectedDate = () => {
    if (!detectedTag) return;
    handleDateChange(detectedTag.dateStr);
    setDismissedTokens((prev) => ({ ...prev, [detectedTag.token]: true }));
    setDetectedTag(null);
  };

  const handleDelete = async () => {
    await noteRepository.softDelete(note.id);
    onDeleted();
  };

  const handleBack = async () => {
    await flushSave();
    onClose();
  };

  const today = getTodayString();
  const tomorrow = addDays(today, 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col bg-paper"
    >
      {/* Minimal Distraction-Free Top Bar */}
      <header className="pt-safe sticky top-0 z-20 border-b border-hairline/70 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleBack()}
              className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-xs text-ink-secondary transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
              <span>목록</span>
            </button>

            <span className="h-3.5 w-px bg-hairline" />

            <select
              aria-label="이야기 선택"
              value={storyId}
              onChange={(e) => handleStoryChange(e.target.value)}
              className="cursor-pointer bg-transparent text-xs font-medium text-ink-secondary focus:outline-none hover:text-ink"
            >
              {stories.map((s) => (
                <option key={s.id} value={s.id} className="bg-paper text-ink">
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* Entry type switcher + delete */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-hairline/80 bg-paper-subtle/60 p-0.5">
              {ENTRY_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTypeChange(t.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
                    type === t.id
                      ? 'bg-paper-elevated font-medium text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-white"
                >
                  삭제
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full p-1 text-ink-muted hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="글 삭제"
                aria-label="글 삭제"
                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-paper-subtle hover:text-accent"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Writing Canvas */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-36 pt-12 sm:px-8 sm:pt-16">
        {/* Title Row */}
        <div className="mb-8 flex items-start gap-3">
          {type === 'task' && (
            <button
              type="button"
              onClick={handleToggleCompleted}
              aria-label={isCompleted ? '할 일 완료 해제' : '할 일 완료 표시'}
              className={`mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                isCompleted
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink-muted hover:border-ink'
              }`}
            >
              {isCompleted && <Check className="h-3.5 w-3.5" strokeWidth={2.3} />}
            </button>
          )}

          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="제목"
            className={`w-full bg-transparent font-serif text-2xl font-bold leading-snug tracking-tight placeholder:text-ink-muted/60 focus:outline-none sm:text-[1.85rem] ${
              type === 'task' && isCompleted
                ? 'text-ink-muted line-through decoration-hairline'
                : 'text-ink'
            }`}
          />
        </div>

        {/* Quiet hairline divider */}
        <div className="mb-8 h-px w-12 bg-hairline" />

        {/* Contextual Bubble Menu (only visible when selecting text) */}
        {editor && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 140 }}
            className="flex items-center gap-0.5 rounded-full border border-hairline bg-paper-elevated px-1.5 py-1 shadow-lg"
          >
            <BubbleBtn
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              label="굵게"
            >
              <Bold className="h-3.5 w-3.5" />
            </BubbleBtn>
            <BubbleBtn
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              label="기울임"
            >
              <Italic className="h-3.5 w-3.5" />
            </BubbleBtn>
            <BubbleBtn
              active={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              label="취소선"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </BubbleBtn>
            <BubbleBtn
              active={editor.isActive('highlight')}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              label="강조"
            >
              <Highlighter className="h-3.5 w-3.5" />
            </BubbleBtn>
            <span className="mx-0.5 h-3.5 w-px bg-hairline" />
            <BubbleBtn
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              label="소제목"
            >
              <Heading2 className="h-3.5 w-3.5" />
            </BubbleBtn>
            <BubbleBtn
              active={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              label="인용"
            >
              <Quote className="h-3.5 w-3.5" />
            </BubbleBtn>
            <BubbleBtn
              active={editor.isActive('taskList')}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              label="체크리스트"
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </BubbleBtn>
          </BubbleMenu>
        )}

        {/* Tiptap Editorial Body */}
        <div className="yeobaek-editor">
          <EditorContent editor={editor} />
        </div>
      </main>

      {/* Inline Date Trigger Suggestion Pill */}
      {detectedTag && (
        <div className="fixed bottom-16 left-1/2 z-30 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-full border border-hairline bg-paper-elevated px-4 py-2 text-xs shadow-md">
            <Calendar className="h-3.5 w-3.5 text-accent" />
            <span className="text-ink-secondary">
              <strong className="font-medium text-ink">{detectedTag.token}</strong> 감지됨 ·{' '}
              {formatShortDate(detectedTag.dateStr)}로 연결할까요?
            </span>
            <button
              type="button"
              onClick={handleApplyDetectedDate}
              className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-paper"
            >
              적용
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissedTokens((prev) => ({ ...prev, [detectedTag.token]: true }));
                setDetectedTag(null);
              }}
              className="text-ink-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Quiet Fixed Bottom Metadata Bar */}
      <footer className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-hairline/75 bg-paper/95 backdrop-blur-md">
        {/* Expandable Date / Reminder Panel */}
        {openMetaPanel && (
          <div className="border-b border-hairline/70 bg-paper-subtle/60">
            <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs sm:px-8">
              {openMetaPanel === 'date' ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleDateChange(today)}
                    className={`rounded-full border px-2.5 py-1 transition-colors ${
                      targetDate === today
                        ? 'border-ink bg-ink text-paper'
                        : 'border-hairline bg-paper-elevated text-ink-secondary hover:text-ink'
                    }`}
                  >
                    오늘
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDateChange(tomorrow)}
                    className={`rounded-full border px-2.5 py-1 transition-colors ${
                      targetDate === tomorrow
                        ? 'border-ink bg-ink text-paper'
                        : 'border-hairline bg-paper-elevated text-ink-secondary hover:text-ink'
                    }`}
                  >
                    내일
                  </button>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="rounded-lg border border-hairline bg-paper-elevated px-2.5 py-1 text-xs text-ink focus:border-ink-secondary focus:outline-none"
                  />

                  {targetDate && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-ink-muted" />
                      <input
                        type="time"
                        aria-label="시작 시각"
                        value={startTime}
                        onChange={(e) => handleTimeChange('startTime', e.target.value)}
                        className="rounded-lg border border-hairline bg-paper-elevated px-2 py-1 text-xs text-ink focus:border-ink-secondary focus:outline-none"
                      />
                      <span className="text-ink-muted">–</span>
                      <input
                        type="time"
                        aria-label="종료 시각"
                        value={endTime}
                        onChange={(e) => handleTimeChange('endTime', e.target.value)}
                        className="rounded-lg border border-hairline bg-paper-elevated px-2 py-1 text-xs text-ink focus:border-ink-secondary focus:outline-none"
                      />
                    </div>
                  )}

                  {targetDate && (
                    <button
                      type="button"
                      onClick={() => handleDateChange('')}
                      className="text-ink-muted underline-offset-2 hover:text-accent hover:underline"
                    >
                      날짜 해제
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-ink-secondary">리마인더 시각</span>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(reminderAt)}
                    onChange={(e) => void handleReminderChange(e.target.value)}
                    className="rounded-lg border border-hairline bg-paper-elevated px-2.5 py-1 text-xs text-ink focus:border-ink-secondary focus:outline-none"
                  />
                  {reminderAt && (
                    <button
                      type="button"
                      onClick={() => void handleReminderChange('')}
                      className="text-ink-muted hover:text-accent"
                    >
                      알림 해제
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setOpenMetaPanel(null)}
                className="ml-auto rounded-full p-1 text-ink-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-2.5 text-[11px] text-ink-muted sm:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleTaskList().run()}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-paper-subtle hover:text-ink"
              title="체크리스트 삽입"
            >
              <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span className="hidden sm:inline">체크박스</span>
            </button>

            <button
              type="button"
              onClick={() => setOpenMetaPanel((p) => (p === 'date' ? null : 'date'))}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-paper-subtle ${
                targetDate ? 'font-medium text-ink' : 'hover:text-ink'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>
                {targetDate
                  ? `${formatShortDate(targetDate)}${startTime ? ` ${startTime}` : ''}`
                  : '날짜'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOpenMetaPanel((p) => (p === 'reminder' ? null : 'reminder'))}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-paper-subtle ${
                reminderAt ? 'font-medium text-accent' : 'hover:text-ink'
              }`}
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>{reminderAt ? formatReminderLabel(reminderAt) : '리마인더'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span>{charCount}자</span>
            <span className="text-ink-muted/80">
              {saveState === 'saving' ? '저장 중…' : '저장됨'}
            </span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}

function BubbleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-full p-1.5 transition-colors ${
        active
          ? 'bg-ink text-paper'
          : 'text-ink-secondary hover:bg-paper-subtle hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
