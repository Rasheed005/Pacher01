import { useState } from 'react';
import { fmtDate, Alert } from './ui.jsx';
import { api } from '../api/client.js';

// Read-only list of announcements (used on every dashboard).
//   canDelete(a) — optional predicate deciding whether to show a Delete control
//   onDeleted(id) — optional callback after a successful delete
export function AnnouncementList({ announcements, emptyText = 'No announcements yet.', canDelete, onDeleted }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  if (!announcements || announcements.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }

  async function remove(id) {
    setError('');
    setBusyId(id);
    try {
      await api.del('/announcements/' + id);
      if (onDeleted) onDeleted(id);
    } catch (err) {
      setError(err.message || 'Could not delete');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="announce-list">
      <Alert>{error}</Alert>
      {announcements.map((a) => (
        <div className="announce" key={a._id}>
          <div className="announce-head">
            <strong>{a.title}</strong>
            {a.scope === 'global' && <span className="announce-tag">All students</span>}
          </div>
          <div className="announce-body">{a.body}</div>
          <div className="announce-meta">
            <span>{a.authorName} · {fmtDate(a.createdAt)}</span>
            {canDelete && canDelete(a) && (
              <button type="button" className="link" onClick={() => remove(a._id)} disabled={busyId === a._id}>
                {busyId === a._id ? 'Removing…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Authoring form for admins (posts global) and supervisors (posts to their students).
// The server derives scope/audience from the author's role — this form only sends
// title + body. onPosted(announcement) is called after a successful post.
export function AnnouncementForm({ onPosted, scopeLabel }) {
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { announcement } = await api.post('/announcements', form);
      setForm({ title: '', body: '' });
      if (onPosted) onPosted(announcement);
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Alert>{error}</Alert>
      <div className="field">
        <label>Title</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} required />
      </div>
      <div className="field">
        <label>Message</label>
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          maxLength={2000}
          required
          placeholder="Write an announcement…"
        />
      </div>
      {scopeLabel && <p className="hint">{scopeLabel}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? 'Posting…' : 'Post announcement'}</button>
    </form>
  );
}
