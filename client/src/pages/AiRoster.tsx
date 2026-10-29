import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { Modal } from '../Modal';
import type { User, Warning } from '../types';
interface Need {
  weekday: number;
  start: string;
  end: string;
  headcount: number;
  position: string;
}
interface Suggestion {
  source: 'gemini' | 'heuristic';
  shifts: { userId: string; startsAt: string; endsAt: string; position: string }[];
  warnings: Warning[];
  explanation: string;
}
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function AiRoster({
  week,
  locationId,
  zone,
  people,
  onClose,
}: {
  week: string;
  locationId: string;
  zone: string;
  people: User[];
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [needs, setNeeds] = useState<Need[]>([
    { weekday: 1, start: '09:00', end: '17:00', headcount: 1, position: 'Floor team' },
  ]);
  const [notes, setNotes] = useState(''),
    [preview, setPreview] = useState<Suggestion | null>(null),
    [overlap, setOverlap] = useState<Warning[] | null>(null);
  const suggest = useMutation({
    mutationFn: async () =>
      (await api.post<Suggestion>('/ai/suggest-roster', { week, locationId, needs, notes })).data,
    onSuccess: (data) => {
      setPreview(data);
      toast.success('Suggestion ready to review.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const apply = useMutation({
    mutationFn: async (force: boolean) =>
      api.post('/ai/apply-suggestion', { week, locationId, shifts: preview!.shifts, force }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Suggestion applied as drafts.');
      onClose();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (axios.isAxiosError(e) && e.response?.data?.error?.code === 'SHIFT_OVERLAP')
        setOverlap(e.response.data.error.details.warnings);
    },
  });
  const update = (index: number, patch: Partial<Need>) =>
    setNeeds((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <Modal title="Suggest with AI" onClose={onClose}>
      {!preview ? (
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            suggest.mutate();
          }}
        >
          <p className="text-sm text-slate-500">
            Describe staffing needs for {week}. Times use {zone}. Overnight windows end the
            following day.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setNeeds([1, 2, 3, 4, 5].map((weekday) => ({ ...needs[0], weekday })))}
          >
            Same every weekday
          </button>
          {needs.map((n, i) => (
            <fieldset key={i} className="rounded-xl border p-3">
              <legend className="text-sm">Staffing need {i + 1}</legend>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  Day
                  <select
                    value={n.weekday}
                    onChange={(e) => update(i, { weekday: Number(e.target.value) })}
                  >
                    {weekdays.map((d, index) => (
                      <option key={d} value={index}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  People
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={n.headcount}
                    onChange={(e) => update(i, { headcount: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Start
                  <input
                    type="time"
                    required
                    value={n.start}
                    onChange={(e) => update(i, { start: e.target.value })}
                  />
                </label>
                <label>
                  End
                  <input
                    type="time"
                    required
                    value={n.end}
                    onChange={(e) => update(i, { end: e.target.value })}
                  />
                </label>
                <label className="col-span-2">
                  Position
                  <input
                    required
                    maxLength={100}
                    value={n.position}
                    onChange={(e) => update(i, { position: e.target.value })}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={needs.length === 1}
                className="mt-2 text-sm text-red-700"
                onClick={() => setNeeds((rows) => rows.filter((_, j) => j !== i))}
              >
                Remove row
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn-secondary"
            disabled={needs.length >= 70}
            onClick={() => setNeeds([...needs, { ...needs[0] }])}
          >
            Add staffing row
          </button>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </label>
          <button className="btn-primary" disabled={suggest.isPending}>
            {suggest.isPending ? 'Building suggestion...' : 'Generate suggestion'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <span className="badge bg-stamp-100 text-stamp-900">
            {preview.source === 'gemini' ? 'Gemini' : 'Smart fallback'}
          </span>
          <p className="text-sm">{preview.explanation}</p>
          <p className="text-xs text-slate-500">
            Review before applying. Suggestions are saved only when you apply them.
          </p>
          <ul className="space-y-2 text-sm text-amber-900">
            {[...preview.warnings, ...(overlap ?? [])].map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Day / time</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {preview.shifts.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-3">
                      {people.find((p) => p.id === s.userId)?.name ?? s.userId}
                    </td>
                    <td>
                      {DateTime.fromISO(s.startsAt).setZone(zone).toFormat('ccc HH:mm')} -{' '}
                      {DateTime.fromISO(s.endsAt).setZone(zone).toFormat('ccc HH:mm')}
                    </td>
                    <td>{s.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!preview.shifts.length && (
            <p>No eligible assignments. Adjust your needs or employee availability.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                setPreview(null);
                setOverlap(null);
              }}
            >
              Edit needs
            </button>
            <button
              className="btn-primary"
              disabled={!preview.shifts.length || apply.isPending}
              onClick={() => apply.mutate(false)}
            >
              Apply as drafts
            </button>
            {overlap && (
              <button
                className="btn-secondary"
                disabled={apply.isPending}
                onClick={() => apply.mutate(true)}
              >
                Apply with overlap
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
