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
export function Notifications() {
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
        className="btn-secondary"
        aria-label={'Notifications, ' + (query.data?.unreadCount ?? 0) + ' unread'}
        onClick={() => setOpen(true)}
      >
        <Bell size={17} />
        <span>{query.data?.unreadCount ?? 0}</span>
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
                  'rounded-xl border p-4 ' +
                  (n.readAt ? 'border-slate-100' : 'border-emerald-200 bg-emerald-50')
                }
              >
                <h3>{n.title}</h3>
                <p className="my-2 text-sm">{n.message}</p>
                {!n.readAt && (
                  <button
                    disabled={action.isPending}
                    className="text-sm font-semibold text-emerald-800"
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
