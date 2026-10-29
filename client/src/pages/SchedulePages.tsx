import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  currentWeek,
  Empty,
  money,
  PageHeading,
  QueryState,
  scheduledHours,
  Stamp,
  WeekPicker,
} from '../components';
import { usePendingWork } from '../pending';
import type { Shift, User } from '../types';
import { ClockCard } from './Attendance';
import { SwapOffer } from './Requests';
const timeRange = (s: Shift, zone: string) =>
  DateTime.fromISO(s.startsAt)
    .setZone(s.location?.timezone ?? zone)
    .toFormat('HH:mm') +
  '–' +
  DateTime.fromISO(s.endsAt)
    .setZone(s.location?.timezone ?? zone)
    .toFormat('HH:mm');
function ShiftLine({ shift, zone, who }: { shift: Shift; zone: string; who: string }) {
  const start = DateTime.fromISO(shift.startsAt).setZone(shift.location?.timezone ?? zone);
  return (
    <li className="flex items-center gap-4 py-3">
      <span className="num w-14 shrink-0 text-center leading-tight">
        <span className="block text-xs text-slate-500">{start.toFormat('ccc')}</span>
        <span className="block text-lg font-semibold text-ink">{start.toFormat('dd')}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{who}</span>
        <span className="block truncate text-sm text-slate-500">
          <span className="num">{timeRange(shift, zone)}</span> · {shift.location?.name}
        </span>
      </span>
      <Stamp status={shift.status} />
    </li>
  );
}
interface BoardShift {
  liveStatus: string;
}
export function Dashboard() {
  const { user } = useAuth();
  const manager = user?.role !== 'EMPLOYEE';
  const zone = user?.organization?.timezone ?? 'UTC';
  const week = currentWeek(zone);
  const shifts = useQuery({
    queryKey: ['shifts', week],
    queryFn: async () =>
      (await api.get<{ shifts: Shift[] }>('/shifts', { params: { week } })).data.shifts,
  });
  const team = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<{ users: User[] }>('/users')).data.users,
    enabled: manager,
  });
  const board = useQuery({
    queryKey: ['attendance', 'board'],
    queryFn: async () =>
      (await api.get<{ shifts?: BoardShift[] }>('/attendance')).data.shifts ?? [],
    enabled: manager,
  });
  const pending = usePendingWork(manager);
  const list = shifts.data ?? [];
  const mine = list.filter((s) => s.userId === user?.id && s.status === 'PUBLISHED');
  const total = scheduledHours(list, week, zone);
  const cost = list.reduce(
    (sum, s) =>
      sum +
      scheduledHours([s], week, zone) *
        Number(team.data?.find((u) => u.id === s.userId)?.hourlyRate ?? 0),
    0,
  );
  const upcoming = (manager ? list : mine).filter((s) => Date.parse(s.endsAt) > Date.now());
  const now = DateTime.now().setZone(zone);
  const drafts = list.filter((s) => s.status === 'DRAFT').length;
  const trouble = (board.data ?? []).filter((s) => ['LATE', 'NO_SHOW'].includes(s.liveStatus));
  const queue = [
    { count: pending.timeOff.length, label: 'time-off requests to decide', to: '/app/requests' },
    { count: pending.swaps.length, label: 'swaps ready to approve', to: '/app/requests' },
    { count: drafts, label: 'draft shifts not yet published', to: '/app/roster' },
    { count: trouble.length, label: 'late or missing today', to: '/app/attendance', bad: true },
  ];
  const waiting = queue.filter((q) => q.count > 0);
  return (
    <>
      <PageHeading
        title={manager ? 'Today at ' + (user?.organization?.name ?? 'your shop') : 'Today'}
        description={
          manager
            ? 'What needs a decision, then how this week adds up.'
            : 'Your next shift and the rest of your week.'
        }
        meta={now.toFormat('cccc dd LLL yyyy · HH:mm') + ' · ' + zone}
        action={
          manager ? (
            <Link className="btn-primary" to="/app/roster">
              Open roster
              <ArrowRight size={16} />
            </Link>
          ) : undefined
        }
      />
      {!manager && <ClockCard next={upcoming[0]} />}
      <QueryState
        loading={shifts.isPending || (manager && team.isPending)}
        error={shifts.isError || team.isError}
      />
      {manager && (
        <section aria-labelledby="needs-you" className="mb-8">
          <h2 id="needs-you" className="mb-3">
            Needs you
          </h2>
          {waiting.length ? (
            <ul className="grid gap-px overflow-hidden rounded-[10px] border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
              {waiting.map((q) => (
                <li key={q.label} className="bg-white">
                  <Link
                    to={q.to}
                    className="group flex h-full items-center gap-4 px-5 py-4 hover:bg-slate-50"
                  >
                    <span
                      className={
                        'num text-3xl font-semibold ' + (q.bad ? 'text-red-700' : 'text-ink')
                      }
                    >
                      {q.count}
                    </span>
                    <span className="flex-1 text-sm text-slate-600">{q.label}</span>
                    <ArrowRight
                      size={16}
                      className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-ink"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card flex items-center gap-3 py-4 text-sm text-slate-600">
              <Stamp status="APPROVED">All clear</Stamp>
              {pending.loading ? 'Checking requests…' : 'Nothing is waiting on you right now.'}
            </p>
          )}
        </section>
      )}
      {!shifts.isPending && !shifts.isError && (
        <div className={'grid gap-6 ' + (manager ? 'xl:grid-cols-[1.4fr_1fr]' : '')}>
          <section className="card">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2>{manager ? 'Coming up this week' : 'Your week'}</h2>
              <Link
                to={manager ? '/app/roster' : '/app/schedule'}
                className="text-sm font-semibold text-ink underline"
              >
                {manager ? 'Full roster' : 'Full schedule'}
              </Link>
            </div>
            {upcoming.length ? (
              <ul className="divide-y divide-slate-100">
                {upcoming.slice(0, manager ? 6 : 7).map((s) => (
                  <ShiftLine
                    key={s.id}
                    shift={s}
                    zone={zone}
                    who={
                      manager
                        ? (team.data?.find((u) => u.id === s.userId)?.name ?? 'Open shift')
                        : s.position
                    }
                  />
                ))}
              </ul>
            ) : manager ? (
              <Empty
                inset
                title="Nothing left on this week’s roster"
                description="Either the week is done or it hasn’t been built yet. Check the roster before your team asks."
                action={
                  <Link to="/app/roster" className="btn-primary">
                    Build the roster
                  </Link>
                }
              />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                No more published shifts this week. Check{' '}
                <Link to="/app/schedule" className="font-semibold text-ink underline">
                  next week
                </Link>{' '}
                or pick up an{' '}
                <Link to="/app/open-shifts" className="font-semibold text-ink underline">
                  open shift
                </Link>
                .
              </p>
            )}
          </section>
          {manager && (
            <section className="card self-start">
              <h2>This week adds up to</h2>
              <p className="num mt-1 text-xs text-slate-500">
                {DateTime.fromISO(week).toFormat('dd LLL')} –{' '}
                {DateTime.fromISO(week).plus({ days: 6 }).toFormat('dd LLL yyyy')}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {[
                  ['Shifts', String(list.length)],
                  ['Scheduled hours', total.toFixed(1) + ' h'],
                  ['People on the roster', String(new Set(list.map((s) => s.userId)).size)],
                  ['Drafts not published', String(drafts)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-slate-600">{label}</dt>
                    <dd className="num text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="tally tally-total mt-4 flex items-baseline justify-between text-sm">
                <span className="font-sans font-semibold">Estimated labour</span>
                <span>{money(cost)}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">Hours × each person’s hourly rate.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}
export function MySchedule() {
  const [offered, setOffered] = useState<Shift | null>(null);
  const { user } = useAuth();
  const [week, setWeek] = useState(currentWeek(user?.organization?.timezone));
  const query = useQuery({
    queryKey: ['shifts', week],
    queryFn: async () =>
      (await api.get<{ shifts: Shift[] }>('/shifts', { params: { week } })).data.shifts,
  });
  const shifts = (query.data ?? []).filter(
    (s) => s.userId === user?.id && s.status === 'PUBLISHED',
  );
  const hours = scheduledHours(shifts, week, user?.organization?.timezone);
  return (
    <>
      <PageHeading
        title="My schedule"
        description="Your published shifts. Offer one to a coworker if you can’t make it."
        action={<WeekPicker week={week} onChange={setWeek} />}
      />
      <QueryState loading={query.isPending} error={query.isError} />
      {!query.isPending &&
        !query.isError &&
        (shifts.length ? (
          <section className="card max-w-3xl p-0 sm:p-0">
            <ul className="divide-y divide-slate-100">
              {shifts.map((s) => {
                const zone = s.location?.timezone ?? 'UTC';
                const start = DateTime.fromISO(s.startsAt).setZone(zone);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6"
                  >
                    <span className="num w-20 shrink-0 leading-tight">
                      <span className="block text-xs text-slate-500">{start.toFormat('cccc')}</span>
                      <span className="block font-semibold text-ink">
                        {start.toFormat('dd LLL')}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="num block text-lg font-semibold text-ink">
                        {timeRange(s, zone)}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {s.position} · {s.location?.name}
                      </span>
                      {s.notes && (
                        <span className="mt-1 block text-sm text-slate-600">{s.notes}</span>
                      )}
                    </span>
                    {Date.parse(s.startsAt) > Date.now() && (
                      <button className="btn-secondary" onClick={() => setOffered(s)}>
                        Swap
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="tally tally-total mx-4 mb-4 flex justify-between sm:mx-6">
              <span className="font-sans font-semibold">
                {shifts.length} {shifts.length === 1 ? 'shift' : 'shifts'}
              </span>
              <span>{hours.toFixed(1)} h</span>
            </div>
          </section>
        ) : (
          <Empty
            title="No published shifts this week"
            description="Your manager hasn’t published shifts for you yet. Try the next week, or pick up an open shift."
            action={
              <Link to="/app/open-shifts" className="btn-secondary">
                See open shifts
              </Link>
            }
          />
        ))}
      {offered && <SwapOffer shift={offered} close={() => setOffered(null)} />}
    </>
  );
}
