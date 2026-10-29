import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { Empty, PageHeading, QueryState, Stamp } from '../components';
import { Modal } from '../Modal';
import type { Shift } from '../types';
interface Record {
  id: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  status: string;
  note: string | null;
}
interface BoardShift extends Shift {
  user: { name: string };
  attendance: Record[];
  liveStatus: string;
}
function coordinates(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 8000, maximumAge: 30000 },
    );
  });
}
const clock = (value: string, zone = 'UTC') =>
  DateTime.fromISO(value).setZone(zone).toFormat('HH:mm');
function until(value: string) {
  const diff = DateTime.fromISO(value).diffNow(['days', 'hours', 'minutes']);
  if (diff.as('minutes') <= 0) return 'now';
  if (diff.days >= 1) return 'in ' + Math.round(diff.as('days')) + ' days';
  if (diff.hours >= 1) return 'in ' + diff.hours + ' h ' + Math.floor(diff.minutes) + ' min';
  return 'in ' + Math.ceil(diff.minutes) + ' min';
}
/** The employee's next shift as a slip, with the clock button in thumb reach once it is open. */
export function ClockCard({ next }: { next?: Shift }) {
  const cache = useQueryClient();
  const [pin, setPin] = useState('');
  const query = useQuery({
    queryKey: ['attendance', 'current'],
    queryFn: async () =>
      (await api.get<{ shift: Shift | null; record: Record | null }>('/attendance/current')).data,
    refetchInterval: 30000,
  });
  const action = useMutation({
    mutationFn: async () => {
      const coords = await coordinates();
      return api.post('/attendance/' + (query.data?.record?.clockInAt ? 'clock-out' : 'clock-in'), {
        shiftId: query.data?.shift?.id,
        ...(pin ? { pin } : {}),
        ...coords,
      });
    },
    onSuccess: async () => {
      setPin('');
      await cache.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Attendance saved.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const shift = query.data?.shift ?? next ?? null;
  const zone = shift?.location?.timezone ?? 'UTC';
  const record = query.data?.record;
  const open = Boolean(query.data?.shift);
  return (
    <section
      aria-labelledby="clock-title"
      className="mb-8 overflow-hidden rounded-[10px] border border-slate-300 bg-white"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-300 px-5 py-3">
        <h2 id="clock-title" className="text-base">
          {open ? 'Your shift' : 'Next shift'}
        </h2>
        {shift && (
          <span className="num text-xs text-slate-500">{open ? zone : until(shift.startsAt)}</span>
        )}
      </div>
      <QueryState loading={query.isPending} error={query.isError} />
      {shift ? (
        <div className="px-5 pt-4 pb-5">
          <p className="text-sm text-slate-600">
            {DateTime.fromISO(shift.startsAt).setZone(zone).toFormat('cccc dd LLL')}
          </p>
          <p className="num mt-1 text-[2.5rem] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
            {clock(shift.startsAt, zone)}–{clock(shift.endsAt, zone)}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {shift.position} · {shift.location?.name}
          </p>
          {record?.clockInAt && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <Stamp status={record.clockOutAt ? 'OUT' : 'IN'}>
                {record.clockOutAt ? 'Out' : 'In'}{' '}
                {clock(record.clockOutAt ?? record.clockInAt, zone)}
              </Stamp>
              {record.status && <Stamp status={record.status} />}
            </p>
          )}
          {open && !record?.clockOutAt ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="sm:max-w-44">
                Clock-in PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-describedby="pin-hint"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </label>
              <button
                className="btn-primary w-full py-4 text-lg sm:w-auto sm:px-14"
                disabled={action.isPending}
                onClick={() => action.mutate()}
              >
                {action.isPending
                  ? 'Saving attendance…'
                  : record?.clockInAt
                    ? 'Clock out'
                    : 'Clock in'}
              </button>
            </div>
          ) : (
            !open && (
              <p className="mt-4 text-sm text-slate-500">
                The clock-in button opens 15 minutes before{' '}
                <span className="num">{clock(shift.startsAt, zone)}</span>.
              </p>
            )
          )}
          {open && !record?.clockOutAt && (
            <p id="pin-hint" className="mt-2 text-xs text-slate-500">
              Leave the PIN blank if your manager hasn’t given you one.
            </p>
          )}
        </div>
      ) : (
        query.data && (
          <p className="px-5 py-5 text-sm text-slate-500">
            No published shifts coming up this week.
          </p>
        )
      )}
    </section>
  );
}
const boardOrder: { [status: string]: number } = {
  NO_SHOW: 0,
  LATE: 1,
  NOT_ARRIVED: 2,
  IN: 3,
  OUT: 4,
};
export function AttendancePage() {
  const query = useQuery({
    queryKey: ['attendance', 'board'],
    queryFn: async () =>
      (await api.get<{ shifts: BoardShift[]; timezone: string }>('/attendance')).data,
    refetchInterval: 15000,
  });
  const [edit, setEdit] = useState<BoardShift | null>(null);
  const shifts = [...(query.data?.shifts ?? [])].sort(
    (a, b) => (boardOrder[a.liveStatus] ?? 9) - (boardOrder[b.liveStatus] ?? 9),
  );
  return (
    <>
      <PageHeading
        title="Attendance today"
        description="Late and missing people first. Refreshes every 15 seconds."
        meta={
          query.data &&
          'Updated ' +
            DateTime.fromMillis(query.dataUpdatedAt)
              .setZone(query.data.timezone)
              .toFormat('HH:mm:ss') +
            ' · ' +
            query.data.timezone
        }
      />
      <QueryState loading={query.isPending} error={query.isError} />
      {shifts.length > 0 && (
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-3 py-3 font-medium">Shift</th>
                <th className="px-3 py-3 font-medium">Now</th>
                <th className="px-3 py-3 font-medium">In</th>
                <th className="px-3 py-3 font-medium">Out</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shifts.map((s) => {
                const zone = s.location?.timezone ?? query.data?.timezone ?? 'UTC';
                const record = s.attendance[0];
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-3">
                      <span className="block font-semibold text-ink">{s.user.name}</span>
                      <span className="block text-xs text-slate-500">
                        {s.position} · {s.location?.name}
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-ink">
                      {clock(s.startsAt, zone)}–{clock(s.endsAt, zone)}
                    </td>
                    <td className="px-3 py-3">
                      <Stamp status={s.liveStatus} />
                    </td>
                    <td className="num px-3 py-3">
                      {record?.clockInAt ? clock(record.clockInAt, zone) : '—'}
                    </td>
                    <td className="num px-3 py-3">
                      {record?.clockOutAt ? clock(record.clockOutAt, zone) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {record && (
                        <button className="btn-secondary px-3 py-1.5" onClick={() => setEdit(s)}>
                          Correct record
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {query.data?.shifts.length === 0 && (
        <Empty
          title="No shifts today"
          description="Nobody is rostered today, or today’s shifts aren’t published yet."
        />
      )}
      {edit && <Correction shift={edit} close={() => setEdit(null)} />}
    </>
  );
}
function Correction({ shift, close }: { shift: BoardShift; close: () => void }) {
  const record = shift.attendance[0];
  const zone = shift.location?.timezone ?? 'UTC';
  const local = (v: string | null) =>
    v ? DateTime.fromISO(v).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm") : '';
  const [clockIn, setIn] = useState(local(record.clockInAt)),
    [clockOut, setOut] = useState(local(record.clockOutAt)),
    [note, setNote] = useState('');
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: async () =>
      api.put('/attendance/' + record.id, {
        clockInAt: clockIn ? DateTime.fromISO(clockIn, { zone }).toISO() : null,
        clockOutAt: clockOut ? DateTime.fromISO(clockOut, { zone }).toISO() : null,
        note,
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['attendance'] });
      await cache.invalidateQueries({ queryKey: ['timesheets'] });
      close();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal title={'Correct ' + shift.user.name} onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          action.mutate();
        }}
      >
        <p className="text-sm">Times use {zone}. Leave both times blank for no-show.</p>
        <label>
          Clock in
          <input type="datetime-local" value={clockIn} onChange={(e) => setIn(e.target.value)} />
        </label>
        <label>
          Clock out
          <input type="datetime-local" value={clockOut} onChange={(e) => setOut(e.target.value)} />
        </label>
        <label>
          Correction note
          <textarea
            required
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn-primary" disabled={action.isPending}>
          Save correction
        </button>
      </form>
    </Modal>
  );
}
