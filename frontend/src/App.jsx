import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, dashboardPath } from './auth/AuthContext.jsx';
import ProtectedLayout from './components/ProtectedLayout.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import NotificationsPage from './pages/Notifications.jsx';
import StudentDashboard from './pages/student/Dashboard.jsx';
import SubmitTopic from './pages/student/SubmitTopic.jsx';
import Chapters from './pages/student/Chapters.jsx';
import SupervisorDashboard from './pages/supervisor/Dashboard.jsx';
import ProjectReview from './pages/supervisor/ProjectReview.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminUsers from './pages/admin/Users.jsx';

// Sends "/" to the right place depending on who is logged in.
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-load">Loading…</div>;
  return <Navigate to={user ? dashboardPath(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Any authenticated user (shared across roles) */}
      <Route element={<ProtectedLayout />}>
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      {/* Student area */}
      <Route element={<ProtectedLayout role="student" />}>
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/topic" element={<SubmitTopic />} />
        <Route path="/student/chapters" element={<Chapters />} />
      </Route>

      {/* Supervisor area */}
      <Route element={<ProtectedLayout role="supervisor" />}>
        <Route path="/supervisor" element={<SupervisorDashboard />} />
        <Route path="/supervisor/project/:id" element={<ProjectReview />} />
      </Route>

      {/* Admin area */}
      <Route element={<ProtectedLayout role="admin" />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
