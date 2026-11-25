'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Story } from '@/types/models';
import { storyRepository } from '@/lib/db/repository';

interface StoryManagerModalProps {
  open: boolean;
  onClose: () => void;
  stories: Story[];
  activeStoryId: string | null;
  onSelectStory: (storyId: string) => void;
}

export function StoryManagerModal({
  open,
  onClose,
  stories,
  activeStoryId,
  onSelectStory,
}: StoryManagerModalProps) {
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const created = await storyRepository.create(trimmed);
    setNewTitle('');
    onSelectStory(created.id);
  };

  const handleRename = async (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      await storyRepository.rename(id, trimmed);
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stories.length) return;
    const ids = stories.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    await storyRepository.reorder(ids);
  };

  const handleDelete = async (id: string) => {
    if (stories.length <= 1) return;
    await storyRepository.softDelete(id);
    setConfirmDeleteId(null);
    if (activeStoryId === id) {
      const remaining = stories.find((s) => s.id !== id);
      if (remaining) onSelectStory(remaining.id);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/20 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-paper shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="font-serif text-base font-bold text-ink">이야기 관리</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1 text-ink-muted transition-colors hover:bg-paper-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              <form onSubmit={handleCreate} className="mb-5 flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="새 이야기 제목 (예: 독서, 프로젝트)"
                  className="flex-1 rounded-lg border border-hairline bg-paper-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-ink-secondary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="inline-flex items-center gap-1 rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  추가
                </button>
              </form>

              <ul className="divide-y divide-hairline/70">
                {stories.map((story, idx) => {
                  const isEditing = editingId === story.id;
                  const isConfirming = confirmDeleteId === story.id;

                  return (
                    <li key={story.id} className="flex items-center justify-between gap-2 py-3">
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleRename(story.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="flex-1 rounded border border-hairline bg-paper-elevated px-2.5 py-1 text-sm text-ink focus:border-ink-secondary focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRename(story.id)}
                            className="rounded p-1 text-ink hover:bg-paper-subtle"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectStory(story.id);
                            onClose();
                          }}
                          className="flex-1 text-left text-sm text-ink transition-colors hover:text-accent"
                        >
                          {story.title}
                        </button>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMove(idx, -1)}
                            title="위로 이동"
                            className="rounded p-1.5 text-ink-muted hover:bg-paper-subtle hover:text-ink disabled:opacity-25"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === stories.length - 1}
                            onClick={() => void handleMove(idx, 1)}
                            title="아래로 이동"
                            className="rounded p-1.5 text-ink-muted hover:bg-paper-subtle hover:text-ink disabled:opacity-25"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(story.id);
                              setEditingTitle(story.title);
                              setConfirmDeleteId(null);
                            }}
                            title="이름 변경"
                            className="rounded p-1.5 text-ink-muted hover:bg-paper-subtle hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {stories.length > 1 &&
                            (isConfirming ? (
                              <button
                                type="button"
                                onClick={() => void handleDelete(story.id)}
                                className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-white"
                              >
                                삭제 확인
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(story.id)}
                                title="이야기 삭제"
                                className="rounded p-1.5 text-ink-muted hover:bg-paper-subtle hover:text-accent"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="border-t border-hairline bg-paper-subtle/50 px-6 py-3 text-[11px] text-ink-muted">
              이야기를 삭제하면 포함된 글도 휴지 처리(Soft Delete)되어 동기화 시 다른 기기에도 반영됩니다.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
