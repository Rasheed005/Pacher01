import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, dashboardPath } from '../auth/AuthContext.jsx';
import { authApi } from '../api/client.js';
import { Alert } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

// Public self-registration — students only (the server forces role 'student').
// On success no session is created: the student must verify their email first.
export default function Register() {
  const { user, loading, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '', matricNumber: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(''); // email a verification link was sent to
  const [resendMsg, setResendMsg] = useState('');

  if (!loading && user) return <Navigate to={dashboardPath(user.role)} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await register(form);
      setSentTo(res.email || form.email);
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResendMsg('');
    try {
      await authApi.resend(sentTo);
      setResendMsg('Verification email sent again — please check your inbox.');
    } catch (err) {
      setResendMsg(err.message || 'Could not resend right now.');
    }
  }

  // After a successful registration: show the "verify your email" panel.
  if (sentTo) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="logo">
            <Logo size={54} />
            <h1>Pacher</h1>
            <p>Verify your email</p>
          </div>
          <div className="card">
            <h2>Almost there</h2>
            <div className="alert success">
              We sent a verification link to <strong>{sentTo}</strong>. Click it to activate your
              account, then sign in.
            </div>
            <p className="muted">The link expires in 24 hours. Didn&apos;t get it?</p>
            <button type="button" className="btn secondary block" onClick={resend}>
              Resend verification email
            </button>
            {resendMsg && <p className="hint" style={{ marginTop: 10 }}>{resendMsg}</p>}
          </div>
          <div className="auth-switch">
            Already verified? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">
          <Logo size={54} />
          <h1>Pacher</h1>
          <p>Create your student account</p>
        </div>
        <div className="card">
          <h2>Register</h2>
          <form onSubmit={handleSubmit}>
            <Alert>{error}</Alert>
            <div className="field">
              <label>Full name</label>
              <input value={form.name} onChange={set('name')} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
              <div className="hint">At least 8 characters.</div>
            </div>
            <div className="field">
              <label>Department <span className="muted">(option)</span></label>
              <input value={form.department} onChange={set('department')} required />
            </div>
            <div className="field">
              <label>Matric number</label>
              <input value={form.matricNumber} onChange={set('matricNumber')} required />
            </div>
            <button type="submit" className="btn block" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
          <div className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
