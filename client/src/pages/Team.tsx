import { TeamBatch } from './TeamBatch';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, MapPin, Pencil, Trash2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Empty, initials, PageHeading, QueryState } from '../components';
import { Modal } from '../Modal';
import type { Location, User } from '../types';
export function Team() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const team = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<{ users: User[] }>('/users')).data.users,
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<{ locations: Location[] }>('/locations')).data.locations,
  });
  const [search, setSearch] = useState(''),
    [roleFilter, setRoleFilter] = useState(''),
    [locationFilter, setLocationFilter] = useState('');
  const shown = (team.data ?? []).filter(
    (p) =>
      (!search || (p.name + ' ' + p.email).toLowerCase().includes(search.toLowerCase())) &&
      (!roleFilter || p.role === roleFilter) &&
      (!locationFilter || p.locations?.some((l) => l.locationId === locationFilter)),
  );
  const [member, setMember] = useState<User | 'new' | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | 'new' | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['users'] });
    await cache.invalidateQueries({ queryKey: ['locations'] });
    await cache.invalidateQueries({ queryKey: ['shifts'] });
  };
  const deleteLocation = async (id: string) => {
    if (!window.confirm('Delete this location?')) return;
    try {
      await api.delete('/locations/' + id);
      await refresh();
      toast.success('Location removed.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <>
      <PageHeading
        title="People make it happen."
        description="Your team, their hours, and the places you work together."
        action={
          <button className="btn-primary" onClick={() => setMember('new')}>
            <Plus size={16} />
            Invite employee
          </button>
        }
      />
      {credentials && (
        <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="text-sm">Your employee’s sign-in details</h3>
          <p className="mt-2 break-all text-sm">
            {credentials.email}
            <br />
            <strong>{credentials.password}</strong>
          </p>
          <p className="mt-2 text-xs text-emerald-900/60">
            Share these directly with your employee. This password is shown once.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(credentials.email + '\n' + credentials.password)
                  .then(
                    () => toast.success('Copied.'),
                    () => toast.error('Please copy the details manually.'),
                  );
              }}
            >
              <Copy size={14} />
              Copy details
            </button>
            <button className="text-sm text-emerald-800" onClick={() => setCredentials(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <QueryState
        loading={team.isPending || locations.isPending}
        error={team.isError || locations.isError}
      />
      {team.data && locations.data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <label>
              Search team
              <input
                type="search"
                placeholder="Name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Role
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                {['OWNER', 'MANAGER', 'EMPLOYEE'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Location
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                <option value="">All locations</option>
                {locations.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <TeamBatch
              people={shown.filter(
                (p) => p.role !== 'OWNER' && (user?.role === 'OWNER' || p.role === 'EMPLOYEE'),
              )}
              locations={locations.data}
            />
          </div>
          {!shown.length && (
            <Empty title="No matching team members" description="Try another search or filter." />
          )}
          <section className="card mb-8 overflow-x-auto p-0">
            <div className="flex items-center gap-2 border-b border-slate-100 p-5">
              <Users size={18} className="text-emerald-700" />
              <h2 className="text-base">Your team</h2>
              <span className="badge bg-slate-100 text-slate-500">{team.data.length}</span>
            </div>
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  {['Team member', 'Role', 'Hourly rate', 'Weekly limit', ''].map((v, i) => (
                    <th className="px-5 py-3 font-semibold" key={i}>
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((person) => (
                  <tr className="border-t border-slate-100" key={person.id}>
                    <td className="flex items-center gap-3 px-5 py-4">
                      <span className="avatar">{initials(person.name)}</span>
                      <div>
                        <p className="font-semibold text-ink">
                          {person.name}
                          {person.active === false && (
                            <span className="ml-2 text-xs text-amber-700">Inactive</span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{person.email}</p>
                      </div>
                    </td>
                    <td className="px-5 capitalize">{person.role.toLowerCase()}</td>
                    <td className="px-5">{Number(person.hourlyRate).toFixed(2)}</td>
                    <td className="px-5">{person.maxWeeklyHours}h</td>
                    <td className="px-5">
                      {person.role !== 'OWNER' &&
                        (user?.role === 'OWNER' || person.role === 'EMPLOYEE') && (
                          <button
                            className="icon-btn"
                            aria-label={'Edit ' + person.name}
                            onClick={() => setMember(person)}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="mb-4 flex items-center justify-between">
            <h2>Your locations</h2>
            <button onClick={() => setEditingLocation('new')} className="btn-secondary">
              <Plus size={15} />
              Add location
            </button>
          </div>
          {locations.data.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {locations.data.map((location) => (
                <article className="card" key={location.id}>
                  <div className="flex items-start justify-between">
                    <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                      <MapPin size={20} />
                    </span>
                    <div>
                      <button
                        aria-label={'Edit ' + location.name}
                        className="icon-btn"
                        onClick={() => setEditingLocation(location)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        aria-label={'Delete ' + location.name}
                        className="icon-btn text-red-400"
                        onClick={() => void deleteLocation(location.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <h3 className="mt-4">{location.name}</h3>
                  <p className="mt-2 text-xs text-slate-400">{location.timezone}</p>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Give your team a place to work"
              description="Add your first location, then assign employees and build your roster."
            />
          )}
        </>
      )}
      {member && (
        <MemberModal
          person={member}
          locations={locations.data ?? []}
          owner={user?.role === 'OWNER'}
          onClose={() => setMember(null)}
          onSaved={async (result) => {
            if (result) setCredentials(result);
            setMember(null);
            await refresh();
          }}
        />
      )}
      {editingLocation && (
        <LocationModal
          location={editingLocation}
          onClose={() => setEditingLocation(null)}
          onSaved={async () => {
            setEditingLocation(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
function MemberModal({
  person,
  locations,
  owner,
  onClose,
  onSaved,
}: {
  person: User | 'new';
  locations: Location[];
  owner: boolean;
  onClose: () => void;
  onSaved: (credentials?: { email: string; password: string }) => Promise<void>;
}) {
  const existing = person === 'new' ? null : person;
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    const payload = {
      name: data.get('name'),
      hourlyRate: Number(data.get('hourlyRate')),
      maxWeeklyHours: Number(data.get('maxWeeklyHours')),
      locationIds: data.getAll('locationIds'),
      ...(existing ? (owner ? { role: data.get('role') } : {}) : { email: data.get('email') }),
    };
    try {
      const result = existing
        ? await api.put('/users/' + existing.id, payload)
        : await api.post('/users', payload);
      await onSaved(
        existing
          ? undefined
          : { email: result.data.user.email, password: result.data.tempPassword },
      );
      toast.success(existing ? 'Team member updated.' : 'Employee invited.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={existing ? 'Edit team member' : 'Welcome someone new'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label>
          Full name
          <input name="name" required maxLength={100} defaultValue={existing?.name} />
        </label>
        {!existing && (
          <label>
            Email address
            <input type="email" name="email" required maxLength={254} />
          </label>
        )}
        <div className="grid grid-cols-2 gap-4">
          <label>
            Hourly rate
            <input
              type="number"
              name="hourlyRate"
              required
              min={0}
              max={10000}
              step="0.01"
              defaultValue={existing?.hourlyRate ?? 15}
            />
          </label>
          <label>
            Weekly hours limit
            <input
              type="number"
              name="maxWeeklyHours"
              required
              min={0}
              max={168}
              step="0.5"
              defaultValue={existing?.maxWeeklyHours ?? 40}
            />
          </label>
        </div>
        {existing && owner && (
          <label>
            Role
            <select name="role" defaultValue={existing.role}>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Assigned locations</legend>
          {locations.length ? (
            locations.map((l) => (
              <label
                key={l.id}
                className="mb-2 flex items-center gap-2 rounded-lg border border-slate-100 p-3"
              >
                <input
                  name="locationIds"
                  type="checkbox"
                  value={l.id}
                  defaultChecked={
                    existing
                      ? existing.locations?.some((m) => m.locationId === l.id)
                      : locations.length === 1
                  }
                />
                {l.name}
              </label>
            ))
          ) : (
            <p className="text-xs text-slate-400">
              Add a location to assign this employee to a roster.
            </p>
          )}
        </fieldset>
        <p className="text-xs leading-relaxed text-slate-400">
          {existing
            ? 'Changes apply to future conflict checks.'
            : 'We’ll generate a temporary password for you to share directly. No email is sent.'}
        </p>
        <div className="flex justify-end gap-3 pt-3">
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Create employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function LocationModal({
  location,
  onClose,
  onSaved,
}: {
  location: Location | 'new';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const existing = location === 'new' ? null : location;
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    const body = { name: data.get('name'), timezone: data.get('timezone') };
    try {
      if (existing)
        await api.put('/locations/' + existing.id, {
          ...existing,
          ...body,
          id: undefined,
          organizationId: undefined,
        });
      else await api.post('/locations', body);
      await onSaved();
      toast.success('Location saved.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={existing ? 'Edit location' : 'A place for your team'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <label>
          Location name
          <input name="name" required maxLength={100} defaultValue={existing?.name} />
        </label>
        <label>
          Timezone
          <input
            name="timezone"
            required
            defaultValue={existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
          />
        </label>
        <p className="text-xs text-slate-400">
          Use an IANA timezone, such as Asia/Karachi or America/New_York. Availability and weekly
          boundaries follow this timezone.
        </p>
        <button disabled={busy} className="btn-primary w-full">
          {busy ? 'Saving…' : 'Save location'}
        </button>
      </form>
    </Modal>
  );
}
