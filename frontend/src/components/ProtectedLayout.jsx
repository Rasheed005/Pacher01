import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, dashboardPath } from '../auth/AuthContext.jsx';
import Topbar from './Topbar.jsx';

// Route guard + chrome for the authenticated app. While the session is being
// resolved we show a loader (avoids a flash of the login page on refresh). An
// unauthenticated visitor is bounced to /login; a wrong-role visitor is sent to
// their own dashboard. The actual authorization is still enforced server-side —
// this is only UX.
export default function ProtectedLayout({ role }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="center-load">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={dashboardPath(user.role)} replace />;

  return (
    <>
      <Topbar />
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
