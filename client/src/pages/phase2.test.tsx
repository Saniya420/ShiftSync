import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth';
import { api } from '../api';
import { Notifications } from '../Notifications';
import { AttendancePage, ClockCard } from './Attendance';
import { OpenShiftsPage, RequestsPage, SwapOffer, TimeOffPage } from './Requests';
import { TimesheetsPage } from './Timesheets';
import type { Shift } from '../types';
const user = {
  id: 'e1',
  name: 'Alex',
  role: 'EMPLOYEE',
  organization: { timezone: 'Asia/Karachi' },
};
const shift: Shift = {
  id: 's1',
  userId: 'e1',
  locationId: 'loc',
  startsAt: '2026-10-23T09:00:00Z',
  endsAt: '2026-10-23T17:00:00Z',
  position: 'Cashier',
  status: 'PUBLISHED',
  notes: null,
  warnings: [],
  location: { name: 'Main', timezone: 'UTC' },
};
const swap = {
  id: 'swap1',
  requesterId: 'e1',
  acceptedById: 'e2',
  status: 'ACCEPTED',
  requester: { name: 'Alex' },
  acceptedBy: { name: 'Jordan' },
  target: null,
  shift,
};
afterEach(() => vi.unstubAllGlobals());
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
function mockGet(routes: Record<string, unknown>) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url === '/auth/me' ? { user } : (routes[url] ?? {}),
  }));
}
describe('phase 2 client workflows', () => {
  it('requests inclusive whole days in the organization timezone, then cancels', async () => {
    mockGet({
      '/time-off': {
        requests: [
          {
            id: 'r1',
            userId: 'e1',
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            reason: 'Family',
            status: 'PENDING',
            user: { name: 'Alex' },
          },
        ],
      },
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    mount(<TimeOffPage />);
    await screen.findByText('Family');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-23' } });
    fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-24' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Travel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request time off' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/time-off', {
        startsAt: '2026-10-23T00:00:00.000+05:00',
        endsAt: '2026-10-25T00:00:00.000+05:00',
        reason: 'Travel',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel request' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/time-off/r1/cancel', {}));
  });
  it('offers a shift to a selected coworker', async () => {
    mockGet({ '/swaps/coworkers': { users: [{ id: 'e2', name: 'Jordan' }] } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} }),
      close = vi.fn();
    mount(<SwapOffer shift={shift} close={close} />);
    await screen.findByRole('option', { name: 'Jordan' });
    fireEvent.change(screen.getByLabelText('Offer to'), { target: { value: 'e2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Offer shift' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/swaps', { shiftId: 's1', targetUserId: 'e2' }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('accepts an eligible offer from Open shifts', async () => {
    mockGet({
      '/swaps': {
        swaps: [
          { ...swap, requesterId: 'e2', acceptedById: null, acceptedBy: null, status: 'PENDING' },
        ],
      },
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    mount(<OpenShiftsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept shift' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/swaps/swap1/accept', {}));
  });
  it('reviews conflicts before explicitly forcing swap approval', async () => {
    mockGet({ '/time-off': { requests: [] }, '/swaps': { swaps: [swap] } });
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: {
              message: 'Review conflicts',
              details: { warnings: [{ type: 'TIME_OFF', message: 'Approved leave' }] },
            },
          },
        },
      })
      .mockResolvedValue({ data: {} });
    mount(<RequestsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Swaps' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await screen.findByRole('dialog', { name: 'Review swap conflicts' });
    expect(post).toHaveBeenCalledWith('/swaps/swap1/approve', { force: false });
    expect(screen.getByText('TIME_OFF: Approved leave')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve with conflicts' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/swaps/swap1/approve', { force: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('clocks in with browser coordinates and an optional PIN', async () => {
    mockGet({ '/attendance/current': { shift, record: null } });
    const geo = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 0, longitude: 0 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: geo } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    mount(<ClockCard />);
    await screen.findByRole('button', { name: 'Clock in' });
    fireEvent.change(screen.getByLabelText('PIN (if set)'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clock in' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/attendance/clock-in', {
        shiftId: 's1',
        pin: '1234',
        lat: 0,
        lng: 0,
      }),
    );
    expect(geo).toHaveBeenCalled();
  });
  it('corrects attendance with local times and a required note', async () => {
    mockGet({
      '/attendance': {
        timezone: 'UTC',
        shifts: [
          {
            ...shift,
            user: { name: 'Alex' },
            liveStatus: 'OUT',
            attendance: [
              { id: 'a1', clockInAt: shift.startsAt, clockOutAt: shift.endsAt, status: 'ON_TIME' },
            ],
          },
        ],
      },
    });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    mount(<AttendancePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Correct record' }));
    expect(screen.getByLabelText('Correction note')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Correction note'), {
      target: { value: 'Verified with manager' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/attendance/a1', {
        clockInAt: '2026-10-23T09:00:00.000Z',
        clockOutAt: '2026-10-23T17:00:00.000Z',
        note: 'Verified with manager',
      }),
    );
  });
  it('filters timesheets by date and location', async () => {
    mockGet({
      '/locations': { locations: [{ id: 'loc', name: 'Main' }] },
      '/timesheets': {
        timezone: 'UTC',
        rows: [
          {
            userId: 'e1',
            name: 'Alex',
            scheduledHours: 8,
            actualHours: 7.5,
            overtimeHours: 0,
            lateCount: 1,
            estimatedCost: 160,
          },
        ],
      },
    });
    mount(<TimesheetsPage />);
    await screen.findByRole('cell', { name: '7.50h' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-19' } });
    fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-25' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'loc' } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/timesheets', {
        params: { from: '2026-10-19', to: '2026-10-25', locationId: 'loc' },
      }),
    );
  });
  it('shows unread notifications and supports mark read and read-all', async () => {
    mockGet({
      '/notifications': {
        unreadCount: 1,
        notifications: [
          { id: 'n1', title: 'Schedule ready', message: 'Your week is published', readAt: null },
        ],
      },
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    mount(<Notifications />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/n1/read', {}));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/notifications/read-all', {}));
  });
});
