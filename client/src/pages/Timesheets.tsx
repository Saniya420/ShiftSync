import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { PageHeading, QueryState } from '../components';
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
        description="Scheduled and completed hours, weekly overtime, and estimated scheduled labor cost."
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
      <div className="card mb-6 grid gap-4 sm:grid-cols-3">
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
      <p className="mb-4 text-xs text-slate-500">
        Dates are inclusive in {query.data?.timezone ?? 'the selected timezone'}. Actual hours use
        completed records. Overtime counts actual hours above the employee’s weekly limit across
        locations. No overtime premium is assumed.
      </p>
      {query.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['Employee', 'Scheduled', 'Actual', 'Overtime', 'Late', 'Estimated cost'].map(
                  (h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r) => (
                <tr className="border-t border-slate-100" key={r.userId}>
                  <th className="p-3">{r.name}</th>
                  {[r.scheduledHours, r.actualHours, r.overtimeHours].map((v, i) => (
                    <td className="p-3" key={i}>
                      {v.toFixed(2)}h
                    </td>
                  ))}
                  <td className="p-3">{r.lateCount}</td>
                  <td className="p-3">{r.estimatedCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
