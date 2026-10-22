import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { api } from '../api';
import { Admin } from './Admin';
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: () => null,
}));
const report = {
  timezone: 'UTC',
  kpis: { scheduledHours: 8, actualHours: 7, coverage: 100 },
  daily: [],
  attendance: [],
  hoursPerEmployee: [],
};
function mount(role = 'OWNER') {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      url === '/auth/me'
        ? { user: { id: 'owner', role, name: 'Owner' } }
        : url === '/admin/analytics'
          ? report
          : url === '/locations'
            ? { locations: [{ id: 'loc', name: 'Main' }] }
            : url === '/users'
              ? {
                  users: [
                    {
                      id: 'e1',
                      name: 'Alex',
                      email: 'alex@test.local',
                      role: 'EMPLOYEE',
                      active: true,
                    },
                  ],
                }
              : { entries: [], total: 0, page: 1, pageSize: 25 },
  }));
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <AuthProvider>
          <Admin />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('lets managers filter analytics without showing user or audit tabs', async () => {
  mount('MANAGER');
  await screen.findByText('Scheduled hours');
  expect(screen.queryByRole('tab', { name: 'Audit log' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-23' } });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'loc' } });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/admin/analytics', {
      params: { from: '2026-10-01', to: '2026-10-23', locationId: 'loc' },
    }),
  );
});
it('requires an owner confirmation before resetting a password and shows the returned credential', async () => {
  mount();
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { tempPassword: 'OneTimePassword2026!' } });
  fireEvent.click(await screen.findByRole('tab', { name: 'Users' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/users/e1/reset-password', {}));
  expect(await screen.findByText('OneTimePassword2026!')).toBeInTheDocument();
});
it('filters the owner audit viewer and displays an empty state', async () => {
  mount();
  fireEvent.click(await screen.findByRole('tab', { name: 'Audit log' }));
  await screen.findByText('No audit entries');
  fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'USER_UPDATED' } });
  fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'User' } });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/admin/audit-log', {
      params: { page: 1, action: 'USER_UPDATED', entity: 'User' },
    }),
  );
});
