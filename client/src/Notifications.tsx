import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from './api';
import { Modal } from './Modal';
import { QueryState } from './components';
import { useRequestAction } from './pages/Requests';
interface Notification {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
}
export function Notifications({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications'))
        .data,
    refetchInterval: 30000,
  });
  const action = useRequestAction();
  return (
    <>
      <button
        className={
          compact
            ? 'relative rounded-md p-2 text-white hover:bg-white/10'
            : 'btn-secondary relative px-3 py-2'
        }
        aria-label={'Notifications, ' + (query.data?.unreadCount ?? 0) + ' unread'}
        onClick={() => setOpen(true)}
      >
        <Bell size={compact ? 20 : 17} />
        {compact ? (
          query.data?.unreadCount ? (
            <span className="num absolute top-0.5 right-0.5 min-w-4 rounded-sm bg-red-600 px-1 text-[11px] leading-4 text-white">
              {query.data.unreadCount}
            </span>
          ) : null
        ) : (
          <span className="num">{query.data?.unreadCount ?? 0}</span>
        )}
      </button>
      {open && (
        <Modal title="Notifications" onClose={() => setOpen(false)}>
          <QueryState loading={query.isPending} error={query.isError} />
          <button
            disabled={action.isPending || !query.data?.unreadCount}
            className="btn-secondary mb-4"
            onClick={() => action.mutate({ path: '/notifications/read-all' })}
          >
            Mark all read
          </button>
          <div className="space-y-3">
            {query.data?.notifications.map((n) => (
              <article
                key={n.id}
                className={
                  'rounded-md border p-4 ' +
                  (n.readAt ? 'border-slate-200' : 'border-stamp-300 bg-stamp-50')
                }
              >
                <h3>{n.title}</h3>
                <p className="my-2 text-sm text-slate-600">{n.message}</p>
                {!n.readAt && (
                  <button
                    disabled={action.isPending}
                    className="text-sm font-semibold text-stamp-800"
                    onClick={() => action.mutate({ path: '/notifications/' + n.id + '/read' })}
                  >
                    Mark read
                  </button>
                )}
              </article>
            ))}
          </div>
          {query.data?.notifications.length === 0 && <p>No notifications yet.</p>}
        </Modal>
      )}
    </>
  );
}
