import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { PageHeading, QueryState, Empty } from '../components';
import { Modal } from '../Modal';
import type { Location, User } from '../types';
interface Analytics {
  timezone: string;
  kpis: Record<string, number>;
  daily: { date: string; scheduledHours: number; actualHours: number; labourCost: number }[];
  attendance: { name: string; value: number }[];
  hoursPerEmployee: { userId: string; name: string; scheduledHours: number; actualHours: number }[];
}
const labels: Record<string, string> = {
  scheduledHours: 'Scheduled hours',
  actualHours: 'Actual hours',
  labourCost: 'Estimated labour cost',
  attendanceRate: 'Attendance rate',
  lateRate: 'Late rate',
  noShowRate: 'No-show rate',
  swapVolume: 'Swap requests',
  swapApprovalRate: 'Swap approval rate',
  timeOffVolume: 'Time-off requests',
  coverage: 'Assigned coverage',
};
export function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('Analytics');
  const zone = user?.organization?.timezone ?? 'UTC';
  const [from, setFrom] = useState(
      DateTime.now().setZone(zone).minus({ weeks: 3 }).startOf('week').toISODate()!,
    ),
    [to, setTo] = useState(DateTime.now().setZone(zone).toISODate()!),
    [locationId, setLocationId] = useState('');
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<{ locations: Location[] }>('/locations')).data.locations,
  });
  const query = useQuery({
    queryKey: ['analytics', from, to, locationId],
    enabled: tab === 'Analytics' && !!from && !!to && to >= from,
    queryFn: async () =>
      (
        await api.get<Analytics>('/admin/analytics', {
          params: { from, to, ...(locationId ? { locationId } : {}) },
        })
      ).data,
  });
  return (
    <>
      <PageHeading
        title="Admin workspace"
        description={
          user?.role === 'OWNER'
            ? 'Understand your business and manage access.'
            : 'Organization analytics. User management is available to the owner.'
        }
      />
      <div role="tablist" className="mb-6 flex flex-wrap gap-2">
        {(user?.role === 'OWNER' ? ['Analytics', 'Audit log', 'Users'] : ['Analytics']).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Analytics' ? (
        <>
          <div className="card mb-6 grid gap-4 sm:grid-cols-3">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Through
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label>
              Location
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">All locations</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <QueryState loading={query.isFetching} error={query.isError} />
          {query.data && (
            <>
              <p className="mb-4 text-xs text-slate-500">
                Dates use {query.data.timezone}. Rates use completed assigned shifts. Labour cost
                uses scheduled hours times current hourly rates.
              </p>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
                {Object.entries(query.data.kpis).map(([key, value]) => (
                  <article className="card p-4" key={key}>
                    <p className="text-xs text-slate-500">{labels[key] ?? key}</p>
                    <p className="mt-2 text-2xl font-bold text-ink">
                      {value.toFixed(key.endsWith('Volume') ? 0 : 1)}
                      {key.endsWith('Rate') || key === 'coverage' ? '%' : ''}
                    </p>
                  </article>
                ))}
              </div>
              {!query.data.kpis.scheduledHours && (
                <Empty
                  title="No published shifts in this range"
                  description="Publish a roster or choose an earlier date range to see activity."
                />
              )}
              <div className="grid gap-5 xl:grid-cols-2">
                <section className="card min-w-0">
                  <h2 className="mb-5">Scheduled vs actual hours</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={query.data.daily}>
                        <CartesianGrid stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis width={35} />
                        <Tooltip />
                        <Legend />
                        <Line
                          dataKey="scheduledHours"
                          name="Scheduled"
                          stroke="#047857"
                          strokeWidth={2}
                        />
                        <Line
                          dataKey="actualHours"
                          name="Actual"
                          stroke="#7c3aed"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card min-w-0">
                  <h2>Attendance status</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={query.data.attendance}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="45%"
                          outerRadius="70%"
                        >
                          {query.data.attendance.map((d, i) => (
                            <Cell key={d.name} fill={['#047857', '#d97706', '#dc2626'][i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card min-w-0">
                  <h2 className="mb-5">Daily labour estimate</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={query.data.daily}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis width={45} />
                        <Tooltip />
                        <Bar
                          dataKey="labourCost"
                          name="Labour cost"
                          fill="#047857"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card min-w-0">
                  <h2 className="mb-5">Hours per employee</h2>
                  <div className="max-h-[600px] overflow-y-auto">
                    <div style={{ height: Math.max(280, query.data.hoursPerEmployee.length * 45) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={query.data.hoursPerEmployee} layout="vertical">
                          <XAxis type="number" />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={85}
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="scheduledHours" name="Scheduled" fill="#047857" />
                          <Bar dataKey="actualHours" name="Actual" fill="#7c3aed" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      ) : tab === 'Audit log' ? (
        <AuditLog />
      ) : (
        <AdminUsers />
      )}
    </>
  );
}
interface Audit {
  entries: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    actor: { name: string } | null;
    details: unknown;
  }[];
  total: number;
  page: number;
  pageSize: number;
}
function AuditLog() {
  const [page, setPage] = useState(1),
    [action, setAction] = useState(''),
    [entity, setEntity] = useState('');
  const query = useQuery({
    queryKey: ['audit', page, action, entity],
    queryFn: async () =>
      (
        await api.get<Audit>('/admin/audit-log', {
          params: { page, ...(action ? { action } : {}), ...(entity ? { entity } : {}) },
        })
      ).data,
  });
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label>
          Action
          <input
            placeholder="SHIFT_CREATED"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Entity
          <input
            placeholder="Shift"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <QueryState loading={query.isPending} error={query.isError} />
      <div className="space-y-3">
        {query.data?.entries.map((e) => (
          <article className="card break-words" key={e.id}>
            <p className="text-sm font-bold">{e.action}</p>
            <p className="text-xs text-slate-500">
              {e.actor?.name ?? 'System'} |{' '}
              {DateTime.fromISO(e.createdAt).toLocaleString(DateTime.DATETIME_SHORT)}
            </p>
            <p className="mt-2 text-sm">
              {e.entityType} | {e.entityId}
            </p>
            <details className="mt-2 text-xs">
              <summary>Details</summary>
              <pre className="overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(e.details, null, 2)}
              </pre>
            </details>
          </article>
        ))}
      </div>
      {query.data?.total === 0 && (
        <Empty title="No audit entries" description="Try another action or entity filter." />
      )}
      <div className="mt-4 flex items-center gap-4">
        <button
          className="btn-secondary"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span className="text-sm">Page {page}</span>
        <button
          className="btn-secondary"
          disabled={!query.data || page * query.data.pageSize >= query.data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
function AdminUsers() {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<{ users: User[] }>('/users')).data.users,
  });
  const [confirm, setConfirm] = useState<{
      id: string;
      name: string;
      kind: 'reset' | 'active';
      active?: boolean;
    } | null>(null),
    [temp, setTemp] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object | 'reset' }) =>
      body === 'reset'
        ? api.post('/admin/users/' + id + '/reset-password', {})
        : api.put('/admin/users/' + id, body),
    onSuccess: async (result) => {
      setConfirm(null);
      if (result.data.tempPassword) setTemp(result.data.tempPassword);
      await Promise.all(
        ['users', 'audit', 'shifts'].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      toast.success('User updated.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <QueryState loading={query.isPending} error={query.isError} />
      <div className="space-y-3">
        {query.data?.map((u) => (
          <article className="card flex flex-wrap items-center justify-between gap-4" key={u.id}>
            <div className="min-w-0">
              <h2>{u.name}</h2>
              <p className="break-all text-sm text-slate-500">{u.email}</p>
              <span className="badge bg-slate-100">
                {u.active === false ? 'Inactive' : 'Active'}
              </span>
            </div>
            {u.role === 'OWNER' ? (
              <span className="badge bg-emerald-50">Owner</span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={'Role for ' + u.name}
                  value={u.role}
                  disabled={mutation.isPending}
                  onChange={(e) => mutation.mutate({ id: u.id, body: { role: e.target.value } })}
                >
                  <option>EMPLOYEE</option>
                  <option>MANAGER</option>
                </select>
                <button
                  className="btn-secondary"
                  disabled={mutation.isPending}
                  onClick={() =>
                    setConfirm({
                      id: u.id,
                      name: u.name,
                      kind: 'active',
                      active: u.active === false,
                    })
                  }
                >
                  {u.active === false ? 'Reactivate' : 'Deactivate'}
                </button>
                <button
                  className="btn-secondary"
                  disabled={mutation.isPending}
                  onClick={() => setConfirm({ id: u.id, name: u.name, kind: 'reset' })}
                >
                  Reset password
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {confirm && (
        <Modal
          title={confirm.kind === 'reset' ? 'Reset password' : 'Change account access'}
          onClose={() => setConfirm(null)}
        >
          <p className="mb-5">
            {confirm.kind === 'reset'
              ? 'Generate a temporary password for '
              : confirm.active
                ? 'Reactivate '
                : 'Deactivate '}
            {confirm.name}?
          </p>
          <button
            className="btn-primary"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                id: confirm.id,
                body: confirm.kind === 'reset' ? 'reset' : { active: confirm.active },
              })
            }
          >
            Confirm
          </button>
        </Modal>
      )}
      {temp && (
        <Modal title="Temporary password" onClose={() => setTemp(null)}>
          <p className="mb-4 text-sm">
            Share this password directly. It is shown once and must be changed after sign-in.
          </p>
          <code className="break-all">{temp}</code>
          <button className="btn-primary mt-5" onClick={() => setTemp(null)}>
            Done
          </button>
        </Modal>
      )}
    </>
  );
}
