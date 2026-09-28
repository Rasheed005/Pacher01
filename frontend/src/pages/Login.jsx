import { useState } from 'react';
import { useNavigate, Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth, dashboardPath } from '../auth/AuthContext.jsx';
import { authApi } from '../api/client.js';
import { Alert } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  // Banners from the email-verification click-through (?verified / ?verifyError)
  // and from the invite-accept / password-reset flows (?accepted / ?reset).
  const verified = params.get('verified') === '1';
  const verifyError = params.get('verifyError') === '1';
  const accepted = params.get('accepted') === '1';
  const reset = params.get('reset') === '1';

  // Already signed in? Skip the form.
  if (!loading && user) return <Navigate to={dashboardPath(user.role)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setResendMsg('');
    setBusy(true);
    try {
      const u = await login(email, password);
      navigate(dashboardPath(u.role), { replace: true });
    } catch (err) {
      // The server returns 403 { error: 'email_not_verified' } for unverified accounts.
      if (err.status === 403 && err.message === 'email_not_verified') {
        setUnverified(true);
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResendMsg('');
    try {
      await authApi.resend(email);
      setResendMsg('Verification email sent — please check your inbox.');
    } catch (err) {
      setResendMsg(err.message || 'Could not resend right now.');
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">
          <Logo size={54} />
          <h1>Pacher</h1>
          <p>Research Project Tracker</p>
        </div>
        <div className="card">
          <h2>Sign in</h2>
          {verified && <div className="alert success">Your email is verified. You can sign in now.</div>}
          {accepted && <div className="alert success">Your account is ready — sign in with the password you just set.</div>}
          {reset && <div className="alert success">Your password has been reset. Sign in with your new password.</div>}
          {verifyError && (
            <div className="alert error">That verification link is invalid or has expired. Sign in to resend it.</div>
          )}
          {unverified && (
            <div className="alert info">
              Your email isn&apos;t verified yet. Check your inbox for the link, or{' '}
              <button type="button" className="link" onClick={resend}>resend it</button>.
              {resendMsg && <div style={{ marginTop: 6 }}>{resendMsg}</div>}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <Alert>{error}</Alert>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <div className="hint" style={{ textAlign: 'right', marginTop: 6 }}>
                <Link to="/reset-password">Forgot password?</Link>
              </div>
            </div>
            <button type="submit" className="btn block" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="auth-switch">
            New student? <Link to="/register">Create an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
