export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayString(): string {
  return toDateString(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateString(dt);
}

export function formatKoreanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${m}월 ${d}일 (${weekdays[dt.getDay()]})`;
}

export function formatShortDate(dateStr: string): string {
  const today = getTodayString();
  if (dateStr === today) return '오늘';
  if (dateStr === addDays(today, 1)) return '내일';
  if (dateStr === addDays(today, -1)) return '어제';

  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const currentYear = new Date().getFullYear();
  if (y === currentYear) {
    return `${m}월 ${d}일`;
  }
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

export function formatTimestamp(ts: number): string {
  const dt = new Date(ts);
  const now = new Date();
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();

  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');

  if (sameDay) {
    return `오늘 ${hh}:${mm}`;
  }
  if (dt.getFullYear() === now.getFullYear()) {
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
  }
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

export function formatReminderLabel(isoString: string): string {
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return '';
  const datePart = formatShortDate(toDateString(dt));
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${datePart} ${hh}:${mm}`;
}

export function toDateTimeLocalValue(isoString?: string): string {
  if (!isoString) return '';
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function fromDateTimeLocalValue(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const dt = new Date(localValue);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

export interface CalendarCell {
  dateStr: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  weekday: number;
}

export function buildMonthGrid(year: number, monthIndex: number): CalendarCell[] {
  const firstDay = new Date(year, monthIndex, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayStr = getTodayString();

  const cells: CalendarCell[] = [];

  // Previous month filler
  for (let i = startWeekday - 1; i >= 0; i--) {
    const dt = new Date(year, monthIndex, -i);
    const dateStr = toDateString(dt);
    cells.push({
      dateStr,
      day: dt.getDate(),
      inCurrentMonth: false,
      isToday: dateStr === todayStr,
      weekday: dt.getDay(),
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d);
    const dateStr = toDateString(dt);
    cells.push({
      dateStr,
      day: d,
      inCurrentMonth: true,
      isToday: dateStr === todayStr,
      weekday: dt.getDay(),
    });
  }

  // Next month filler up to 35 or 42 cells
  const totalCells = cells.length <= 35 ? 35 : 42;
  let nextDay = 1;
  while (cells.length < totalCells) {
    const dt = new Date(year, monthIndex + 1, nextDay++);
    const dateStr = toDateString(dt);
    cells.push({
      dateStr,
      day: dt.getDate(),
      inCurrentMonth: false,
      isToday: dateStr === todayStr,
      weekday: dt.getDay(),
    });
  }

  return cells;
}
