import type { JSONContent } from '@tiptap/react';
import type { InlineTaskSummary } from '@/types/models';
import { addDays, getTodayString } from './date';

export function createEmptyDoc(): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}

export function plainTextToDoc(text: string): JSONContent {
  const lines = text.split('\n');
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return createEmptyDoc();
  }
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
}

export function parseContentToDoc(content: string): JSONContent {
  if (!content || !content.trim()) {
    return createEmptyDoc();
  }
  try {
    const parsed = JSON.parse(content) as JSONContent;
    if (parsed && parsed.type === 'doc') {
      return parsed;
    }
  } catch {
    // Fallback for plain text or markdown string
  }
  return plainTextToDoc(content);
}

function collectText(node: JSONContent | undefined, parts: string[]): void {
  if (!node) return;
  if (typeof node.text === 'string') {
    parts.push(node.text);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectText(child, parts);
    }
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'listItem' ||
      node.type === 'taskItem' ||
      node.type === 'blockquote'
    ) {
      parts.push('\n');
    }
  }
}

export function extractPlainText(content: string): string {
  const doc = parseContentToDoc(content);
  const parts: string[] = [];
  collectText(doc, parts);
  return parts
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function extractExcerpt(content: string, maxLength = 110): string {
  const text = extractPlainText(content).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export function extractInlineTasks(content: string): InlineTaskSummary[] {
  const doc = parseContentToDoc(content);
  const tasks: InlineTaskSummary[] = [];

  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    if (node.type === 'taskItem') {
      const parts: string[] = [];
      collectText(node, parts);
      const text = parts.join('').replace(/\s+/g, ' ').trim();
      if (text) {
        tasks.push({
          index: tasks.length,
          text,
          checked: Boolean(node.attrs?.checked),
        });
      }
      return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  };

  walk(doc);
  return tasks;
}

export function toggleInlineTaskAtIndex(content: string, targetIndex: number): string {
  const doc = parseContentToDoc(content);
  let currentIndex = 0;

  const walk = (node: JSONContent | undefined): void => {
    if (!node) return;
    if (node.type === 'taskItem') {
      const parts: string[] = [];
      collectText(node, parts);
      const text = parts.join('').replace(/\s+/g, ' ').trim();
      if (text) {
        if (currentIndex === targetIndex) {
          node.attrs = {
            ...(node.attrs ?? {}),
            checked: !Boolean(node.attrs?.checked),
          };
        }
        currentIndex++;
      }
      return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  };

  walk(doc);
  return JSON.stringify(doc);
}

/**
 * Detects lightweight inline date tokens inside text:
 * @오늘, @내일, @모레, @YYYY-MM-DD, @MM-DD
 */
export function detectInlineDateTag(text: string): { token: string; dateStr: string } | null {
  const today = getTodayString();

  if (text.includes('@오늘')) {
    return { token: '@오늘', dateStr: today };
  }
  if (text.includes('@내일')) {
    return { token: '@내일', dateStr: addDays(today, 1) };
  }
  if (text.includes('@모레')) {
    return { token: '@모레', dateStr: addDays(today, 2) };
  }

  const fullDateMatch = text.match(/@(\d{4})-(\d{2})-(\d{2})\b/);
  if (fullDateMatch) {
    const [, y, m, d] = fullDateMatch;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { token: fullDateMatch[0], dateStr: `${y}-${m}-${d}` };
    }
  }

  const shortDateMatch = text.match(/@(\d{1,2})\/(\d{1,2})\b/);
  if (shortDateMatch) {
    const [, m, d] = shortDateMatch;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const y = new Date().getFullYear();
      return {
        token: shortDateMatch[0],
        dateStr: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
  }

  return null;
}

export function countCharacters(text: string): number {
  return text.replace(/\s+/g, '').length;
}
