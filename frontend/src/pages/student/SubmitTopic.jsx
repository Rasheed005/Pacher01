import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { SimBand, Matches, Alert } from '../../components/ui.jsx';

export default function SubmitTopic() {
  const navigate = useNavigate();
  const [supervisors, setSupervisors] = useState([]);
  const [form, setForm] = useState({ title: '', abstract: '', supervisorId: '' });
  const [sim, setSim] = useState(null);
  // Content-bound proof that the current title+abstract were checked. Cleared
  // whenever the text changes, so a stale check can't be reused to submit.
  const [checkToken, setCheckToken] = useState(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/student/supervisors'), api.get('/student/project')])
      .then(([{ supervisors }, { project }]) => {
        setSupervisors(supervisors || []);
        if (project) {
          setForm({
            title: project.title || '',
            abstract: project.abstract || '',
            supervisorId: project.supervisor?._id || '',
          });
          // Show the stored band for context, but require a fresh check before
          // resubmitting (we have no token proving the stored text was checked).
          setSim(project.similarity || null);
          setApproved(project.topic.status === 'approved');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Editing the title/abstract invalidates any prior similarity check.
  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'title' || key === 'abstract') {
      setSim(null);
      setCheckToken(null);
    }
  };

  // Run S-BERT without saving so the student sees the warning band first.
  async function checkSimilarity() {
    setError('');
    setChecking(true);
    try {
      const { similarity, checkToken: token } = await api.post('/student/project/similarity-check', {
        title: form.title,
        abstract: form.abstract,
      });
      setSim(similarity);
      setCheckToken(token || null);
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message);
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { similarity } = await api.post('/student/project', { ...form, checkToken });
      setSim(similarity);
      navigate('/student', { replace: true });
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="center-load">Loading…</div>;

  if (approved) {
    return (
      <div className="card">
        <h2>Topic approved</h2>
        <p className="muted">Your topic is approved and locked. Head to Chapters to continue.</p>
      </div>
    );
  }

  // Gate: the student must run the similarity check for the current text before
  // submitting — unless the check came back unavailable (S-BERT down), which is a
  // permitted bypass.
  const checkUnavailable = sim?.status === 'unavailable';
  const hasValidCheck = checkToken != null || checkUnavailable;
  const canSubmit = !!form.supervisorId && hasValidCheck;

  return (
    <>
      <h1 className="page-title">Submit your topic</h1>
      <p className="page-subtitle">
        Run the similarity check before submitting. A high score may be flagged but never blocks you;
        if the check is unavailable you can submit without it.
      </p>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <Alert>{error}</Alert>
          <div className="field">
            <label>Project title</label>
            <input value={form.title} onChange={set('title')} maxLength={300} required />
          </div>
          <div className="field">
            <label>Abstract</label>
            <textarea
              value={form.abstract}
              onChange={set('abstract')}
              minLength={20}
              maxLength={5000}
              required
              placeholder="Describe your research (20–5000 characters)…"
            />
          </div>
          <div className="field">
            <label>Supervisor</label>
            <select value={form.supervisorId} onChange={set('supervisorId')} required>
              <option value="">— choose a supervisor —</option>
              {supervisors.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}{s.department ? ` · ${s.department}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn secondary"
              onClick={checkSimilarity}
              disabled={checking || !form.title || !form.abstract}
            >
              {checking ? 'Checking…' : 'Check similarity'}
            </button>
            <button type="submit" className="btn" disabled={saving || !canSubmit}>
              {saving ? 'Submitting…' : 'Submit topic'}
            </button>
          </div>
          {!hasValidCheck && (
            <p className="hint" style={{ marginTop: 10 }}>
              Run the similarity check to enable submitting.
            </p>
          )}
        </form>
        {sim && <div style={{ marginTop: 16 }}><SimBand sim={sim} /></div>}
      </div>
      {sim?.matches?.length > 0 && (
        <div className="card"><Matches matches={sim.matches} /></div>
      )}
    </>
  );
}
