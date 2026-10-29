import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { api } from '../api';
import { AiRoster } from './AiRoster';
import { Profile } from './Profile';
import { TeamBatch } from './TeamBatch';
import { RosterBatch } from './RosterBatch';
import { RequestsPage } from './Requests';
import { Layout } from '../Layout';
import type { User, Location, Shift } from '../types';
const user: User = {
  id: 'a',
  organizationId: 'org',
  name: 'Alex',
  email: 'alex@test.local',
  role: 'OWNER',
  hourlyRate: '20',
  maxWeeklyHours: 40,
  active: true,
  emailNotifications: true,
};
const location: Location = {
  id: 'loc',
  name: 'Main',
  timezone: 'UTC',
  geofenceRadiusM: 100,
  clockInGraceMin: 5,
};
const shift: Shift = {
  id: 's1',
  userId: 'a',
  locationId: 'loc',
  startsAt: '2026-10-19T09:00:00Z',
  endsAt: '2026-10-19T17:00:00Z',
  position: 'Floor',
  status: 'DRAFT',
  warnings: [],
  notes: null,
};
function mount(element: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <AuthProvider>{element}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function mockGet(routes: Record<string, unknown> = {}) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url === '/auth/me' ? { user } : (routes[url] ?? {}),
  }));
}
afterEach(() => vi.unstubAllGlobals());
it('previews fallback suggestions without saving and applies only on click', async () => {
  mockGet();
  const close = vi.fn();
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      source: 'heuristic',
      shifts: [shift],
      warnings: [{ type: 'UNDERSTAFFED', message: 'One slot remains unfilled.' }],
      explanation: 'Balanced hours',
    },
  });
  mount(<AiRoster week="2026-10-19" locationId="loc" zone="UTC" people={[user]} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Same every weekday' }));
  expect(screen.getAllByLabelText('Day')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Generate suggestion' }));
  await screen.findByText('Smart fallback');
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1]).toMatchObject({
    needs: expect.arrayContaining([
      expect.objectContaining({ weekday: 1 }),
      expect.objectContaining({ weekday: 5 }),
    ]),
  });
  expect(screen.getByText('One slot remains unfilled.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply as drafts' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/ai/apply-suggestion', {
      week: '2026-10-19',
      locationId: 'loc',
      shifts: [shift],
      force: false,
    }),
  );
  await waitFor(() => expect(close).toHaveBeenCalled());
});
it('submits profile preferences and current-password-protected PIN change', async () => {
  mockGet({ '/profile': { user } });
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { user } });
  mount(<Profile />);
  await screen.findByDisplayValue('Alex');
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alex Rivera' } });
  fireEvent.click(screen.getByLabelText('Email me about schedules and requests'));
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'CurrentPassword2026!' },
  });
  fireEvent.change(screen.getByLabelText(/New clock-in PIN/), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/profile', {
      name: 'Alex Rivera',
      emailNotifications: false,
      currentPassword: 'CurrentPassword2026!',
      pin: '1234',
    }),
  );
});
it('batch edits selected team members only', async () => {
  mockGet();
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { updated: 1 } });
  mount(<TeamBatch people={[user]} locations={[location]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Batch edit team' }));
  fireEvent.click(screen.getByLabelText('Alex'));
  fireEvent.change(screen.getByLabelText('Assign location'), { target: { value: 'loc' } });
  fireEvent.change(screen.getByLabelText('Max weekly hours'), { target: { value: '32' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update selected members' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/users/batch', {
      ids: ['a'],
      locationId: 'loc',
      maxWeeklyHours: 32,
    }),
  );
});
it('requires confirmation before batch draft deletion', async () => {
  mockGet();
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { deleted: 1 } });
  mount(<RosterBatch week="2026-10-19" locationId="loc" shifts={[shift]} people={[user]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Batch operations' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Alex/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected drafts' }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/shifts/batch-delete', { ids: ['s1'] }));
});
it('filters the requests inbox and displays individual batch failures', async () => {
  mockGet({
    '/time-off': {
      requests: [
        {
          id: 't1',
          userId: 'a',
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          reason: 'Family',
          status: 'PENDING',
          user: { name: 'Alex' },
        },
      ],
    },
    '/swaps': { swaps: [] },
  });
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { results: [{ id: 't1', ok: false, error: { message: 'Already resolved.' } }] },
  });
  mount(<RequestsPage />);
  await screen.findByText('Family');
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PENDING' } });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-19' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-25' } });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/time-off', {
      params: { status: 'PENDING', from: '2026-10-19', to: '2026-10-25' },
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Select pending shown' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select pending shown' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve selected' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/time-off/batch-decision', {
      ids: ['t1'],
      status: 'APPROVED',
    }),
  );
  await screen.findByText(/Already resolved/);
});
it('exposes an accessible collapsible navigation menu and admin/profile links', async () => {
  mockGet({ '/notifications': { notifications: [], unreadCount: 0 } });
  mount(<Layout />);
  const menu = await screen.findByRole('button', { name: 'Menu' });
  expect(menu).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(menu);
  expect(menu).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/app/admin');
  fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
  expect(menu).toHaveAttribute('aria-expanded', 'false');
});
