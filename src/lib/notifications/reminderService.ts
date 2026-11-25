import { metaRepository, noteRepository } from '@/lib/db/repository';
import type { NoteItem } from '@/types/models';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Storage/platform-agnostic notification adapter interface.
 * Swap WebNotificationAdapter with Capacitor LocalNotifications or Tauri Notification API
 * when packaging as a native app without touching any UI component.
 */
export interface NotificationAdapter {
  getPermission(): NotificationPermissionState;
  requestPermission(): Promise<NotificationPermissionState>;
  fireNow(title: string, body: string, tag?: string): Promise<void>;
}

export class WebNotificationAdapter implements NotificationAdapter {
  getPermission(): NotificationPermissionState {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'granted') return 'granted';
    const result = await Notification.requestPermission();
    return result;
  }

  async fireNow(title: string, body: string, tag?: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, {
            body,
            tag,
            icon: '/icon.svg',
            badge: '/icon.svg',
          });
          return;
        }
      }
      new Notification(title, { body, tag, icon: '/icon.svg' });
    } catch {
      // Fallback to direct Notification constructor if service worker notification fails
      try {
        new Notification(title, { body, tag });
      } catch {
        // Ignore browser restriction errors
      }
    }
  }
}

export interface InAppReminderEvent {
  noteId: string;
  title: string;
  reminderAt: string;
}

type InAppListener = (event: InAppReminderEvent) => void;

class ReminderScheduler {
  private adapter: NotificationAdapter = new WebNotificationAdapter();
  private timerId: number | null = null;
  private listeners = new Set<InAppListener>();

  setAdapter(adapter: NotificationAdapter): void {
    this.adapter = adapter;
  }

  getPermission(): NotificationPermissionState {
    return this.adapter.getPermission();
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    return this.adapter.requestPermission();
  }

  subscribe(listener: InAppListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (typeof window === 'undefined') return;
    if (this.timerId !== null) return;

    void this.checkDueReminders();
    this.timerId = window.setInterval(() => {
      void this.checkDueReminders();
    }, 30_000);
  }

  stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  async checkDueReminders(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const notes = await noteRepository.listAllActive();
      const notified = await metaRepository.getNotifiedReminders();
      const now = Date.now();
      // Only trigger reminders due within the last 12 hours to avoid firing very old stale alerts
      const windowMs = 12 * 60 * 60 * 1000;

      for (const note of notes) {
        if (!note.reminderAt || note.isCompleted) continue;
        const dueAt = new Date(note.reminderAt).getTime();
        if (Number.isNaN(dueAt)) continue;
        if (dueAt > now || now - dueAt > windowMs) continue;
        if (notified[note.id] === note.reminderAt) continue;

        await metaRepository.markReminderNotified(note.id, note.reminderAt);
        await this.dispatchReminder(note);
      }
    } catch {
      // Silently recover on next tick
    }
  }

  private async dispatchReminder(note: NoteItem): Promise<void> {
    const title = note.title.trim() || '여백 리마인더';
    const body = '설정한 알림 시각이 되었습니다.';
    await this.adapter.fireNow(title, body, `yeobaek-reminder-${note.id}`);

    const event: InAppReminderEvent = {
      noteId: note.id,
      title,
      reminderAt: note.reminderAt ?? new Date().toISOString(),
    };
    this.listeners.forEach((listener) => listener(event));
  }
}

export const reminderScheduler = new ReminderScheduler();
