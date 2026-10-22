import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { Modal } from '../Modal';
import type { Shift, User, Warning } from '../types';
export function RosterBatch({
  week,
  locationId,
  shifts,
  people,
}: {
  week: string;
  locationId: string;
  shifts: Shift[];
  people: User[];
}) {
  const [open, setOpen] = useState(false),
    [ids, setIds] = useState<string[]>([]),
    [days, setDays] = useState<number[]>([]),
    [confirm, setConfirm] = useState(false),
    [warnings, setWarnings] = useState<Warning[]>([]),
    [overlap, setOverlap] = useState(false);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ kind, force = false }: { kind: 'delete' | 'publish'; force?: boolean }) =>
      api.post(
        kind === 'delete' ? '/shifts/batch-delete' : '/shifts/publish-days',
        kind === 'delete' ? { ids } : { week, locationId, days, force },
      ),
    onSuccess: async (r) => {
      await cache.invalidateQueries({ queryKey: ['shifts'] });
      toast.success((r.data.deleted ?? r.data.published) + ' shifts updated.');
      setIds([]);
      setConfirm(false);
      setOverlap(false);
      setWarnings(r.data.warnings ?? []);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (axios.isAxiosError(e)) {
        setWarnings(e.response?.data?.error?.details?.warnings ?? []);
        setOverlap(e.response?.data?.error?.code === 'SHIFT_OVERLAP');
      }
    },
  });
  return (
    <>
      <button className="btn-secondary" disabled={!locationId} onClick={() => setOpen(true)}>
        Batch operations
      </button>
      {open && (
        <Modal title="Batch roster operations" onClose={() => setOpen(false)}>
          <div className="space-y-5">
            <fieldset>
              <legend className="font-bold">Publish selected days</legend>
              <div className="my-3 flex flex-wrap gap-3">
                {[1, 2, 3, 4, 5, 6, 0].map((d, i) => (
                  <label key={d} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={days.includes(d)}
                      onChange={(e) =>
                        setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))
                      }
                    />
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                  </label>
                ))}
              </div>
              <button
                className="btn-primary"
                disabled={!days.length || mutation.isPending}
                onClick={() => mutation.mutate({ kind: 'publish' })}
              >
                Publish selected days
              </button>
            </fieldset>
            <fieldset>
              <legend className="font-bold">Delete selected drafts</legend>
              <div className="my-3 max-h-64 space-y-3 overflow-y-auto">
                {shifts
                  .filter((s) => s.status === 'DRAFT')
                  .map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={ids.includes(s.id)}
                        onChange={(e) => {
                          setConfirm(false);
                          setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id));
                        }}
                      />
                      {people.find((p) => p.id === s.userId)?.name ?? 'Open'} ? {s.startsAt} ?{' '}
                      {s.position}
                    </label>
                  ))}
                {!shifts.some((s) => s.status === 'DRAFT') && (
                  <p className="text-sm text-slate-500">No draft shifts in the current view.</p>
                )}
              </div>
              {confirm ? (
                <div role="alert">
                  <p className="mb-3 text-sm">Permanently delete {ids.length} selected drafts?</p>
                  <button
                    className="btn-primary"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ kind: 'delete' })}
                  >
                    Confirm deletion
                  </button>
                  <button className="btn-secondary ml-2" onClick={() => setConfirm(false)}>
                    Keep drafts
                  </button>
                </div>
              ) : (
                <button
                  className="btn-secondary"
                  disabled={!ids.length || mutation.isPending}
                  onClick={() => setConfirm(true)}
                >
                  Delete selected drafts
                </button>
              )}
            </fieldset>
            {warnings.length > 0 && (
              <ul className="text-sm text-amber-900">
                {warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            )}
            {overlap && (
              <button
                className="btn-secondary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ kind: 'publish', force: true })}
              >
                Publish selected days with overlap
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
