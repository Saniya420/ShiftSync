import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ArrowRight, CalendarDays, Clock3, Users, Wallet, Sun } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  currentWeek,
  Empty,
  PageHeading,
  QueryState,
  scheduledHours,
  WeekPicker,
} from '../components';
import type { Shift, User } from '../types';
import { ClockCard } from './Attendance';
import { SwapOffer } from './Requests';
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
  const list = shifts.data ?? [];
  const total = scheduledHours(list, week, zone);
  const cost = list.reduce(
    (sum, s) =>
      sum +
      scheduledHours([s], week, zone) *
        Number(team.data?.find((u) => u.id === s.userId)?.hourlyRate ?? 0),
    0,
  );
  const upcoming = list.filter((s) => Date.parse(s.endsAt) > Date.now()).slice(0, 4);
  const stats = [
    {
      label: manager ? 'Scheduled shifts' : 'Your shifts',
      value: String(list.length),
      icon: CalendarDays,
      detail: 'This week',
    },
    {
      label: 'Scheduled hours',
      value: total.toFixed(1) + 'h',
      icon: Clock3,
      detail: 'A clear plan ahead',
    },
    ...(manager
      ? [
          {
            label: 'Team members',
            value: String(team.data?.length ?? 0),
            icon: Users,
            detail: 'People make it happen',
          },
          {
            label: 'Estimated labor',
            value: cost.toFixed(2),
            icon: Wallet,
            detail: 'Hours × hourly rate',
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE CLARITY FOR YOUR DAY"
        title={'Hello, ' + user?.name.split(' ')[0] + '.'}
        description="Here’s how your week is shaping up."
        action={
          <Link className="btn-primary" to={manager ? '/app/roster' : '/app/schedule'}>
            {manager ? 'Open roster' : 'My schedule'}
            <ArrowRight size={16} />
          </Link>
        }
      />
      {!manager && <ClockCard />}
      <div className="mb-7 flex items-center gap-4 rounded-2xl border border-[#d8e8d8] bg-[#eaf1e7] px-6 py-5">
        <Sun size={30} className="shrink-0 text-emerald-700" />
        <div>
          <h2 className="text-base">A good week starts with everyone in sync.</h2>
          <p className="mt-1 text-sm text-emerald-900/60">
            {manager
              ? 'Plan your shifts, spot conflicts early, and give your team a clear view.'
              : 'Your published shifts and availability, all in one place.'}
          </p>
        </div>
      </div>
      <QueryState
        loading={shifts.isPending || (manager && team.isPending)}
        error={shifts.isError || team.isError}
      />
      {!shifts.isPending && !shifts.isError && (
        <>
          <div className={'mb-9 grid gap-4 sm:grid-cols-2 ' + (manager ? 'xl:grid-cols-4' : '')}>
            {stats.map(({ label, value, icon: Icon, detail }) => (
              <div className="card" key={label}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{label}</span>
                  <Icon size={18} className="text-emerald-700" />
                </div>
                <p className="mt-5 text-3xl font-bold tracking-tight text-ink">{value}</p>
                <p className="mt-2 text-xs text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section className="card">
              <div className="mb-5 flex items-center justify-between">
                <h2>Coming up next</h2>
                <span className="text-xs text-slate-400">This week</span>
              </div>
              {upcoming.length ? (
                upcoming.map((s) => (
                  <div
                    className="flex items-center gap-4 border-t border-slate-100 py-4"
                    key={s.id}
                  >
                    <div className="w-12 rounded-xl bg-slate-50 py-2 text-center">
                      <p className="text-[10px] uppercase text-slate-400">
                        {DateTime.fromISO(s.startsAt)
                          .setZone(s.location?.timezone ?? zone)
                          .toFormat('ccc')}
                      </p>
                      <p className="text-xl font-bold text-ink">
                        {DateTime.fromISO(s.startsAt).setZone(s.location?.timezone ?? zone).day}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {manager
                          ? (team.data?.find((u) => u.id === s.userId)?.name ?? 'Open shift')
                          : s.position}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {DateTime.fromISO(s.startsAt)
                          .setZone(s.location?.timezone ?? zone)
                          .toFormat('HH:mm')}{' '}
                        –{' '}
                        {DateTime.fromISO(s.endsAt)
                          .setZone(s.location?.timezone ?? zone)
                          .toFormat('HH:mm')}{' '}
                        · {s.location?.name}
                      </p>
                    </div>
                    <span
                      className={
                        'badge ' +
                        (s.status === 'PUBLISHED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700')
                      }
                    >
                      {s.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-12 text-center text-sm text-slate-400">
                  No more shifts this week. A little breathing room.
                </p>
              )}
            </section>
            <section className="card bg-[#f0eee5]">
              <p className="eyebrow">MAKE YOURSELF AVAILABLE</p>
              <h2 className="max-w-56 text-2xl leading-snug">
                Good schedules start with good communication.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Keep your available hours up to date so your team knows when you’re ready to work.
              </p>
              <Link to="/app/availability" className="btn-secondary mt-7">
                Update availability
                <ArrowRight size={16} />
              </Link>
            </section>
          </div>
        </>
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
  return (
    <>
      <PageHeading
        title="My schedule"
        description="Your published shifts. A clear view of the week ahead."
        action={<WeekPicker week={week} onChange={setWeek} />}
      />
      <QueryState loading={query.isPending} error={query.isError} />
      {!query.isPending &&
        !query.isError &&
        (shifts.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shifts.map((s) => (
              <article key={s.id} className="card border-t-4 border-t-emerald-600">
                <p className="eyebrow">
                  {DateTime.fromISO(s.startsAt)
                    .setZone(s.location?.timezone ?? 'UTC')
                    .toFormat('cccc, MMM d')}
                </p>
                <h2>{s.position}</h2>
                <p className="mt-4 text-2xl font-semibold text-ink">
                  {DateTime.fromISO(s.startsAt)
                    .setZone(s.location?.timezone ?? 'UTC')
                    .toFormat('HH:mm')}{' '}
                  –{' '}
                  {DateTime.fromISO(s.endsAt)
                    .setZone(s.location?.timezone ?? 'UTC')
                    .toFormat('HH:mm')}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {s.location?.name} · {s.location?.timezone}
                </p>
                {s.notes && (
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    {s.notes}
                  </p>
                )}
                <span className="badge mt-5 bg-emerald-50 text-emerald-700">Published</span>
                {Date.parse(s.startsAt) > Date.now() && (
                  <button className="btn-secondary ml-3" onClick={() => setOffered(s)}>
                    Swap
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Your week is still taking shape"
            description="Published shifts will appear here as soon as your manager shares the roster."
          />
        ))}
      {offered && <SwapOffer shift={offered} close={() => setOffered(null)} />}
    </>
  );
}
