import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow ?? 'YOUR WORKSPACE'}</p>
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function WeekPicker({ week, onChange }: { week: string; onChange: (v: string) => void }) {
  const date = DateTime.fromISO(week);
  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5">
      <button
        className="icon-btn"
        aria-label="Previous week"
        onClick={() => onChange(date.minus({ weeks: 1 }).toISODate()!)}
      >
        <ChevronLeft size={18} />
      </button>
      <CalendarDays size={17} className="text-slate-400" />
      <span className="min-w-40 text-center text-sm font-semibold">
        {date.toFormat('MMM d')} – {date.plus({ days: 6 }).toFormat('MMM d, yyyy')}
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
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="card py-16 text-center">
      <CalendarDays className="mx-auto mb-4 text-emerald-700" size={32} />
      <h2>{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}
export function QueryState({ loading, error }: { loading: boolean; error: boolean }) {
  return loading ? (
    <p className="card text-slate-500" role="status">
      Loading your workspace…
    </p>
  ) : error ? (
    <p className="card text-red-700" role="alert">
      We couldn’t load this information. Refresh to try again.
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
