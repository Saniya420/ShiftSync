import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Swap, TimeOff } from './pages/Requests';

/** Counts of work waiting on the signed-in user, shared by the nav badges and the Overview queue. */
export function usePendingWork(manager: boolean) {
  const timeOff = useQuery({
    queryKey: ['time-off', { status: 'PENDING' }],
    queryFn: async () =>
      (await api.get<{ requests?: TimeOff[] }>('/time-off', { params: { status: 'PENDING' } })).data
        .requests ?? [],
    enabled: manager,
    refetchInterval: 60000,
  });
  const swaps = useQuery({
    queryKey: ['swaps'],
    queryFn: async () => (await api.get<{ swaps?: Swap[] }>('/swaps')).data.swaps ?? [],
    refetchInterval: 60000,
  });
  const swapList = swaps.data ?? [];
  return {
    timeOff: manager ? (timeOff.data ?? []) : [],
    // Managers act on swaps a coworker has accepted; employees act on offers they could pick up.
    swaps: manager
      ? swapList.filter((s) => s.status === 'ACCEPTED')
      : swapList.filter((s) => s.status === 'PENDING'),
    loading: swaps.isPending || (manager && timeOff.isPending),
  };
}
