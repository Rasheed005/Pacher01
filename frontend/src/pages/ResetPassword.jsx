import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/client.js';
import { Alert } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

// Public page with two modes:
//   - no ?token → request a reset link by email (always succeeds, no enumeration).
//   - ?token=… → choose a new password, then bounce to /login?reset=1.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestReset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.requestReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send a reset link right now.');
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message || 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">
          <Logo size={54} />
          <h1>Pacher</h1>
          <p>Reset your password</p>
        </div>
        <div className="card">
          {token ? (
            <>
              <h2>Choose a new password</h2>
              <form onSubmit={setNewPassword}>
                <Alert>{error}</Alert>
                <div className="field">
                  <label>New password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
                  <div className="hint">At least 8 characters.</div>
                </div>
                <div className="field">
                  <label>Confirm new password</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
                </div>
                <button type="submit" className="btn block" disabled={busy}>
                  {busy ? 'Saving…' : 'Save new password'}
                </button>
              </form>
            </>
          ) : sent ? (
            <>
              <h2>Check your inbox</h2>
              <div className="alert success">
                If an account exists for <strong>{email}</strong>, a password-reset link is on its way.
              </div>
              <p className="muted">The link expires in 24 hours.</p>
            </>
          ) : (
            <>
              <h2>Forgot your password?</h2>
              <p className="muted">Enter your account email to receive a reset link.</p>
              <form onSubmit={requestReset}>
                <Alert>{error}</Alert>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <button type="submit" className="btn block" disabled={busy}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
        <div className="auth-switch">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
