import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Clock3,
  LogOut,
  ArrowUpRight,
  Leaf,
} from 'lucide-react';
import { api, errorMessage } from './api';
import { useAuth } from './auth';
import { initials } from './components';
import toast from 'react-hot-toast';
import { Notifications } from './Notifications';
export function Layout() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const navigate = useNavigate();
  if (!user) return null;
  const manager = user.role !== 'EMPLOYEE';
  const links = [
    { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
    ...(manager
      ? [
          { to: '/app/roster', label: 'Roster builder', icon: CalendarDays, end: false },
          { to: '/app/team', label: 'Team', icon: Users, end: false },
          { to: '/app/requests', label: 'Requests', icon: CalendarDays, end: false },
          { to: '/app/attendance', label: 'Attendance', icon: Clock3, end: false },
          { to: '/app/timesheets', label: 'Timesheets', icon: Clock3, end: false },
        ]
      : [{ to: '/app/schedule', label: 'My schedule', icon: CalendarDays, end: false }]),
    { to: '/app/availability', label: 'Availability', icon: Clock3, end: false },
    { to: '/app/time-off', label: 'Time off', icon: CalendarDays, end: false },
    ...(!manager
      ? [{ to: '/app/open-shifts', label: 'Open shifts', icon: CalendarDays, end: false }]
      : []),
  ];
  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
      // Keep the ['me'] query attached to AuthProvider (see AuthPages) and mark it signed out.
      cache.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      cache.setQueryData(['me'], null);
      navigate('/login');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex flex-col bg-ink px-5 py-5 text-white lg:fixed lg:inset-y-0 lg:w-64 lg:px-6 lg:py-8">
        <NavLink to="/app" className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#b9f1d0] text-ink">
            <CalendarDays size={22} />
          </span>
          ShiftSync<span className="text-emerald-300">.</span>
        </NavLink>
        <div className="mt-7 hidden rounded-xl border border-white/15 bg-white/5 px-3 py-3 lg:block">
          <p className="text-[10px] font-bold tracking-widest text-emerald-200/60">WORKSPACE</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {user.organization?.name ?? 'Your organization'}
          </p>
          <p className="mt-1 text-xs text-white/40">One team. In sync.</p>
        </div>
        <nav
          aria-label="Main navigation"
          className="mt-5 flex gap-1 overflow-x-auto lg:mt-8 lg:flex-col"
        >
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              end={end}
              key={to}
              to={to}
              className={({ isActive }) =>
                'flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ' +
                (isActive
                  ? 'bg-[#d7f3e4] text-ink'
                  : 'text-white/65 hover:bg-white/10 hover:text-white')
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden rounded-2xl bg-[#244b45] p-4 lg:block">
          <Leaf size={24} className="text-emerald-200" />
          <p className="mt-3 text-sm font-semibold">
            A little less admin.
            <br />A lot more teamwork.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            Make room for the work that matters.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 lg:mt-6">
          <span className="avatar bg-white/15 text-white">{initials(user.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-xs capitalize text-white/50">{user.role.toLowerCase()}</p>
          </div>
          <button
            aria-label="Sign out"
            onClick={logout}
            className="rounded-lg p-2 text-white/60 hover:bg-white/10"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-64">
        <header className="flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/70 px-5 sm:px-10">
          <p className="text-xs font-medium text-slate-400">WORK BETTER, TOGETHER</p>
          <Notifications />
          <span className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Your team workspace
            <ArrowUpRight size={12} />
          </span>
        </header>
        <main className="mx-auto max-w-[1600px] p-5 sm:p-10">
          <Outlet />
        </main>
        <footer className="px-10 pb-6 text-xs text-slate-400">
          ShiftSync · Built for the people behind your business.
        </footer>
      </div>
    </div>
  );
}
