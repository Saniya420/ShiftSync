import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { PageHeading, QueryState } from '../components';
import type { User } from '../types';
export function Profile() {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get<{ user: User }>('/profile')).data.user,
  });
  const [password, setPassword] = useState(''),
    [pin, setPin] = useState(''),
    [clearPin, setClearPin] = useState(false),
    [current, setCurrent] = useState('');
  const mutation = useMutation({
    mutationFn: async (body: object) => api.put('/profile', body),
    onSuccess: async () => {
      setPassword('');
      setPin('');
      setCurrent('');
      setClearPin(false);
      await Promise.all(
        ['me', 'profile', 'users'].map((k) => cache.invalidateQueries({ queryKey: [k] })),
      );
      toast.success('Profile updated.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      name: String(data.get('name')),
      emailNotifications: data.get('emailNotifications') === 'on',
      ...(password ? { password } : {}),
      ...(clearPin ? { pin: null } : pin ? { pin } : {}),
      ...(current ? { currentPassword: current } : {}),
    });
  };
  return (
    <>
      <PageHeading
        title="Your profile"
        description="Manage your account, email preferences and attendance PIN."
      />
      <QueryState loading={query.isPending} error={query.isError} />
      {query.data && (
        <form onSubmit={submit} className="card max-w-xl space-y-5">
          {query.data.mustChangePassword && (
            <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
              Change your temporary password to continue using your workspace.
            </p>
          )}
          <label>
            Name
            <input name="name" required maxLength={100} defaultValue={query.data.name} />
          </label>
          <p className="break-all text-sm text-slate-500">{query.data.email}</p>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="emailNotifications"
              defaultChecked={query.data.emailNotifications}
            />
            Email me about schedules and requests
          </label>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required={!!password || !!pin || clearPin}
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={query.data.mustChangePassword}
            />
          </label>
          <label>
            New clock-in PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,12}"
              autoComplete="off"
              disabled={clearPin}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <span className="text-xs text-slate-400">
              4-12 digits. Leave blank to keep your current PIN.
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={clearPin}
              onChange={(e) => setClearPin(e.target.checked)}
            />
            Clear clock-in PIN
          </label>
          <button className="btn-primary" disabled={mutation.isPending}>
            Save profile
          </button>
        </form>
      )}
    </>
  );
}
