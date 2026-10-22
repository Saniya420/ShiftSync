import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import type { Role, User } from './types';
const AuthContext = createContext<{ user: User | null; loading: boolean; failed: boolean }>({
  user: null,
  loading: true,
  failed: false,
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<{ user: User }>('/auth/me')).data.user,
    retry: false,
    staleTime: 60000,
  });
  const failed =
    session.isError &&
    !(
      typeof session.error === 'object' &&
      session.error &&
      'response' in session.error &&
      (session.error.response as { status?: number })?.status === 401
    );
  return (
    <AuthContext.Provider
      value={{
        user: session.isError ? null : (session.data ?? null),
        loading: session.isPending,
        failed,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading, failed } = useAuth();
  const location = useLocation();
  if (loading) return <div className="screen-message">Getting your workspace ready…</div>;
  if (failed)
    return (
      <div className="screen-message">
        We couldn’t reach your workspace.{' '}
        <button onClick={() => window.location.reload()} className="btn-secondary">
          Try again
        </button>
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
