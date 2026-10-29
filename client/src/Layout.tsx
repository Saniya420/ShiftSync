import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  CalendarOff,
  Clock3,
  Inbox,
  LogOut,
  Menu,
  Receipt,
  Repeat2,
  Sun,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, errorMessage } from './api';
import { useAuth } from './auth';
import { initials } from './components';
import toast from 'react-hot-toast';
import { Notifications } from './Notifications';
import { usePendingWork } from './pending';

interface Link {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
}
export function Layout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const manager = user?.role !== 'EMPLOYEE';
  const pending = usePendingWork(Boolean(user) && manager);
  if (!user) return null;
  const requestCount = pending.timeOff.length + pending.swaps.length;
  const groups: { title: string; links: Link[] }[] = manager
    ? [
        { title: 'Today', links: [{ to: '/app', label: 'Overview', icon: Sun, end: true }] },
        {
          title: 'Plan',
          links: [
            { to: '/app/roster', label: 'Roster builder', icon: CalendarDays },
            { to: '/app/team', label: 'Team', icon: Users },
          ],
        },
        {
          title: 'Decide',
          links: [{ to: '/app/requests', label: 'Requests', icon: Inbox, count: requestCount }],
        },
        {
          title: 'Run',
          links: [
            { to: '/app/attendance', label: 'Attendance', icon: Clock3 },
            { to: '/app/timesheets', label: 'Timesheets', icon: Receipt },
            { to: '/app/admin', label: 'Admin', icon: BarChart3 },
          ],
        },
        {
          title: 'You',
          links: [
            { to: '/app/availability', label: 'Availability', icon: CalendarCheck2 },
            { to: '/app/time-off', label: 'Time off', icon: CalendarOff },
            { to: '/app/profile', label: 'Profile', icon: UserRound },
          ],
        },
      ]
    : [
        {
          title: 'Work',
          links: [
            { to: '/app', label: 'Today', icon: Sun, end: true },
            { to: '/app/schedule', label: 'My schedule', icon: CalendarDays },
            {
              to: '/app/open-shifts',
              label: 'Open shifts',
              icon: Repeat2,
              count: pending.swaps.filter((s) => s.requesterId !== user.id).length,
            },
          ],
        },
        {
          title: 'You',
          links: [
            { to: '/app/availability', label: 'Availability', icon: CalendarCheck2 },
            { to: '/app/time-off', label: 'Time off', icon: CalendarOff },
            { to: '/app/profile', label: 'Profile', icon: UserRound },
          ],
        },
      ];
  const all = groups.flatMap((g) => g.links);
  const tabs = (
    manager
      ? ['/app', '/app/roster', '/app/requests', '/app/attendance']
      : ['/app', '/app/schedule', '/app/open-shifts', '/app/time-off']
  ).map((to) => all.find((l) => l.to === to)!);
  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
      // Keep the ['me'] query attached to AuthProvider (see AuthPages) and mark it signed out.
      cache.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      cache.setQueryData(['me'], null);
      toast.success('Signed out.');
      navigate('/login');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const count = (n?: number, inverse = false) =>
    n ? (
      <span
        className={
          'num ml-auto min-w-6 rounded-sm px-1.5 text-center text-[11px] leading-5 font-semibold ' +
          (inverse ? 'bg-white text-ink' : 'bg-red-600 text-white')
        }
        aria-label={n + ' waiting'}
      >
        {n}
      </span>
    ) : null;
  return (
    <div className="min-h-screen pb-20 lg:flex lg:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 z-30 flex flex-col bg-ink text-white lg:fixed lg:inset-y-0 lg:w-60">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:pt-6 lg:pb-5">
          <NavLink
            to="/app"
            className="flex items-baseline gap-2 text-xl font-extrabold tracking-[-0.02em]"
            style={{ fontStretch: '87.5%' }}
          >
            ShiftSync
          </NavLink>
          <span className="hidden min-w-0 truncate text-xs text-slate-300 sm:inline lg:hidden">
            {user.organization?.name}
          </span>
          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <Notifications compact />
            <button
              className="rounded-md p-2 text-white hover:bg-white/10"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <p className="hidden truncate border-y border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-200 lg:block">
          {user.organization?.name ?? 'Your organization'}
        </p>
        <nav
          id="workspace-navigation"
          aria-label="Main navigation"
          className={
            (menuOpen ? 'flex' : 'hidden') +
            ' max-h-[calc(100dvh-56px)] flex-col gap-4 overflow-y-auto px-3 pt-2 pb-4 lg:flex lg:max-h-none lg:flex-1 lg:pt-4'
          }
        >
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1 text-xs font-medium text-slate-300">{group.title}</p>
              {group.links.map(({ to, label, icon: Icon, end, count: n }) => (
                <NavLink
                  onClick={() => setMenuOpen(false)}
                  end={end}
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition ' +
                    (isActive
                      ? 'bg-white text-ink'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={17} aria-hidden="true" />
                      {label}
                      {count(n, isActive)}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-2 pt-4">
            <span className="avatar h-9 w-9 bg-white/15 text-white">{initials(user.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-xs text-slate-300 capitalize">{user.role.toLowerCase()}</p>
            </div>
            <button
              aria-label="Sign out"
              onClick={logout}
              className="rounded-md p-2 text-slate-200 hover:bg-white/10"
            >
              <LogOut size={17} />
            </button>
          </div>
        </nav>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-60">
        <div className="hidden justify-end px-10 pt-6 lg:flex">
          <Notifications />
        </div>
        <main id="main" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8 lg:px-10 lg:pt-2">
          {user.mustChangePassword && (
            <p className="card mb-5 border-amber-300 bg-amber-50 text-amber-900" role="alert">
              Change your temporary password on the{' '}
              <NavLink to="/app/profile" className="font-semibold underline">
                Profile page
              </NavLink>{' '}
              to continue.
            </p>
          )}
          <Outlet />
        </main>
      </div>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {tabs.map(({ to, label, icon: Icon, end, count: n }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              'relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ' +
              (isActive ? 'text-ink' : 'text-slate-500')
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={
                    'rounded-md px-3 py-1 ' + (isActive ? 'bg-ink text-white' : 'text-slate-500')
                  }
                >
                  <Icon size={19} aria-hidden="true" />
                </span>
                {label === 'Roster builder' ? 'Roster' : label}
                {n ? (
                  <span className="num absolute top-1 left-1/2 ml-3 min-w-4 rounded-sm bg-red-600 px-1 text-[11px] leading-4 text-white">
                    {n}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
