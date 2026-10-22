import { AiRoster } from './AiRoster';
import { RosterBatch } from './RosterBatch';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, Copy, Plus, Send, Trash2, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import {
  currentWeek,
  Empty,
  initials,
  PageHeading,
  QueryState,
  scheduledHours,
  WeekPicker,
} from '../components';
import { Modal } from '../Modal';
import type { Location, Shift, User, Warning } from '../types';
type Selection = { shift?: Shift; userId: string | null; date: string };
const colors = [
  'bg-[#e6f1e8] border-[#cde3d1] text-[#346246]',
  'bg-[#efedf8] border-[#dfdaf0] text-[#665490]',
  'bg-[#f8eedf] border-[#eddfc8] text-[#8a6b38]',
  'bg-[#e5eff6] border-[#cee1ef] text-[#4b728e]',
];
export function Roster() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);
  const [positionFilter, setPositionFilter] = useState('');
  const [week, setWeek] = useState(currentWeek(user?.organization?.timezone));
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pendingAction, setPendingAction] = useState<'copy-previous-week' | 'publish' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionWarnings, setActionWarnings] = useState<Warning[]>([]);
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
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['shifts'] });
  };
  const action = async (kind: 'copy-previous-week' | 'publish', force = false) => {
    setActionBusy(true);
    setActionWarnings([]);
    setPendingAction(null);
    try {
      const result = await api.post('/shifts/' + kind, { week, locationId, force });
      await refresh();
      setActionWarnings(result.data.warnings ?? []);
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
  const hasDraft = shifts.some((s) => s.status === 'DRAFT');
  const warningCount = shifts.filter((s) => s.warnings.length).length;
  return (
    <>
      <PageHeading
        eyebrow="A GOOD WEEK, BY DESIGN"
        title="Your weekly roster"
        description="The right people, in the right place. Let’s get your week in sync."
        action={
          <button
            className="btn-primary"
            disabled={!locationId}
            onClick={() => setSelection({ userId: rows[0]?.id ?? null, date: week })}
          >
            <Plus size={16} />
            Add shift
          </button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <WeekPicker
            week={week}
            onChange={(v) => {
              setWeek(v);
              setActionWarnings([]);
              setPendingAction(null);
            }}
          />
          <label className="min-w-40">
            <span className="sr-only">Location</span>
            <select
              aria-label="Location"
              className="m-0 py-3"
              value={locationId}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setActionWarnings([]);
                setPendingAction(null);
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
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={!locationId || actionBusy}
            onClick={() => void action('copy-previous-week')}
          >
            <Copy size={15} />
            Copy last week
          </button>
          <button
            className="btn-primary"
            disabled={!locationId || actionBusy || !hasDraft}
            onClick={() => void action('publish')}
          >
            <Send size={15} />
            {actionBusy ? 'Working…' : 'Publish week'}
          </button>
        </div>
      </div>
      {location && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <CalendarDays size={14} />
            {zone}
          </span>
          <span>{shifts.length} shifts</span>
          <span>{scheduledHours(shifts, week, zone).toFixed(1)} scheduled hours</span>
          <span className={hasDraft ? 'text-amber-700' : 'text-emerald-700'}>
            {hasDraft ? 'Draft changes to publish' : 'All shifts published'}
          </span>
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle size={13} />
              {warningCount} shifts need attention
            </span>
          )}
        </div>
      )}
      {actionWarnings.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
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
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label>
          Position
          <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
            <option value="">All positions</option>
            {[...new Set(allShifts.map((s) => s.position))].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button className="btn-secondary" disabled={!locationId} onClick={() => setAiOpen(true)}>
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
        <>
          <Empty
            title="Let’s set the scene"
            description="Add your first location and invite your team to start building a roster."
          />
          <Link to="/app/team" className="btn-primary mt-4">
            Set up your team
          </Link>
        </>
      )}
      {location && team.data && !roster.isPending && !roster.isError && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full roster-grid min-w-[1120px] table-fixed border-collapse text-left">
            <thead>
              <tr className="bg-[#f9faf8]">
                <th className="w-52 border-b border-r border-slate-200 p-5 text-xs font-semibold text-slate-400">
                  TEAM MEMBER{' '}
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5">{rows.length}</span>
                </th>
                {days.map((day) => (
                  <th
                    key={day.toISODate()}
                    className={
                      'border-b border-r border-slate-200 p-4 text-center ' +
                      (day.hasSame(DateTime.now().setZone(zone), 'day') ? 'bg-emerald-50' : '')
                    }
                  >
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      {day.toFormat('ccc')}
                    </p>
                    <p className="mt-1 text-lg font-bold text-ink">{day.toFormat('dd')}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows, null].map((person, rowIndex) => {
                const own = shifts.filter((s) => s.userId === (person?.id ?? null));
                const hours = scheduledHours(own, week, zone);
                return (
                  <tr key={person?.id ?? 'open'} className="group">
                    <th className="border-b border-r border-slate-100 p-4 align-top font-normal">
                      <div className="flex items-center gap-2.5">
                        <span className="avatar h-9 w-9">
                          {person ? initials(person.name) : '+'}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink">
                            {person?.name ?? 'Open shifts'}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {person ? person.role.toLowerCase() : 'Ready to assign'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-between text-[10px]">
                        <span
                          className={
                            person && hours > person.maxWeeklyHours
                              ? 'font-bold text-amber-700'
                              : 'text-slate-400'
                          }
                        >
                          {hours.toFixed(1)}h{person ? ' / ' + person.maxWeeklyHours + 'h' : ''}
                        </span>
                        {person && (
                          <span className="text-slate-400">
                            {(hours * Number(person.hourlyRate)).toFixed(2)}
                          </span>
                        )}
                      </div>
                      {person && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={
                              'h-full rounded-full ' +
                              (hours > person.maxWeeklyHours ? 'bg-amber-400' : 'bg-emerald-300')
                            }
                            style={{
                              width:
                                Math.min(100, (hours / Math.max(1, person.maxWeeklyHours)) * 100) +
                                '%',
                            }}
                          />
                        </div>
                      )}
                    </th>
                    {days.map((day) => {
                      const inDay = own.filter(
                        (s) =>
                          DateTime.fromISO(s.startsAt) < day.plus({ days: 1 }) &&
                          DateTime.fromISO(s.endsAt) > day,
                      );
                      return (
                        <td
                          key={day.toISODate()}
                          className="border-b border-r border-slate-100 p-2 align-top"
                        >
                          <div className="min-h-28 space-y-2">
                            {inDay.map((s) => (
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
                                  day.toISODate()
                                }
                                className={
                                  'w-full rounded-lg border p-2.5 text-left transition hover:brightness-95 ' +
                                  (s.warnings.length
                                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                                    : colors[rowIndex % colors.length])
                                }
                              >
                                <p className="text-[11px] font-bold">
                                  {DateTime.fromISO(s.startsAt).setZone(zone).toFormat('HH:mm')} –{' '}
                                  {DateTime.fromISO(s.endsAt).setZone(zone).toFormat('HH:mm')}
                                </p>
                                <p className="mt-1 truncate text-[10px] opacity-70">{s.position}</p>
                                <div className="mt-2 flex items-center justify-between">
                                  <span className="text-[9px] opacity-60">
                                    {s.status === 'DRAFT' ? 'Draft' : 'Published'}
                                  </span>
                                  {s.warnings.length > 0 && (
                                    <span
                                      title={s.warnings.map((w) => w.message).join(' ')}
                                      className="flex items-center gap-1 text-[9px]"
                                    >
                                      <AlertTriangle size={12} />
                                      {s.warnings.length}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                            <button
                              aria-label={
                                'Add ' + (person?.name ?? 'open') + ' shift on ' + day.toISODate()
                              }
                              className="flex w-full items-center justify-center rounded-lg border border-dashed border-transparent py-2 text-slate-300 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                              onClick={() =>
                                setSelection({ userId: person?.id ?? null, date: day.toISODate()! })
                              }
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-5 text-[11px] text-slate-400">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Scheduled shift
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          Conflict to review
        </span>
        <span>Labor estimates use hourly rates; taxes and overtime premiums are excluded.</span>
      </div>
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
        <p className="text-xs text-slate-400">
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
          Notes <span className="font-normal text-slate-400">(optional)</span>
          <textarea name="notes" rows={2} maxLength={1000} defaultValue={shift?.notes ?? ''} />
        </label>
        {warnings.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
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
          <label className="flex items-start gap-2 text-xs">
            <input name="force" type="checkbox" />
            <span>I’ve reviewed the overlap. Save this shift anyway.</span>
          </label>
        )}
        <div className="flex items-center justify-between gap-2 pt-3">
          {shift ? (
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"
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
