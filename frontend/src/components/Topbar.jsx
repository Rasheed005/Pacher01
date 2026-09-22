import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth, dashboardPath } from '../auth/AuthContext.jsx';
import Notifications from './Notifications.jsx';
import Logo from './Logo.jsx';

// Role-specific primary navigation.
const NAV = {
  student: [
    { to: '/student', label: 'Dashboard', end: true },
    { to: '/student/topic', label: 'Topic' },
    { to: '/student/chapters', label: 'Chapters' },
    { to: '/notifications', label: 'Notifications' },
  ],
  supervisor: [
    { to: '/supervisor', label: 'My Students', end: true },
    { to: '/notifications', label: 'Notifications' },
  ],
  admin: [
    { to: '/admin', label: 'Admin', end: true },
    { to: '/admin/users', label: 'Users' },
    { to: '/notifications', label: 'Notifications' },
  ],
};

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const links = NAV[user.role] || [];

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to={dashboardPath(user.role)} className="brand">
          <Logo size={26} />
          Pacher <span>· Research Tracking</span>
        </Link>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="user-box">
        <Notifications />
        <div className="who">
          <div>{user.name}</div>
          <div className="role">{user.role}</div>
        </div>
        <button type="button" className="btn secondary small" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
