import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';
export function PageHeading({
  title,
  description,
  meta,
  action,
}: {
  title: string;
  description: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div className="min-w-0">
        <h1>{title}</h1>
        <p className="mt-1.5 max-w-prose text-sm text-slate-500">{description}</p>
        {meta && <p className="num mt-2 text-xs text-slate-500">{meta}</p>}
      </div>
      {action}
    </div>
  );
}
const statusWords: Record<string, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  DENIED: 'Declined',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ON_TIME: 'On time',
  LATE: 'Late',
  NO_SHOW: 'No show',
  EARLY_LEAVE: 'Left early',
  SCHEDULED: 'Scheduled',
  CLOCKED_IN: 'Clocked in',
  IN: 'Clocked in',
  OUT: 'Clocked out',
  NOT_ARRIVED: 'Not arrived',
};
/** Turns an API status like NO_SHOW into the word a shift lead would say. */
export function statusLabel(status: string) {
  return statusWords[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}
const statusTone: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  PENDING: 'warn',
  ACCEPTED: 'warn',
  APPROVED: 'ok',
  PUBLISHED: 'ok',
  ON_TIME: 'ok',
  CLOCKED_IN: 'ok',
  IN: 'ok',
  OUT: 'muted',
  NOT_ARRIVED: 'muted',
  LATE: 'bad',
  NO_SHOW: 'bad',
  EARLY_LEAVE: 'warn',
  REJECTED: 'muted',
  DENIED: 'muted',
  CANCELLED: 'muted',
  DRAFT: 'muted',
};
export function Stamp({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={'stamp stamp-' + (statusTone[status] ?? 'muted')}>
      {children ?? statusLabel(status)}
    </span>
  );
}
/** Money as the shop reads it: grouped digits, two decimals. */
export function money(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function WeekPicker({ week, onChange }: { week: string; onChange: (v: string) => void }) {
  const date = DateTime.fromISO(week);
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1">
      <button
        className="icon-btn"
        aria-label="Previous week"
        onClick={() => onChange(date.minus({ weeks: 1 }).toISODate()!)}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="num min-w-44 text-center text-sm font-semibold text-ink">
        {date.toFormat('dd MMM')} – {date.plus({ days: 6 }).toFormat('dd MMM yyyy')}
      </span>
      <button
        className="icon-btn"
        aria-label="Next week"
        onClick={() => onChange(date.plus({ weeks: 1 }).toISODate()!)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  inset = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  /** Already inside a card: drop the card frame so cards never nest. */
  inset?: boolean;
}) {
  return (
    <div className={(inset ? '' : 'card ') + 'py-14 text-center'}>
      <CalendarDays className="mx-auto mb-4 text-slate-400" size={28} />
      <h2>{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
export function QueryState({ loading, error }: { loading: boolean; error: boolean }) {
  return loading ? (
    <div className="card space-y-4" role="status" aria-label="Loading your workspace">
      <span className="sr-only">Loading your workspace…</span>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded-sm bg-slate-100 motion-reduce:animate-none"
          style={{ width: 100 - i * 12 + '%' }}
        />
      ))}
    </div>
  ) : error ? (
    <p className="card border-red-200 text-red-800" role="alert">
      This didn’t load. Check your connection, then refresh the page.
    </p>
  ) : null;
}
export function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
}
export function currentWeek(zone = 'UTC') {
  return DateTime.now().setZone(zone).startOf('week').toISODate()!;
}
export function scheduledHours(
  shifts: { startsAt: string; endsAt: string }[],
  week?: string,
  zone = 'UTC',
) {
  const start = week ? DateTime.fromISO(week, { zone }).toMillis() : -Infinity;
  const end = week ? DateTime.fromISO(week, { zone }).plus({ weeks: 1 }).toMillis() : Infinity;
  return shifts.reduce(
    (sum, s) =>
      sum +
      Math.max(0, Math.min(Date.parse(s.endsAt), end) - Math.max(Date.parse(s.startsAt), start)) /
        3600000,
    0,
  );
}
