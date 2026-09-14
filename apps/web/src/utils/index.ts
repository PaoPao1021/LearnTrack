export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const TZ = 'Asia/Shanghai';

export function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function minuteOfDay(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function parseLocalTimeInTz(v: string, timeZone: string = TZ): number {
  const asUtc = new Date(`${v}:00Z`);
  const utcDate = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(asUtc.toLocaleString('en-US', { timeZone }));
  const offset = tzDate.getTime() - utcDate.getTime();
  return asUtc.getTime() - offset;
}

export function shiftDateKey(dateKey: string, daysDelta: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + daysDelta);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

