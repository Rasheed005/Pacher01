import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/client.js';
import { Alert } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

// Public page for a supervisor to accept an admin invitation and set a password.
// The real User is created server-side on submit (role/email come from the invite).
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This invitation link is missing its token.');
      setLoading(false);
      return;
    }
    authApi.getInvitation(token)
      .then(({ invitation }) => {
        setInvitation(invitation);
        setName(invitation.name || '');
      })
      .catch((err) => setLoadError(err.message || 'This invitation is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authApi.acceptInvite(token, password, name.trim());
      navigate('/login?accepted=1', { replace: true });
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message || 'Could not complete registration.');
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
          <p>Accept your invitation</p>
        </div>
        <div className="card">
          {loading ? (
            <p className="muted">Checking your invitation…</p>
          ) : loadError ? (
            <>
              <div className="alert error">{loadError}</div>
              <p className="muted">Ask your administrator to send a new invitation.</p>
            </>
          ) : (
            <>
              <h2>Set up your account</h2>
              <p className="muted">
                Invitation for <strong>{invitation.email}</strong> · role: {invitation.role}.
              </p>
              <form onSubmit={handleSubmit}>
                <Alert>{error}</Alert>
                <div className="field">
                  <label>Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
                  <div className="hint">At least 8 characters.</div>
                </div>
                <div className="field">
                  <label>Confirm password</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
                </div>
                <button type="submit" className="btn block" disabled={busy}>
                  {busy ? 'Activating…' : 'Activate account'}
                </button>
              </form>
            </>
          )}
        </div>
        <div className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
