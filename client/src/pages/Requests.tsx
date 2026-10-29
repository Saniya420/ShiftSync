import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Empty, PageHeading, QueryState, Stamp, statusLabel } from '../components';
import { Modal } from '../Modal';
import type { Shift, Warning } from '../types';
export interface TimeOff {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: string;
  user: { name: string };
}
export interface Swap {
  id: string;
  requesterId: string;
  acceptedById: string | null;
  status: string;
  requester: { name: string };
  acceptedBy: { name: string } | null;
  target: { name: string } | null;
  shift: Shift;
}
export const dateLabel = (value: string, zone = 'UTC') =>
  DateTime.fromISO(value).setZone(zone).toFormat('ccc dd LLL yyyy · HH:mm');
const timeOffDates = (request: TimeOff, zone: string) =>
  DateTime.fromISO(request.startsAt).setZone(zone).toFormat('ccc dd LLL yyyy') +
  ' – ' +
  DateTime.fromISO(request.endsAt)
    .setZone(zone)
    .minus({ milliseconds: 1 })
    .toFormat('ccc dd LLL yyyy');
export function useRequestAction() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, body = {} }: { path: string; body?: object }) =>
      api.post(path, body),
    onSuccess: async () => {
      await Promise.all(
        ['time-off', 'swaps', 'shifts', 'notifications', 'attendance', 'timesheets'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success('Saved.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
export function TimeOffPage() {
  const { user } = useAuth();
  const zone = user?.organization?.timezone ?? 'UTC';
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['time-off'],
    queryFn: async () => (await api.get<{ requests: TimeOff[] }>('/time-off')).data.requests,
  });
  const action = useRequestAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    action.mutate(
      {
        path: '/time-off',
        body: {
          startsAt: DateTime.fromISO(from, { zone }).startOf('day').toISO(),
          endsAt: DateTime.fromISO(to, { zone }).plus({ days: 1 }).startOf('day').toISO(),
          reason,
        },
      },
      { onSuccess: () => setReason('') },
    );
  };
  return (
    <>
      <PageHeading
        title="Time off"
        description={'Request whole days away. Dates use ' + zone + '.'}
      />
      <form onSubmit={submit} className="card mb-6 grid gap-4 sm:grid-cols-2">
        <label>
          From
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Through
          <input
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="sm:col-span-2">
          Reason
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="btn-primary justify-center" disabled={action.isPending}>
          Request time off
        </button>
      </form>
      <QueryState loading={query.isPending} error={query.isError} />
      <div className="space-y-3">
        {query.data
          ?.filter((r) => r.userId === user?.id)
          .map((r) => (
            <article className="card flex flex-wrap items-center gap-x-4 gap-y-3" key={r.id}>
              <div className="min-w-0 flex-1">
                <p className="num text-sm font-semibold text-ink">{timeOffDates(r, zone)}</p>
                <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
              </div>
              <Stamp status={r.status} />
              {['PENDING', 'APPROVED'].includes(r.status) && (
                <button
                  className="btn-secondary py-2"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: '/time-off/' + r.id + '/cancel' })}
                >
                  Cancel request
                </button>
              )}
            </article>
          ))}
      </div>
      {query.data && !query.data.some((r) => r.userId === user?.id) && (
        <Empty
          title="No time off requested"
          description="Your requests and their decisions will appear here."
        />
      )}
    </>
  );
}
export function RequestsPage() {
  const { user } = useAuth();
  const zone = user?.organization?.timezone ?? 'UTC';
  const [tab, setTab] = useState<'Time off' | 'Swaps'>('Time off');
  // ACTION is a client-side view: only what still needs a manager's decision.
  const [statusFilter, setStatusFilter] = useState('ACTION'),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState(''),
    [selected, setSelected] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<
    { id: string; ok: boolean; error?: { message: string } }[]
  >([]);
  const params = {
    ...(statusFilter && statusFilter !== 'ACTION' ? { status: statusFilter } : {}),
    ...(dateFrom && dateTo ? { from: dateFrom, to: dateTo } : {}),
  };
  const cache = useQueryClient();
  const batch = useMutation({
    mutationFn: async (status: string) =>
      (
        await api.post<{ results: { id: string; ok: boolean; error?: { message: string } }[] }>(
          '/time-off/batch-decision',
          { ids: selected, status },
        )
      ).data,
    onSuccess: async (data) => {
      setBatchResults(data.results);
      setSelected([]);
      await Promise.all(
        ['time-off', 'notifications', 'shifts'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success(data.results.filter((r) => r.ok).length + ' requests updated.');
      if (data.results.some((r) => !r.ok))
        toast.error('Some requests could not be updated. Review the results.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const timeOff = useQuery({
    queryKey: ['time-off', params],
    queryFn: async () =>
      (await api.get<{ requests: TimeOff[] }>('/time-off', { params })).data.requests,
  });
  const swaps = useQuery({
    queryKey: ['swaps', params],
    queryFn: async () => (await api.get<{ swaps: Swap[] }>('/swaps', { params })).data.swaps,
  });
  const action = useRequestAction();
  const [review, setReview] = useState<{ id: string; warnings: Warning[] } | null>(null);
  const approve = async (id: string, force = false) => {
    try {
      await action.mutateAsync({ path: '/swaps/' + id + '/approve', body: { force } });
      setReview(null);
    } catch (err) {
      if (
        axios.isAxiosError(err) &&
        err.response?.status === 409 &&
        err.response.data.error.details?.warnings
      )
        setReview({ id, warnings: err.response.data.error.details.warnings });
    }
  };
  const timeOffShown =
    statusFilter === 'ACTION' ? timeOff.data?.filter((r) => r.status === 'PENDING') : timeOff.data;
  const swapsShown =
    statusFilter === 'ACTION'
      ? swaps.data?.filter((s) => ['PENDING', 'ACCEPTED'].includes(s.status))
      : swaps.data;
  const loading = tab === 'Time off' ? timeOff.isPending : swaps.isPending;
  const error = tab === 'Time off' ? timeOff.isError : swaps.isError;
  return (
    <>
      <PageHeading
        title="Requests"
        description="Time off and shift swaps from your team. Decide the waiting ones first."
        meta={'Dates use ' + zone}
      />
      <div role="tablist" className="mb-5 flex gap-2">
        {(['Time off', 'Swaps'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            className={(tab === v ? 'btn-primary' : 'btn-secondary') + ' py-2'}
            onClick={() => setTab(v)}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelected([]);
            }}
          >
            <option value="ACTION">Needs a decision</option>
            <option value="">All statuses</option>
            {['PENDING', 'ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setSelected([]);
            }}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            min={dateFrom}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setSelected([]);
            }}
          />
        </label>
        <p className="text-xs text-slate-500 sm:col-span-3">
          Choose both dates to filter requests that overlap the range.
        </p>
      </div>
      {tab === 'Time off' &&
        (selected.length > 0 || timeOffShown?.some((r) => r.status === 'PENDING')) && (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              className="btn-secondary"
              disabled={timeOff.isPending || !timeOffShown?.some((r) => r.status === 'PENDING')}
              onClick={() =>
                setSelected(
                  timeOffShown
                    ?.filter((r) => r.status === 'PENDING')
                    .slice(0, 100)
                    .map((r) => r.id) ?? [],
                )
              }
            >
              Select pending shown
            </button>
            <span className="num text-sm text-slate-600">{selected.length} selected</span>
            <button
              className="btn-primary"
              disabled={!selected.length || batch.isPending}
              onClick={() => batch.mutate('APPROVED')}
            >
              Approve selected
            </button>
            <button
              className="btn-secondary"
              disabled={!selected.length || batch.isPending}
              onClick={() => {
                if (window.confirm('Deny ' + selected.length + ' selected requests?'))
                  batch.mutate('REJECTED');
              }}
            >
              Deny selected
            </button>
          </div>
        )}
      {batchResults.length > 0 && (
        <ul className="card mb-5 text-sm" aria-label="Batch results">
          {batchResults.map((r) => (
            <li key={r.id}>
              {timeOff.data?.find((t) => t.id === r.id)?.user.name ?? r.id}:{' '}
              {r.ok ? 'Updated' : r.error?.message}
            </li>
          ))}
        </ul>
      )}
      <QueryState loading={loading} error={error} />
      <div className="space-y-4">
        {tab === 'Time off'
          ? timeOffShown?.map((r) => (
              <article key={r.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {r.status === 'PENDING' && (
                    <input
                      type="checkbox"
                      aria-label={'Select ' + r.user.name + ' time off'}
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, r.id]
                            : selected.filter((id) => id !== r.id),
                        )
                      }
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base">{r.user.name}</h2>
                    <p className="num mt-0.5 text-sm text-ink">{timeOffDates(r, zone)}</p>
                    <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                  </div>
                </div>
                <Stamp status={r.status} />
                {r.status === 'PENDING' && (
                  <div className="flex gap-2">
                    {(['APPROVED', 'REJECTED'] as const).map((status) => (
                      <button
                        className={
                          (status === 'APPROVED' ? 'btn-primary' : 'btn-secondary') + ' py-2'
                        }
                        key={status}
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({
                            path: '/time-off/' + r.id + '/decision',
                            body: { status },
                          })
                        }
                      >
                        {status === 'APPROVED' ? 'Approve' : 'Deny'}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))
          : swapsShown?.map((s) => (
              <article key={s.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base">
                    {s.requester.name} → {s.acceptedBy?.name ?? s.target?.name ?? 'Anyone'}
                  </h2>
                  <p className="num mt-0.5 text-sm text-ink">
                    {dateLabel(s.shift.startsAt, s.shift.location?.timezone)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {s.shift.position} · {s.shift.location?.name}
                  </p>
                </div>
                <Stamp status={s.status}>
                  {s.status === 'ACCEPTED' ? 'Ready to approve' : statusLabel(s.status)}
                </Stamp>
                <div className="flex gap-2">
                  {s.status === 'ACCEPTED' && (
                    <button
                      disabled={action.isPending}
                      className="btn-primary py-2"
                      onClick={() => void approve(s.id)}
                    >
                      Approve
                    </button>
                  )}
                  {['PENDING', 'ACCEPTED'].includes(s.status) && (
                    <button
                      disabled={action.isPending}
                      className="btn-secondary py-2"
                      onClick={() => action.mutate({ path: '/swaps/' + s.id + '/reject' })}
                    >
                      Reject
                    </button>
                  )}
                </div>
              </article>
            ))}
      </div>
      {!loading &&
        !error &&
        (tab === 'Time off' ? timeOffShown?.length === 0 : swapsShown?.length === 0) && (
          <Empty
            title={statusFilter === 'ACTION' ? 'Nothing waiting on you' : 'No requests match'}
            description={
              statusFilter === 'ACTION'
                ? 'New requests from your team show up here. Switch to All statuses to see past decisions.'
                : 'Try another status or clear the dates.'
            }
          />
        )}
      {review && (
        <Modal title="Review swap conflicts" onClose={() => setReview(null)}>
          <ul className="my-4 space-y-2">
            {review.warnings.map((w, i) => (
              <li key={i}>
                {w.type}: {w.message}
              </li>
            ))}
          </ul>
          <button
            disabled={action.isPending}
            className="btn-primary"
            onClick={() => void approve(review.id, true)}
          >
            Approve with conflicts
          </button>
        </Modal>
      )}
    </>
  );
}
export function SwapOffer({ shift, close }: { shift: Shift; close: () => void }) {
  const [targetUserId, setTarget] = useState('');
  const coworkers = useQuery({
    queryKey: ['coworkers', shift.id],
    queryFn: async () =>
      (
        await api.get<{ users: { id: string; name: string }[] }>('/swaps/coworkers', {
          params: { shiftId: shift.id },
        })
      ).data.users,
  });
  const action = useRequestAction();
  return (
    <Modal title="Offer your shift" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              path: '/swaps',
              body: { shiftId: shift.id, ...(targetUserId ? { targetUserId } : {}) },
            },
            { onSuccess: close },
          );
        }}
      >
        <p className="mb-4">{dateLabel(shift.startsAt, shift.location?.timezone)}</p>
        <QueryState loading={coworkers.isPending} error={coworkers.isError} />
        <label>
          Offer to
          <select value={targetUserId} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Anyone at this location</option>
            {coworkers.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-primary mt-5"
          disabled={action.isPending || coworkers.isPending || coworkers.isError}
        >
          Offer shift
        </button>
      </form>
    </Modal>
  );
}
export function OpenShiftsPage() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['swaps'],
    queryFn: async () => (await api.get<{ swaps: Swap[] }>('/swaps')).data.swaps,
    refetchInterval: 30000,
  });
  const action = useRequestAction();
  // Offers for shifts that already started can no longer be picked up, so they drop out of view.
  const live = (query.data ?? []).filter(
    (s) => Date.parse(s.shift.startsAt) > Date.now() || !['PENDING', 'ACCEPTED'].includes(s.status),
  );
  const available = live.filter((s) => s.requesterId !== user?.id && s.status === 'PENDING');
  const others = live.filter((s) => !available.includes(s));
  const card = (s: Swap) => (
    <article className="card flex flex-wrap items-center gap-x-4 gap-y-3" key={s.id}>
      <div className="min-w-0 flex-1">
        <h3 className="text-base text-ink">
          {s.shift.position} · {s.requester.name}
        </h3>
        <p className="num mt-0.5 text-sm text-ink">
          {dateLabel(s.shift.startsAt, s.shift.location?.timezone)}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {s.shift.location?.name}
          {s.acceptedBy && ' · Accepted by ' + s.acceptedBy.name}
        </p>
      </div>
      <Stamp status={s.status}>
        {s.status === 'ACCEPTED' ? 'Waiting for manager' : statusLabel(s.status)}
      </Stamp>
      {s.status === 'PENDING' && s.requesterId !== user?.id && (
        <button
          disabled={action.isPending}
          className="btn-primary py-2"
          onClick={() => action.mutate({ path: '/swaps/' + s.id + '/accept' })}
        >
          Accept shift
        </button>
      )}
      {s.requesterId === user?.id && ['PENDING', 'ACCEPTED'].includes(s.status) && (
        <button
          disabled={action.isPending}
          className="btn-secondary py-2"
          onClick={() => action.mutate({ path: '/swaps/' + s.id + '/cancel' })}
        >
          Cancel offer
        </button>
      )}
    </article>
  );
  return (
    <>
      <PageHeading
        title="Open shifts"
        description="Pick up a coworker's shift, or follow your own offers. A manager confirms each handover."
      />
      <QueryState loading={query.isPending} error={query.isError} />
      {query.data && (
        <>
          <h2 className="mb-3">Up for grabs</h2>
          <div className="mb-8 space-y-3">
            {available.length ? (
              available.map(card)
            ) : (
              <p className="card text-sm text-slate-600">
                No coworker is offering a shift right now.
              </p>
            )}
          </div>
          {others.length > 0 && (
            <>
              <h2 className="mb-3">Your offers and history</h2>
              <div className="space-y-3">{others.map(card)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}
