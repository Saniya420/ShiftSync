import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { Empty, PageHeading, QueryState } from '../components';
import { Modal } from '../Modal';
import { dateLabel } from './Requests';
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
export function ClockCard() {
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
  return (
    <section className="card mb-7">
      <h2>Your clock</h2>
      <QueryState loading={query.isPending} error={query.isError} />
      {query.data?.shift ? (
        <>
          <p className="my-3 text-sm">
            {query.data.shift.position} · {query.data.shift.location?.name} ·{' '}
            {dateLabel(query.data.shift.startsAt, query.data.shift.location?.timezone)}
          </p>
          <label className="mb-4 max-w-xs">
            PIN (if set)
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <button
            className="btn-primary w-full py-5 text-xl sm:w-auto sm:px-16"
            disabled={action.isPending}
            onClick={() => action.mutate()}
          >
            {action.isPending
              ? 'Saving attendance…'
              : query.data.record?.clockInAt
                ? 'Clock out'
                : 'Clock in'}
          </button>
        </>
      ) : (
        query.data && (
          <p className="mt-3 text-sm text-slate-500">
            No shift ready to clock in. Your button appears 15 minutes before start.
          </p>
        )
      )}
    </section>
  );
}
export function AttendancePage() {
  const query = useQuery({
    queryKey: ['attendance', 'board'],
    queryFn: async () =>
      (await api.get<{ shifts: BoardShift[]; timezone: string }>('/attendance')).data,
    refetchInterval: 15000,
  });
  const [edit, setEdit] = useState<BoardShift | null>(null);
  return (
    <>
      <PageHeading
        title="Attendance today"
        description={
          'Live arrivals, clock-outs, and missed shifts. Refreshes every 15 seconds. ' +
          (query.data?.timezone ?? '')
        }
      />
      <QueryState loading={query.isPending} error={query.isError} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {query.data?.shifts.map((s) => (
          <article className="card" key={s.id}>
            <h2>{s.user.name}</h2>
            <p className="my-3 text-sm">
              {s.location?.name} · {dateLabel(s.startsAt, s.location?.timezone)}
            </p>
            <span
              className={
                'badge ' +
                (s.liveStatus === 'IN'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800')
              }
            >
              {s.liveStatus.replaceAll('_', ' ')}
            </span>
            <p className="my-3 text-sm">{s.attendance[0]?.status.replaceAll('_', ' ')}</p>
            {s.attendance[0]?.clockInAt && (
              <p className="text-xs">
                In: {dateLabel(s.attendance[0].clockInAt, s.location?.timezone)}
              </p>
            )}
            {s.attendance[0]?.clockOutAt && (
              <p className="text-xs">
                Out: {dateLabel(s.attendance[0].clockOutAt, s.location?.timezone)}
              </p>
            )}
            {s.attendance[0] && (
              <button className="btn-secondary mt-4" onClick={() => setEdit(s)}>
                Correct record
              </button>
            )}
          </article>
        ))}
      </div>
      {query.data?.shifts.length === 0 && (
        <Empty
          title="No shifts today"
          description="Published shifts and attendance will appear here."
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
