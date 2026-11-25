'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { NoteItem, Story } from '@/types/models';
import { extractExcerpt, extractPlainText } from '@/lib/utils/content';
import { formatTimestamp } from '@/lib/utils/date';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  notes: NoteItem[];
  stories: Story[];
  onSelectNote: (noteId: string) => void;
}

export function SearchModal({
  open,
  onClose,
  notes,
  stories,
  onSelectNote,
}: SearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const storyMap = useMemo(
    () => new Map<string, string>(stories.map((s) => [s.id, s.title])),
    [stories]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes.slice(0, 8);
    return notes.filter((n) => {
      if (n.title.toLowerCase().includes(q)) return true;
      if (n.targetDate?.includes(q)) return true;
      return extractPlainText(n.content).toLowerCase().includes(q);
    });
  }, [notes, query]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/20 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-paper shadow-xl"
          >
            <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-3.5">
              <Search className="h-4 w-4 text-ink-muted" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="제목, 본문, 날짜(YYYY-MM-DD)로 검색…"
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1 text-ink-muted hover:bg-paper-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-2 py-2">
              {results.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-muted">
                  일치하는 기록이 없습니다.
                </p>
              ) : (
                <ul>
                  {results.map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectNote(note.id);
                          onClose();
                        }}
                        className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-paper-subtle"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-serif text-sm font-bold text-ink">
                            {note.title.trim() || '제목 없는 글'}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-muted">
                            {storyMap.get(note.storyId) ?? '이야기'} ·{' '}
                            {formatTimestamp(note.updatedAt)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-ink-secondary">
                          {extractExcerpt(note.content, 85) || '내용 없음'}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
