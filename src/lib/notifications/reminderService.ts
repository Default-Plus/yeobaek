import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { metaRepository, noteRepository } from '@/lib/db/repository';
import type { NoteItem } from '@/types/models';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Platform-agnostic notification adapter interface.
 * Uses WebNotificationAdapter in browsers/Electron and CapacitorNotificationAdapter on Android/iOS.
 */
export interface NotificationAdapter {
  getPermission(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  fireNow(title: string, body: string, tag?: string): Promise<void>;
  syncSchedules?(notes: NoteItem[]): Promise<void>;
}

function hashNoteIdToInt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000 || 1;
}

export class WebNotificationAdapter implements NotificationAdapter {
  async getPermission(): Promise<NotificationPermissionState> {
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
    return Notification.requestPermission();
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
      try {
        new Notification(title, { body, tag });
      } catch {
        // Ignore browser restriction errors
      }
    }
  }
}

export class CapacitorNotificationAdapter implements NotificationAdapter {
  async getPermission(): Promise<NotificationPermissionState> {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted') return 'granted';
      if (display === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const { display } = await LocalNotifications.requestPermissions();
      if (display === 'granted') return 'granted';
      if (display === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'unsupported';
    }
  }

  async fireNow(title: string, body: string, tag?: string): Promise<void> {
    try {
      const perm = await this.getPermission();
      if (perm !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: hashNoteIdToInt(tag || `${title}-${Date.now()}`),
            title,
            body,
            schedule: { at: new Date(Date.now() + 500) },
          },
        ],
      });
    } catch {
      // Ignore native scheduling error
    }
  }

  /**
   * Synchronizes upcoming reminders directly into Android/iOS OS schedulers
   * so notifications fire reliably even when the app is closed.
   */
  async syncSchedules(notes: NoteItem[]): Promise<void> {
    try {
      const perm = await this.getPermission();
      if (perm !== 'granted') return;

      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({
          notifications: pending.notifications.map((n) => ({ id: n.id })),
        });
      }

      const now = Date.now();
      const upcoming = notes
        .filter((n) => !n.isDeleted && !n.isCompleted && Boolean(n.reminderAt))
        .map((n) => ({ note: n, at: new Date(n.reminderAt!).getTime() }))
        .filter(({ at }) => !Number.isNaN(at) && at > now + 2000)
        .slice(0, 50);

      if (upcoming.length === 0) return;

      await LocalNotifications.schedule({
        notifications: upcoming.map(({ note, at }) => ({
          id: hashNoteIdToInt(note.id),
          title: note.title.trim() || '여백 리마인더',
          body: '설정한 알림 시각이 되었습니다.',
          schedule: { at: new Date(at), allowWhileIdle: true },
          extra: { noteId: note.id },
        })),
      });
    } catch {
      // Ignore native scheduling error
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
  private adapter: NotificationAdapter | null = null;
  private timerId: number | null = null;
  private listeners = new Set<InAppListener>();

  private getAdapter(): NotificationAdapter {
    if (!this.adapter) {
      this.adapter =
        typeof window !== 'undefined' && Capacitor.isNativePlatform()
          ? new CapacitorNotificationAdapter()
          : new WebNotificationAdapter();
    }
    return this.adapter;
  }

  setAdapter(adapter: NotificationAdapter): void {
    this.adapter = adapter;
  }

  getPermission(): NotificationPermissionState {
    if (typeof window === 'undefined') return 'unsupported';
    if (Capacitor.isNativePlatform()) return 'default';
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  async getPermissionAsync(): Promise<NotificationPermissionState> {
    return this.getAdapter().getPermission();
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    return this.getAdapter().requestPermission();
  }

  async syncNativeSchedules(notes: NoteItem[]): Promise<void> {
    const adapter = this.getAdapter();
    if (adapter.syncSchedules) {
      await adapter.syncSchedules(notes);
    }
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
    // On native mobile, OS scheduler handles system alert; fire in-app banner too when active
    if (!Capacitor.isNativePlatform()) {
      await this.getAdapter().fireNow(title, body, `yeobaek-reminder-${note.id}`);
    }

    const event: InAppReminderEvent = {
      noteId: note.id,
      title,
      reminderAt: note.reminderAt ?? new Date().toISOString(),
    };
    this.listeners.forEach((listener) => listener(event));
  }
}

export const reminderScheduler = new ReminderScheduler();
