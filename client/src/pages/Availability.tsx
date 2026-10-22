import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { PageHeading, QueryState } from '../components';
import type { Availability } from '../types';
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const minuteLabel = (minute: number) =>
  String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
const options = Array.from({ length: 49 }, (_, i) => i * 30);
export function AvailabilityPage() {
  const query = useQuery({
    queryKey: ['availability'],
    queryFn: async () =>
      (await api.get<{ availability: Availability[] }>('/availability')).data.availability,
  });
  return (
    <>
      <PageHeading
        title="When works for you?"
        description="Set your recurring hours. Times use the local timezone of the location where you work."
      />
      <QueryState loading={query.isPending} error={query.isError} />
      {query.data && <AvailabilityForm initial={query.data} />}
    </>
  );
}
function AvailabilityForm({ initial }: { initial: Availability[] }) {
  const [windows, setWindows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/availability', { availability: windows });
      await cache.invalidateQueries({ queryKey: ['availability'] });
      await cache.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Your availability is up to date.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const change = (index: number, field: 'startMinute' | 'endMinute', value: number) =>
    setWindows((w) => w.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  return (
    <form onSubmit={save} className="max-w-4xl">
      <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
        Choose the hours you can work each day. Add multiple windows for split availability. Leave a
        day empty when you’re unavailable.
      </div>
      <div className="card divide-y divide-slate-100 px-5 py-1">
        {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
          <section key={weekday} className="flex flex-wrap items-start gap-4 py-5 sm:flex-nowrap">
            <div className="w-32 shrink-0 pt-2">
              <h3 className="text-sm">{days[weekday]}</h3>
              <p className="mt-1 text-xs text-slate-400">
                {windows.some((w) => w.weekday === weekday) ? 'Available' : 'Unavailable'}
              </p>
            </div>
            <div className="min-w-0 basis-full flex-1 space-y-3 sm:basis-auto">
              {windows.map(
                (window, i) =>
                  window.weekday === weekday && (
                    <div className="flex items-center gap-2" key={i}>
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">
                          {days[weekday]} start {i + 1}
                        </span>
                        <select
                          aria-label={days[weekday] + ' start ' + (i + 1)}
                          value={window.startMinute}
                          onChange={(e) => change(i, 'startMinute', Number(e.target.value))}
                        >
                          {[...new Set([...options.filter((m) => m < 1440), window.startMinute])]
                            .sort((a, b) => a - b)
                            .map((m) => (
                              <option key={m} value={m}>
                                {minuteLabel(m)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <span className="pt-1 text-slate-400">to</span>
                      <label className="flex-1">
                        <span className="sr-only">
                          {days[weekday]} end {i + 1}
                        </span>
                        <select
                          aria-label={days[weekday] + ' end ' + (i + 1)}
                          value={window.endMinute}
                          onChange={(e) => change(i, 'endMinute', Number(e.target.value))}
                        >
                          {[...new Set([...options.filter((m) => m > 0), window.endMinute])]
                            .sort((a, b) => a - b)
                            .map((m) => (
                              <option key={m} value={m}>
                                {minuteLabel(m)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        aria-label={'Remove ' + days[weekday] + ' window ' + (i + 1)}
                        className="icon-btn mt-1 text-red-400"
                        onClick={() => setWindows((w) => w.filter((_, index) => index !== i))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ),
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 py-2 text-xs font-semibold text-emerald-700"
                onClick={() =>
                  setWindows((w) => [...w, { weekday, startMinute: 540, endMinute: 1020 }])
                }
              >
                <Plus size={14} />
                Add hours
              </button>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <button disabled={busy} className="btn-primary">
          <Check size={16} />
          {busy ? 'Saving…' : 'Save availability'}
        </button>
      </div>
    </form>
  );
}
