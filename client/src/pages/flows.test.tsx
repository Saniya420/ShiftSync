import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { AuthProvider, Protected } from '../auth';
import { AvailabilityPage } from './Availability';
import { Roster } from './Roster';
import { AuthPage } from './AuthPages';
const owner = {
  id: 'owner',
  name: 'Sam Taylor',
  role: 'OWNER',
  organization: { name: 'Shop', timezone: 'UTC' },
};
const employee = {
  id: 'employee',
  name: 'Alex Rivera',
  role: 'EMPLOYEE',
  hourlyRate: '20',
  maxWeeklyHours: 40,
  locations: [{ locationId: 'loc' }],
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
describe('working client flows', () => {
  it('submits login credentials', async () => {
    vi.spyOn(api, 'get').mockRejectedValue({ response: { status: 401 } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { user: owner } });
    mount(<AuthPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password12345!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login', {
        email: 'owner@example.com',
        password: 'Password12345!',
      }),
    );
  });
  it('replaces recurring availability with selected local hours', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => ({
      data:
        url === '/auth/me'
          ? { user: employee }
          : { availability: [{ weekday: 1, startMinute: 540, endMinute: 1020 }] },
    }));
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    mount(<AvailabilityPage />);
    const start = await screen.findByRole('combobox', { name: 'Monday start 1' });
    fireEvent.change(start, { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/availability', {
        availability: [{ weekday: 1, startMinute: 600, endMinute: 1020 }],
      }),
    );
  });
  it('guards manager-only content from employees', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { user: employee } });
    mount(
      <Protected roles={['OWNER', 'MANAGER']}>
        <p>Manager secrets</p>
      </Protected>,
    );
    await waitFor(() =>
      expect(screen.queryByText('Getting your workspace ready…')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Manager secrets')).not.toBeInTheDocument();
  });
  it('renders the employee grid, adds a shift, copies and publishes', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => ({
      data:
        url === '/auth/me'
          ? { user: owner }
          : url === '/locations'
            ? { locations: [{ id: 'loc', name: 'Main Street', timezone: 'UTC' }] }
            : url === '/users'
              ? { users: [employee] }
              : {
                  shifts: [
                    {
                      id: 's1',
                      locationId: 'loc',
                      userId: 'employee',
                      startsAt: '2026-10-19T09:00:00Z',
                      endsAt: '2026-10-19T17:00:00Z',
                      position: 'Cashier',
                      status: 'DRAFT',
                      warnings: [],
                    },
                  ],
                },
    }));
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { warnings: [], shifts: [], published: 1 } });
    mount(<Roster />);
    await screen.findByText('Alex Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Add shift' }));
    expect(screen.getByRole('dialog', { name: 'Make a plan' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/shifts',
        expect.objectContaining({ userId: 'employee', locationId: 'loc', force: false }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Copy last week' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/shifts/copy-previous-week',
        expect.objectContaining({ locationId: 'loc' }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish week' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Publish week' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/shifts/publish',
        expect.objectContaining({ locationId: 'loc' }),
      ),
    );
  });
});
