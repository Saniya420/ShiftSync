import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Check, Leaf } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
export function Landing() {
  return (
    <div className="min-h-screen bg-[#f5f6f0]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <Link to="/" className="flex items-center gap-2 text-2xl font-bold text-ink">
          <CalendarDays />
          ShiftSync.
        </Link>
        <div className="flex gap-3">
          <Link className="btn-secondary" to="/login">
            Sign in
          </Link>
          <Link className="btn-primary hidden sm:inline-flex" to="/signup">
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </nav>
      <main className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-16 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="eyebrow">SMALL TEAMS. BIG THINGS.</p>
          <h1 className="mt-5 text-5xl leading-[1.08] tracking-[-0.05em] text-ink sm:text-7xl">
            Good weeks
            <br />
            start with a<br />
            <span className="text-emerald-600">clear schedule.</span>
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-slate-500">
            Bring your team’s shifts, availability, and weekly plans into one calm, connected
            workspace.
          </p>
          <Link to="/signup" className="btn-primary mt-8 px-6 py-4">
            Create your workspace <ArrowRight size={18} />
          </Link>
          <p className="mt-5 text-xs text-slate-400">
            Built for local shops, cafés, and the teams that make them.
          </p>
        </div>
        <div className="relative rounded-[32px] bg-[#dbeade] p-6 sm:p-10">
          <Leaf className="mb-8 text-emerald-800" size={38} />
          <div className="rounded-2xl border border-white bg-white/95 p-6 shadow-xl shadow-emerald-950/5">
            <div className="flex items-center justify-between">
              <h2 className="text-ink">This week, sorted.</h2>
              <span className="badge bg-emerald-100 text-emerald-800">Published</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Your people. The right place. The right time.
            </p>
            <div className="mt-6 flex justify-between gap-2">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <div
                  key={i}
                  className={
                    'flex flex-1 flex-col gap-3 rounded-xl p-2 text-center text-xs ' +
                    (i === 2 ? 'bg-ink text-white' : 'bg-slate-50 text-slate-500')
                  }
                >
                  <span>{day}</span>
                  <span className="text-lg font-semibold">{19 + i}</span>
                  <span
                    className={
                      'h-12 rounded-md ' + (i < 5 ? 'bg-emerald-300/70' : 'bg-slate-200/50')
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
              <span className="rounded-full bg-emerald-200 p-1">
                <Check size={15} />
              </span>
              <p className="text-sm text-emerald-900">Fewer conflicts. More peace of mind.</p>
            </div>
          </div>
          <p className="mt-8 text-sm font-medium text-emerald-900/60">
            Less time juggling. More time doing.
          </p>
        </div>
      </main>
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
    <div className="flex min-h-screen items-center justify-center bg-[#eef2ea] p-5">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-9 flex items-center justify-center gap-2 text-2xl font-bold text-ink"
        >
          <CalendarDays />
          ShiftSync.
        </Link>
        <div className="card p-8 sm:p-10">
          <p className="eyebrow">{signup ? 'A FRESH START' : 'GOOD TO SEE YOU'}</p>
          <h1 className="mt-2 text-3xl">{signup ? 'Make work flow.' : 'Welcome back.'}</h1>
          <p className="mt-3 text-sm text-slate-500">
            {signup
              ? 'Create a home for your team’s schedule.'
              : 'Your team’s next great week starts here.'}
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
            {signup && (
              <p className="text-xs text-slate-400">
                Use at least 12 characters (up to 72 UTF-8 bytes).
              </p>
            )}
            <button disabled={busy} className="btn-primary w-full justify-center py-3">
              {busy ? 'One moment…' : signup ? 'Create workspace' : 'Sign in'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            {signup ? 'Already have a workspace?' : 'New to ShiftSync?'}{' '}
            <Link className="font-semibold text-emerald-800" to={signup ? '/login' : '/signup'}>
              {signup ? 'Sign in' : 'Get started'}
            </Link>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">A calmer way to run your week.</p>
      </div>
    </div>
  );
}
