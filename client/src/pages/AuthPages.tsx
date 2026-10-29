import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
const sampleDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Illustrative week for the landing page; it is labelled as a sample where it is shown.
const sampleRows: { name: string; role: string; cells: (string | null)[]; clash?: number }[] = [
  {
    name: 'Ayesha K.',
    role: 'Cashier',
    cells: ['08–14', '08–14', null, '08–14', '08–14', null, null],
  },
  {
    name: 'Bilal R.',
    role: 'Stock',
    cells: [null, '14–22', '14–22', '14–22', null, '10–18', null],
    clash: 5,
  },
  {
    name: 'Sara M.',
    role: 'Cashier',
    cells: ['14–22', null, '08–14', null, '14–22', '10–18', '10–16'],
  },
  {
    name: 'Omar T.',
    role: 'Barista',
    cells: ['06–12', '06–12', '06–12', null, '06–12', null, '10–16'],
  },
];
const sampleHours = [20, 22, 20, 14, 20, 16, 12];
function SampleRoster() {
  return (
    <figure className="relative m-0 min-w-0 rounded-[10px] border border-slate-300 bg-white shadow-[0_18px_40px_-24px_rgba(27,29,33,0.35)]">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-dashed border-slate-300 px-4 py-3 sm:px-5">
        <span className="font-bold text-ink" style={{ fontStretch: '87.5%' }}>
          Corner Mart · Main St
        </span>
        <span className="num text-xs text-slate-500">Sample week · 19–25 Oct</span>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="px-4 py-2 font-medium sm:px-5">Team</th>
              {sampleDays.map((d) => (
                <th key={d} className="px-1 py-2 text-center font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row) => (
              <tr key={row.name} className="border-t border-slate-100">
                <th className="px-4 py-2 font-normal sm:px-5">
                  <span className="block text-sm font-semibold text-ink">{row.name}</span>
                  <span className="block text-xs text-slate-500">{row.role}</span>
                </th>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-1 py-2 text-center">
                    {cell && (
                      <span
                        className={
                          'num block rounded-sm px-1 py-1 text-xs ' +
                          (row.clash === i
                            ? 'border border-red-400 bg-red-50 font-semibold text-red-800'
                            : 'border border-slate-200 bg-slate-50 text-ink')
                        }
                      >
                        {cell}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th className="px-4 pt-3 pb-1 text-xs font-medium text-slate-500 sm:px-5">Hours</th>
              {sampleHours.map((h, i) => (
                <td key={i} className="px-1 pt-3 pb-1">
                  <span className="tally block text-center">{h}h</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2 pb-4 sm:px-5">
        <p className="flex items-center gap-2 text-sm text-red-800">
          <span className="stamp stamp-bad">Clash</span>
          Bilal is on approved leave Saturday
        </p>
        <p className="tally tally-total min-w-36 border-t-0 text-right text-sm">124.0 h total</p>
      </div>
      <span
        className="stamp stamp-ok absolute -top-3 right-4 rotate-[-4deg] bg-white px-2 py-1 text-xs"
        aria-hidden="true"
      >
        Held for review
      </span>
    </figure>
  );
}
export function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          to="/"
          className="text-2xl font-extrabold tracking-[-0.02em] text-ink"
          style={{ fontStretch: '87.5%' }}
        >
          ShiftSync
        </Link>
        <div className="flex gap-2">
          <Link className="btn-secondary" to="/login">
            Sign in
          </Link>
          <Link className="btn-primary hidden sm:inline-flex" to="/signup">
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </nav>
      <main className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:pt-16 lg:pb-24">
        <div className="min-w-0">
          <h1
            className="text-[2.75rem] leading-[1.02] tracking-[-0.03em] sm:text-6xl"
            style={{ fontStretch: '80%' }}
          >
            Build the week.
            <br />
            Catch the clash.
            <br />
            Then publish.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
            ShiftSync checks every shift against availability, time off, rest gaps and weekly hour
            limits before your team ever sees the roster.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/signup" className="btn-primary px-5 py-3.5 text-base">
              Create your workspace <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="text-sm font-semibold text-ink underline">
              I already have one
            </Link>
          </div>
        </div>
        <SampleRoster />
      </main>
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          {[
            {
              title: 'Managers',
              items: [
                'Week grid with copy last week',
                'Conflict checks before publish',
                'Approve swaps and time off',
              ],
            },
            {
              title: 'Employees',
              items: [
                'Next shift on the home screen',
                'Clock in and out at the door',
                'Offer or pick up shifts',
              ],
            },
            {
              title: 'Payroll',
              items: [
                'Scheduled against actual hours',
                'Late, no-show and early leave',
                'Timesheets as CSV',
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <h2>{col.title}</h2>
              <ul className="mt-3 divide-y divide-dashed divide-slate-300 border-t border-ink text-sm text-slate-700">
                {col.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 py-2.5">
                    <Check size={15} className="shrink-0 text-stamp-700" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500 sm:px-6">
        ShiftSync · rosters, swaps, attendance and timesheets for small shops.
      </footer>
    </div>
  );
}
export function AuthPage({ signup = false }: { signup?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api.post(signup ? '/auth/signup' : '/auth/login', values);
      // Drop the previous user's data but keep the ['me'] query: clearing it detaches AuthProvider's
      // observer, which would keep reporting the stale logged-out state and bounce back to /login.
      cache.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      cache.setQueryData(['me'], result.data.user);
      toast.success(signup ? 'Your workspace is ready.' : 'Welcome back.');
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/app') ? from : '/app', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-8 block text-center text-2xl font-extrabold tracking-[-0.02em] text-ink"
          style={{ fontStretch: '87.5%' }}
        >
          ShiftSync
        </Link>
        <div className="card p-6 sm:p-9">
          <h1 className="text-3xl">{signup ? 'Set up your shop' : 'Sign in'}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {signup
              ? 'You’ll be the owner. Add locations and invite your team next.'
              : 'Use the email you signed up with, or the one your manager invited.'}
          </p>
          <form className="mt-7 space-y-4" onSubmit={submit}>
            {signup && (
              <>
                <label>
                  Your name
                  <input name="name" required maxLength={100} autoComplete="name" />
                </label>
                <label>
                  Business name
                  <input
                    name="organizationName"
                    required
                    maxLength={100}
                    autoComplete="organization"
                  />
                </label>
              </>
            )}
            <label>
              Email address
              <input name="email" type="email" required maxLength={254} autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete={signup ? 'new-password' : 'current-password'}
              />
            </label>
            {signup && <p className="text-xs text-slate-500">At least 12 characters.</p>}
            <button disabled={busy} className="btn-primary w-full justify-center py-3">
              {busy ? 'One moment…' : signup ? 'Create workspace' : 'Sign in'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            {signup ? 'Already have a workspace?' : 'New to ShiftSync?'}{' '}
            <Link className="font-semibold text-ink underline" to={signup ? '/login' : '/signup'}>
              {signup ? 'Sign in' : 'Get started'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
