import { afterEach, it, expect, vi } from 'vitest';
import { consumeAiLimit, generateSuggestion } from './ai.js';
const input = () => ({
  week: '2026-10-19',
  timezone: 'UTC',
  employees: [
    {
      id: 'a',
      name: 'Alex',
      hourlyRate: 20,
      maxWeeklyHours: 40,
      availability: [{ weekday: 1, startMinute: 0, endMinute: 1440 }],
      timeOff: [],
    },
  ],
  existing: [],
  needs: [{ weekday: 1, start: '09:00', end: '17:00', headcount: 1, position: 'Floor' }],
});
const options = { key: 'fake-test-key', model: 'gemini-3.5-flash' };
const shift = {
  userId: 'a',
  startsAt: '2026-10-19T09:00:00Z',
  endsAt: '2026-10-19T17:00:00Z',
  position: 'Floor',
};
const response = (value: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  );
afterEach(() => vi.useRealTimers());
it('uses no network without a key', async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect((await generateSuggestion(input(), { ...options, key: '' }, fetcher)).source).toBe(
    'heuristic',
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('validates Gemini output and strips invalid users and times', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    response({
      shifts: [shift, { ...shift, userId: 'foreign' }, { ...shift, endsAt: 'bad' }],
      explanation: 'Balanced',
    }),
  );
  const r = await generateSuggestion(input(), options, fetcher);
  expect(r.source).toBe('gemini');
  expect(r.shifts).toHaveLength(1);
  expect(r.warnings).toHaveLength(2);
  const sent = String(fetcher.mock.calls[0][1]?.body);
  expect(sent).not.toMatch(/password|email|pinHash/);
  expect(JSON.parse(sent).generationConfig.responseMimeType).toBe('application/json');
});
it.each(['json', 'schema', 'http', 'reject'])('falls back for %s', async (kind) => {
  const fetcher = vi.fn<typeof fetch>();
  if (kind === 'json') fetcher.mockResolvedValue(new Response('bad json'));
  if (kind === 'schema') fetcher.mockResolvedValue(response({ shifts: 'bad' }));
  if (kind === 'http') fetcher.mockResolvedValue(new Response('', { status: 503 }));
  if (kind === 'reject') fetcher.mockRejectedValue(new Error('offline'));
  const r = await generateSuggestion(input(), options, fetcher);
  expect(r.source).toBe('heuristic');
  expect(r.shifts).toHaveLength(1);
});
it('retries an overloaded model with the fallback model', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(response({ shifts: [shift], explanation: 'Lite' }));
  const r = await generateSuggestion(
    input(),
    { ...options, fallbackModel: 'gemini-flash-lite-latest' },
    fetcher,
  );
  expect(r.source).toBe('gemini');
  expect(String(fetcher.mock.calls[1][0])).toContain('gemini-flash-lite-latest');
});
it('times out at twenty seconds even if fetch never settles', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
  const pending = generateSuggestion(input(), options, fetcher);
  await vi.advanceTimersByTimeAsync(20000);
  expect((await pending).source).toBe('heuristic');
  expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
});
it('runs model suggestions through all conflicts', async () => {
  const r = await generateSuggestion(
    { ...input(), employees: [{ ...input().employees[0], maxWeeklyHours: 1, availability: [] }] },
    options,
    vi.fn<typeof fetch>().mockResolvedValue(response({ shifts: [shift], explanation: 'Example' })),
  );
  expect(r.warnings.map((w) => w.type)).toContain('WEEKLY_HOURS');
  expect(r.warnings.map((w) => w.type)).toContain('OUTSIDE_AVAILABILITY');
});
it('limits calls independently per org and resets after an hour', () => {
  for (let i = 0; i < 20; i++) consumeAiLimit('limit-org', 1000);
  expect(() => consumeAiLimit('limit-org', 1000)).toThrow('20 per hour');
  expect(() => consumeAiLimit('other-org', 1000)).not.toThrow();
  expect(() => consumeAiLimit('limit-org', 3601000)).not.toThrow();
});
