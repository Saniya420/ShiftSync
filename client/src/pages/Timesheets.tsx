import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { money, PageHeading, QueryState } from '../components';
import type { Location } from '../types';
interface Row {
  userId: string;
  name: string;
  scheduledHours: number;
  actualHours: number;
  overtimeHours: number;
  lateCount: number;
  estimatedCost: number;
}
export function TimesheetsPage() {
  const { user } = useAuth();
  const week = DateTime.now()
    .setZone(user?.organization?.timezone ?? 'UTC')
    .startOf('week');
  const [from, setFrom] = useState(week.toISODate()!),
    [to, setTo] = useState(week.plus({ days: 6 }).toISODate()!),
    [locationId, setLocation] = useState(''),
    [downloading, setDownloading] = useState(false);
  const params = { from, to, ...(locationId ? { locationId } : {}) };
  const query = useQuery({
    queryKey: ['timesheets', params],
    queryFn: async () =>
      (await api.get<{ rows: Row[]; timezone: string }>('/timesheets', { params })).data,
    enabled: !!from && !!to && to >= from,
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<{ locations: Location[] }>('/locations')).data.locations,
  });
  const download = async () => {
    setDownloading(true);
    try {
      const response = await api.get<Blob>('/timesheets.csv', { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'timesheets-' + from + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Timesheets"
        description="Scheduled and completed hours, weekly overtime, and estimated scheduled labour cost."
        action={
          <button
            className="btn-primary"
            disabled={downloading || !query.data || query.isFetching || query.isError}
            onClick={() => void download()}
          >
            Download CSV
          </button>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Through
          <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Location
          <select value={locationId} onChange={(e) => setLocation(e.target.value)}>
            <option value="">All locations</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState
        loading={query.isLoading || locations.isPending}
        error={query.isError || locations.isError}
      />
      <p className="mb-4 max-w-prose text-sm text-slate-500">
        Dates are inclusive in {query.data?.timezone ?? 'the selected timezone'}. Actual hours use
        completed records. Overtime counts actual hours above the employee’s weekly limit across
        locations. No overtime premium is assumed.
      </p>
      {query.data && (
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
              <tr>
                {['Employee', 'Scheduled', 'Actual', 'Overtime', 'Late', 'Estimated cost'].map(
                  (h, i) => (
                    <th className={'px-4 py-3 font-medium ' + (i ? 'text-right' : '')} key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data.rows.map((r) => (
                <tr key={r.userId}>
                  <th className="px-4 py-3 font-semibold text-ink">{r.name}</th>
                  {[r.scheduledHours, r.actualHours, r.overtimeHours].map((v, i) => (
                    <td
                      className={
                        'num px-4 py-3 text-right ' +
                        (i === 2 && v > 0 ? 'font-semibold text-red-700' : 'text-ink')
                      }
                      key={i}
                    >
                      {v.toFixed(2)}h
                    </td>
                  ))}
                  <td
                    className={
                      'num px-4 py-3 text-right ' +
                      (r.lateCount ? 'font-semibold text-red-700' : 'text-ink')
                    }
                  >
                    {r.lateCount}
                  </td>
                  <td className="num px-4 py-3 text-right text-ink">{money(r.estimatedCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-mono text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <tr className="border-t border-dashed border-slate-300">
                <th className="px-4 pt-3 pb-1 font-sans text-sm font-semibold">
                  {query.data.rows.length} people
                </th>
                {(['scheduledHours', 'actualHours', 'overtimeHours'] as const).map((key) => (
                  <td className="px-4 pt-3 pb-1 text-right" key={key}>
                    {query.data.rows.reduce((sum, r) => sum + r[key], 0).toFixed(2)} h
                  </td>
                ))}
                <td className="px-4 pt-3 pb-1 text-right">
                  {query.data.rows.reduce((sum, r) => sum + r.lateCount, 0)}
                </td>
                <td className="px-4 pt-3 pb-1 text-right">
                  <span className="tally-total inline-block font-semibold">
                    {money(query.data.rows.reduce((sum, r) => sum + r.estimatedCost, 0))}
                  </span>
                </td>
              </tr>
              <tr>
                <td colSpan={6} className="h-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
