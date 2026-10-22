import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { Modal } from '../Modal';
import type { Location, User } from '../types';
export function TeamBatch({ people, locations }: { people: User[]; locations: Location[] }) {
  const [open, setOpen] = useState(false),
    [ids, setIds] = useState<string[]>([]),
    [locationId, setLocationId] = useState(''),
    [hours, setHours] = useState('');
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () =>
      api.post('/users/batch', {
        ids,
        ...(locationId ? { locationId } : {}),
        ...(hours !== '' ? { maxWeeklyHours: Number(hours) } : {}),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['users'] });
      toast.success('Team updated.');
      setOpen(false);
      setIds([]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <button className="btn-secondary" disabled={!people.length} onClick={() => setOpen(true)}>
        Batch edit team
      </button>
      {open && (
        <Modal title="Batch edit team" onClose={() => setOpen(false)}>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <p className="text-sm text-slate-500">Select members from the current filtered view.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIds(people.map((p) => p.id))}
            >
              Select all shown
            </button>
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ids.includes(p.id)}
                    onChange={(e) =>
                      setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
            <label>
              Assign location
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Keep current locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Max weekly hours
              <input
                type="number"
                min={0}
                max={168}
                step="0.5"
                value={hours}
                placeholder="Keep current limits"
                onChange={(e) => setHours(e.target.value)}
              />
            </label>
            <button
              className="btn-primary"
              disabled={!ids.length || (!locationId && hours === '') || mutation.isPending}
            >
              Update selected members
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
