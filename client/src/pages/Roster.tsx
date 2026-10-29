import { AiRoster } from './AiRoster';
import { RosterBatch } from './RosterBatch';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, Copy, Plus, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import {
  currentWeek,
  Empty,
  initials,
  money,
  PageHeading,
  QueryState,
  scheduledHours,
  Stamp,
  WeekPicker,
} from '../components';
import { Modal } from '../Modal';
import type { Location, Shift, User, Warning } from '../types';
type Selection = { shift?: Shift; userId: string | null; date: string };
// A position keeps the same colour tick everywhere; colour never encodes row order.
// No reds, ambers or oranges here: those hues mean trouble on this screen.
const positionTicks = [
  'bg-sky-600',
  'bg-teal-600',
  'bg-fuchsia-600',
  'bg-lime-600',
  'bg-cyan-800',
  'bg-pink-400',
];
export function positionTick(position: string) {
  let hash = 0;
  for (const char of position.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return positionTicks[hash % positionTicks.length];
}
const warningWords: Record<string, string> = {
  OVERLAP: 'Overlap',
  OUTSIDE_AVAILABILITY: 'Unavailable',
  TIME_OFF: 'On leave',
  WEEKLY_HOURS: 'Over hours',
  REST: 'Short rest',
  UNDERSTAFFED: 'Understaffed',
  INVALID_TIME: 'Bad time',
};
export const warningLabel = (w: Warning) => warningWords[w.type] ?? w.type;
const hm = (value: string, zone: string) => DateTime.fromISO(value).setZone(zone).toFormat('HH:mm');
export function Roster() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [positionFilter, setPositionFilter] = useState('');
  const [week, setWeek] = useState(currentWeek(user?.organization?.timezone));
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pendingAction, setPendingAction] = useState<'copy-previous-week' | 'publish' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionWarnings, setActionWarnings] = useState<Warning[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<{ locations: Location[] }>('/locations')).data.locations,
  });
  const team = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<{ users: User[] }>('/users')).data.users,
  });
  const locationId = selectedLocation || locations.data?.[0]?.id || '';
  const location = locations.data?.find((l) => l.id === locationId);
  const zone = location?.timezone ?? 'UTC';
  const roster = useQuery({
    queryKey: ['shifts', week, locationId],
    enabled: !!locationId,
    queryFn: async () =>
      (await api.get<{ shifts: Shift[] }>('/shifts', { params: { week, locationId } })).data.shifts,
  });
  const allShifts = roster.data ?? [];
  const shifts = allShifts.filter((s) => !positionFilter || s.position === positionFilter);
  const people = (team.data ?? []).filter(
    (p) => p.active !== false && p.locations?.some((l) => l.locationId === locationId),
  );
  // Keep historical assignments visible after a member is removed from the location.
  const rows = [
    ...people,
    ...(team.data ?? []).filter(
      (p) => !people.some((u) => u.id === p.id) && shifts.some((s) => s.userId === p.id),
    ),
  ];
  const days = Array.from({ length: 7 }, (_, i) =>
    DateTime.fromISO(week, { zone }).plus({ days: i }),
  );
  const today = DateTime.now().setZone(zone);
  const inDay = (list: Shift[], day: DateTime) =>
    list.filter(
      (s) =>
        DateTime.fromISO(s.startsAt) < day.plus({ days: 1 }) && DateTime.fromISO(s.endsAt) > day,
    );
  // Hours of each shift that fall inside this calendar day, so overnight shifts split correctly.
  const dayHours = (list: Shift[], day: DateTime) =>
    list.reduce(
      (sum, s) =>
        sum +
        Math.max(
          0,
          Math.min(Date.parse(s.endsAt), day.plus({ days: 1 }).toMillis()) -
            Math.max(Date.parse(s.startsAt), day.toMillis()),
        ) /
          3600000,
      0,
    );
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['shifts'] });
  };
  const action = async (kind: 'copy-previous-week' | 'publish', force = false) => {
    setActionBusy(true);
    setActionWarnings([]);
    setPendingAction(null);
    setReviewOpen(false);
    try {
      const result = await api.post('/shifts/' + kind, { week, locationId, force });
      await refresh();
      setActionWarnings(result.data.warnings ?? []);
      if (kind === 'publish') setPublishedAt(today.toFormat('ccc HH:mm'));
      toast.success(
        kind === 'publish'
          ? result.data.published + ' shifts published.'
          : result.data.shifts.length + ' shifts copied.',
      );
    } catch (error) {
      toast.error(errorMessage(error));
      if (axios.isAxiosError(error)) {
        setActionWarnings(error.response?.data?.error?.details?.warnings ?? []);
        if (error.response?.data?.error?.code === 'SHIFT_OVERLAP') setPendingAction(kind);
      }
    } finally {
      setActionBusy(false);
    }
  };
  const drafts = allShifts.filter((s) => s.status === 'DRAFT');
  const hasDraft = drafts.length > 0;
  const warningCount = shifts.filter((s) => s.warnings.length).length;
  const positions = [...new Set(allShifts.map((s) => s.position))];
  const weekHours = scheduledHours(shifts, week, zone);
  const weekCost = shifts.reduce(
    (sum, s) =>
      sum +
      scheduledHours([s], week, zone) *
        Number(team.data?.find((u) => u.id === s.userId)?.hourlyRate ?? 0),
    0,
  );
  return (
    <>
      <PageHeading
        title="Roster"
        description="Build the week, clear the warnings, then publish it to your team."
        meta={
          location &&
          location.name +
            ' · ' +
            zone +
            ' · ' +
            shifts.length +
            ' shifts · ' +
            weekHours.toFixed(1) +
            ' h'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary"
              disabled={!locationId || actionBusy}
              onClick={() => void action('copy-previous-week')}
            >
              <Copy size={15} />
              Copy last week
            </button>
            <button
              className="btn-secondary"
              disabled={!locationId}
              onClick={() => setSelection({ userId: rows[0]?.id ?? null, date: week })}
            >
              <Plus size={16} />
              Add shift
            </button>
            <button
              className="btn-primary"
              disabled={!locationId || actionBusy || !hasDraft}
              aria-describedby="publish-state"
              onClick={() => setReviewOpen(true)}
            >
              <Send size={15} />
              {actionBusy ? 'Working…' : 'Publish week'}
            </button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <WeekPicker
            week={week}
            onChange={(v) => {
              setWeek(v);
              setActionWarnings([]);
              setPendingAction(null);
              setPublishedAt(null);
            }}
          />
          <label className="min-w-40">
            <span className="sr-only">Location</span>
            <select
              aria-label="Location"
              className="m-0 py-2.5"
              value={locationId}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setActionWarnings([]);
                setPendingAction(null);
                setPublishedAt(null);
              }}
            >
              {locations.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p id="publish-state" className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {location &&
            (hasDraft ? (
              <>
                <Stamp status="DRAFT">{drafts.length} draft</Stamp>
                not published yet
              </>
            ) : allShifts.length ? (
              <>
                <Stamp status="PUBLISHED">
                  {publishedAt ? 'Published ' + publishedAt : 'Published'}
                </Stamp>
                Nothing new to publish
              </>
            ) : (
              'No shifts this week yet'
            ))}
          {warningCount > 0 && (
            <Stamp status="LATE">
              <AlertTriangle size={12} aria-hidden="true" />
              {warningCount} with warnings
            </Stamp>
          )}
        </p>
      </div>
      {actionWarnings.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-[10px] border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <strong>Review these conflicts</strong>
          <ul className="mt-2 list-inside list-disc">
            {[...new Set(actionWarnings.map((w) => w.message))].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {pendingAction && (
            <button
              disabled={actionBusy}
              className="btn-secondary mt-3"
              onClick={() => void action(pendingAction, true)}
            >
              {pendingAction === 'publish' ? 'Publish with overlap' : 'Copy with overlap'}
            </button>
          )}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="min-w-44">
          <span className="sr-only">Position</span>
          <select
            aria-label="Position"
            className="m-0 py-2"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
          >
            <option value="">All positions</option>
            {positions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button
          className="btn-secondary py-2"
          disabled={!locationId}
          onClick={() => setAiOpen(true)}
        >
          Suggest with AI
        </button>
        <RosterBatch
          key={week + locationId}
          week={week}
          locationId={locationId}
          shifts={shifts}
          people={team.data ?? []}
        />
      </div>
      {aiOpen && (
        <AiRoster
          key={week + locationId}
          week={week}
          locationId={locationId}
          zone={zone}
          people={team.data ?? []}
          onClose={() => setAiOpen(false)}
        />
      )}
      <QueryState
        loading={locations.isPending || team.isPending || (!!locationId && roster.isPending)}
        error={locations.isError || team.isError || roster.isError}
      />
      {locations.data?.length === 0 && (
        <Empty
          title="Add a location first"
          description="A roster belongs to a location. Add one and invite your team to start building."
          action={
            <Link to="/app/team" className="btn-primary">
              Set up your team
            </Link>
          }
        />
      )}
      {location && team.data && !roster.isPending && !roster.isError && (
        <div className="overflow-x-auto rounded-[10px] border border-slate-300 bg-white">
          <table className="roster-grid w-full min-w-[1080px] table-fixed border-collapse text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-52 border-r border-b border-slate-200 px-4 py-3 text-xs font-medium text-slate-600">
                  Team · <span className="num">{rows.length}</span>
                </th>
                {days.map((day) => {
                  const isToday = day.hasSame(today, 'day');
                  return (
                    <th
                      key={day.toISODate()}
                      aria-current={isToday ? 'date' : undefined}
                      className={
                        'border-r border-b border-slate-200 px-2 py-2.5 text-center ' +
                        (isToday
                          ? 'bg-stamp-50 shadow-[inset_0_-3px_0_var(--color-stamp-600)]'
                          : '')
                      }
                    >
                      <span className="block text-xs font-medium text-slate-600">
                        {isToday ? 'Today' : day.toFormat('ccc')}
                      </span>
                      <span className="num block text-lg font-semibold text-ink">
                        {day.toFormat('dd')}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {[...rows, null].map((person) => {
                const own = shifts.filter((s) => s.userId === (person?.id ?? null));
                const hours = scheduledHours(own, week, zone);
                const over = person ? hours > person.maxWeeklyHours : false;
                return (
                  <tr key={person?.id ?? 'open'}>
                    <th className="border-r border-b border-slate-100 px-4 py-3 align-top font-normal">
                      <div className="flex items-center gap-2.5">
                        <span className="avatar h-8 w-8">
                          {person ? initials(person.name) : <Plus size={14} />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {person?.name ?? 'Open shifts'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {person
                              ? person.role.charAt(0) + person.role.slice(1).toLowerCase()
                              : 'Not assigned yet'}
                          </p>
                        </div>
                      </div>
                      <div className="num mt-2.5 flex justify-between text-xs">
                        <span className={over ? 'font-semibold text-red-700' : 'text-slate-600'}>
                          {hours.toFixed(1)}h{person ? ' / ' + person.maxWeeklyHours + 'h' : ''}
                        </span>
                        {person && (
                          <span className="text-slate-500">
                            {money(hours * Number(person.hourlyRate))}
                          </span>
                        )}
                      </div>
                      {person && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={'h-full ' + (over ? 'bg-red-600' : 'bg-ink')}
                            style={{
                              width:
                                Math.min(100, (hours / Math.max(1, person.maxWeeklyHours)) * 100) +
                                '%',
                            }}
                          />
                        </div>
                      )}
                    </th>
                    {days.map((day) => (
                      <td
                        key={day.toISODate()}
                        className={
                          'border-r border-b border-slate-100 p-1.5 align-top ' +
                          (day.hasSame(today, 'day') ? 'bg-stamp-50/40' : '')
                        }
                      >
                        <div className="min-h-24 space-y-1.5">
                          {inDay(own, day).map((s) => {
                            const draft = s.status === 'DRAFT';
                            const trouble = s.warnings.length > 0;
                            return (
                              <button
                                key={s.id}
                                onClick={() =>
                                  setSelection({
                                    shift: s,
                                    userId: s.userId,
                                    date: day.toISODate()!,
                                  })
                                }
                                aria-label={
                                  'Edit ' +
                                  (person?.name ?? 'open') +
                                  ' shift on ' +
                                  day.toISODate() +
                                  (draft ? ', draft' : ', published') +
                                  (trouble
                                    ? ', warnings: ' + s.warnings.map((w) => w.message).join(' ')
                                    : '')
                                }
                                className={
                                  'relative w-full rounded-md py-2 pr-2 pl-3 text-left transition hover:border-ink ' +
                                  (trouble
                                    ? 'border border-red-400 bg-red-50'
                                    : draft
                                      ? 'draft-slip'
                                      : 'border border-slate-300 bg-white')
                                }
                              >
                                <span
                                  className={
                                    'absolute top-2 bottom-2 left-1 w-[3px] rounded-full ' +
                                    positionTick(s.position)
                                  }
                                  aria-hidden="true"
                                />
                                <span className="num block text-[13px] font-semibold text-ink">
                                  {hm(s.startsAt, zone)}–{hm(s.endsAt, zone)}
                                </span>
                                <span
                                  className={
                                    'block truncate text-xs ' +
                                    (draft ? 'text-slate-500 italic' : 'text-slate-600')
                                  }
                                >
                                  {draft ? 'Draft · ' : ''}
                                  {s.position}
                                </span>
                                {trouble && (
                                  <span className="mt-1 flex flex-wrap gap-1">
                                    {[...new Set(s.warnings.map(warningLabel))].map((w) => (
                                      <span
                                        key={w}
                                        className="rounded-sm bg-red-700 px-1 text-[11px] font-semibold text-white"
                                      >
                                        {w}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          <button
                            aria-label={
                              'Add ' + (person?.name ?? 'open') + ' shift on ' + day.toISODate()
                            }
                            className="flex w-full items-center justify-center rounded-md border border-dashed border-transparent py-1.5 text-slate-400 transition hover:border-slate-400 hover:bg-white hover:text-ink focus-visible:border-slate-400"
                            onClick={() =>
                              setSelection({ userId: person?.id ?? null, date: day.toISODate()! })
                            }
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 align-top">
                <th className="border-r border-slate-200 px-4 pt-2 pb-3 font-normal">
                  <span className="tally tally-total flex justify-between text-sm">
                    <span>{weekHours.toFixed(1)} h</span>
                    <span>{money(weekCost)}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">Week total · labour</span>
                </th>
                {days.map((day) => {
                  const list = inDay(shifts, day);
                  const filled = list.filter((s) => s.userId);
                  const open = list.length - filled.length;
                  return (
                    <td key={day.toISODate()} className="border-r border-slate-200 px-2 pt-2 pb-3">
                      <span className="tally block text-right">
                        <span className="block text-ink">{dayHours(list, day).toFixed(1)} h</span>
                        <span className="block">
                          {new Set(filled.map((s) => s.userId)).size} on
                        </span>
                        {open > 0 && <span className="block text-red-700">{open} open</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        {positions.map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={'h-3 w-[3px] rounded-full ' + positionTick(p)} aria-hidden="true" />
            {p}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="draft-slip h-3 w-5 rounded-sm" aria-hidden="true" />
          Draft
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-red-400 bg-red-50" aria-hidden="true" />
          Has warnings
        </span>
        <span className="text-slate-500">
          Labour uses hourly rates only; taxes and overtime premiums are not included.
        </span>
      </div>
      {reviewOpen && (
        <PublishReview
          drafts={drafts}
          people={team.data ?? []}
          week={week}
          zone={zone}
          locationName={location?.name ?? ''}
          busy={actionBusy}
          onClose={() => setReviewOpen(false)}
          onPublish={() => void action('publish')}
        />
      )}
      {selection && location && (
        <ShiftModal
          selection={selection}
          location={location}
          people={rows}
          onClose={() => setSelection(null)}
          onSaved={async () => {
            setSelection(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
function PublishReview({
  drafts,
  people,
  week,
  zone,
  locationName,
  busy,
  onClose,
  onPublish,
}: {
  drafts: Shift[];
  people: User[];
  week: string;
  zone: string;
  locationName: string;
  busy: boolean;
  onClose: () => void;
  onPublish: () => void;
}) {
  const notified = new Set(drafts.map((s) => s.userId).filter(Boolean)).size;
  const open = drafts.filter((s) => !s.userId).length;
  const warned = drafts.filter((s) => s.warnings.length);
  const hours = scheduledHours(drafts, week, zone);
  const cost = drafts.reduce(
    (sum, s) =>
      sum +
      scheduledHours([s], week, zone) *
        Number(people.find((u) => u.id === s.userId)?.hourlyRate ?? 0),
    0,
  );
  const start = DateTime.fromISO(week);
  return (
    <Modal title="Publish this week?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        {locationName} ·{' '}
        <span className="num">
          {start.toFormat('dd LLL')} – {start.plus({ days: 6 }).toFormat('dd LLL yyyy')}
        </span>
      </p>
      <dl className="mt-5 space-y-2 text-sm">
        {[
          ['Draft shifts going live', String(drafts.length)],
          ['People notified', String(notified)],
          ['Open shifts with nobody assigned', String(open)],
          ['Hours', hours.toFixed(1) + ' h'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-slate-600">{label}</dt>
            <dd className="num text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="tally tally-total mt-3 flex justify-between text-sm">
        <span className="font-sans">Labour for these shifts</span>
        <span>{money(cost)}</span>
      </div>
      {warned.length > 0 ? (
        <div className="mt-5 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <strong>
            {warned.length} {warned.length === 1 ? 'shift has' : 'shifts have'} warnings
          </strong>
          <ul className="mt-1.5 list-inside list-disc">
            {[...new Set(warned.flatMap((s) => s.warnings.map((w) => w.message)))]
              .slice(0, 6)
              .map((m) => (
                <li key={m}>{m}</li>
              ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-600">
          <Stamp status="APPROVED">No warnings</Stamp>
          Every draft passed the conflict check.
        </p>
      )}
      <p className="mt-5 text-sm text-slate-600">
        Your team sees these shifts and gets a notification as soon as you publish. You can still
        edit a published shift afterwards.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Keep editing
        </button>
        <button className="btn-primary" disabled={busy} onClick={onPublish}>
          <Send size={15} />
          Publish and notify
        </button>
      </div>
    </Modal>
  );
}
function ShiftModal({
  selection,
  location,
  people,
  onClose,
  onSaved,
}: {
  selection: Selection;
  location: Location;
  people: User[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const shift = selection.shift;
  const zone = location.timezone;
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<Warning[]>(shift?.warnings ?? []);
  const [overlap, setOverlap] = useState(false);
  const local = (value: string) =>
    DateTime.fromISO(value).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm");
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    const startsAt = DateTime.fromISO(String(data.get('startsAt')), { zone }),
      endsAt = DateTime.fromISO(String(data.get('endsAt')), { zone });
    if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) {
      toast.error('Choose an end time after the start time.');
      setBusy(false);
      return;
    }
    // Reject nonexistent local clock times rather than silently moving them across a DST gap.
    if (
      startsAt.toFormat("yyyy-MM-dd'T'HH:mm") !== data.get('startsAt') ||
      endsAt.toFormat("yyyy-MM-dd'T'HH:mm") !== data.get('endsAt')
    ) {
      toast.error('That time does not exist in this timezone. Choose another time.');
      setBusy(false);
      return;
    }
    const body = {
      locationId: location.id,
      userId: data.get('userId') || null,
      startsAt: startsAt.toISO(),
      endsAt: endsAt.toISO(),
      position: data.get('position'),
      notes: data.get('notes'),
      force: data.get('force') === 'on',
    };
    try {
      const result = shift
        ? await api.put('/shifts/' + shift.id, body)
        : await api.post('/shifts', body);
      await onSaved();
      toast.success(
        'Shift saved.' +
          (result.data.warnings.length
            ? ' ' + result.data.warnings.length + ' conflict warnings.'
            : ''),
      );
    } catch (error) {
      toast.error(errorMessage(error));
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setWarnings(error.response.data.error.details?.warnings ?? []);
        setOverlap(true);
      }
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!shift) return;
    if (!window.confirm('Delete this shift?')) return;
    setBusy(true);
    try {
      await api.delete('/shifts/' + shift.id);
      await onSaved();
      toast.success('Shift deleted.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={shift ? 'Edit shift' : 'Make a plan'} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <p className="text-sm text-slate-500">
          {location.name} · {zone}
        </p>
        <label>
          Team member
          <select name="userId" defaultValue={selection.userId ?? ''}>
            <option value="">Open shift · assign later</option>
            {people
              .filter((p) => p.active !== false || p.id === selection.userId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Starts at
            <input
              type="datetime-local"
              name="startsAt"
              required
              defaultValue={shift ? local(shift.startsAt) : selection.date + 'T09:00'}
            />
          </label>
          <label>
            Ends at
            <input
              type="datetime-local"
              name="endsAt"
              required
              defaultValue={shift ? local(shift.endsAt) : selection.date + 'T17:00'}
            />
          </label>
        </div>
        <label>
          Position
          <input
            name="position"
            required
            maxLength={100}
            defaultValue={shift?.position ?? 'Floor team'}
          />
        </label>
        <label>
          Notes <span className="font-normal text-slate-500">(optional)</span>
          <textarea name="notes" rows={2} maxLength={1000} defaultValue={shift?.notes ?? ''} />
        </label>
        {warnings.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900"
          >
            <strong className="flex items-center gap-2">
              <AlertTriangle size={15} />
              Conflicts to review
            </strong>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}
        {overlap && (
          <label className="flex items-start gap-2 text-sm">
            <input name="force" type="checkbox" />
            <span>I’ve reviewed the overlap. Save this shift anyway.</span>
          </label>
        )}
        <div className="flex items-center justify-between gap-2 pt-3">
          {shift ? (
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 text-sm font-semibold text-red-700"
              onClick={() => void remove()}
            >
              <Trash2 size={14} />
              Delete shift
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save shift'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
