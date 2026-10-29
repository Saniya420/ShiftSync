import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { api } from '../api';
import { AuthProvider } from '../auth';
import { Roster } from './Roster';

describe('explicit overlap review', () => {
  it('requires a second explicit action to publish an overlapping roster', async () => {
    const monday = DateTime.now().setZone('UTC').startOf('week');
    vi.spyOn(api, 'get').mockImplementation(async (url) => ({
      data:
        url === '/auth/me'
          ? {
              user: {
                id: 'owner',
                name: 'Owner',
                role: 'OWNER',
                organization: { timezone: 'UTC' },
              },
            }
          : url === '/locations'
            ? { locations: [{ id: 'loc', name: 'Main', timezone: 'UTC' }] }
            : url === '/users'
              ? { users: [] }
              : {
                  shifts: [
                    {
                      id: 'draft',
                      locationId: 'loc',
                      userId: null,
                      startsAt: monday.plus({ hours: 9 }).toISO(),
                      endsAt: monday.plus({ hours: 17 }).toISO(),
                      position: 'Floor',
                      status: 'DRAFT',
                      warnings: [],
                    },
                  ],
                },
    }));
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: {
              code: 'SHIFT_OVERLAP',
              message: 'Overlap',
              details: { warnings: [{ type: 'OVERLAP', message: 'Overlaps another shift.' }] },
            },
          },
        },
      })
      .mockResolvedValue({ data: { published: 1, warnings: [] } });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <AuthProvider>
            <Roster />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish week' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Publish week' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish and notify' }));
    const override = await screen.findByRole('button', { name: 'Publish with overlap' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith(
      '/shifts/publish',
      expect.objectContaining({ force: false }),
    );
    fireEvent.click(override);
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        '/shifts/publish',
        expect.objectContaining({ force: true }),
      ),
    );
  });
});
