import { useState } from 'react';
import { Alert } from './ui.jsx';

// Human labels for each decision the server accepts.
const LABELS = {
  approved: 'Approve',
  rejected: 'Reject',
  revision: 'Request revision',
  note: 'Comment only (no status change)',
};

// Reusable review box for topic / chapter / final. The server requires a
// non-empty comment on *every* review (append-only history), so we enforce that
// here too. `decisions` is the allowed set for this context.
export default function ReviewForm({ decisions, onSubmit, label = 'Submit review' }) {
  const [decision, setDecision] = useState(decisions[0]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!comment.trim()) {
      setError('A comment is required for every review.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ decision, comment: comment.trim() });
      setComment('');
      setDecision(decisions[0]);
    } catch (err) {
      setError(err.message || 'Could not submit the review.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <Alert>{error}</Alert>
      <div className="field">
        <label>Decision</label>
        <select value={decision} onChange={(e) => setDecision(e.target.value)} disabled={busy}>
          {decisions.map((d) => (
            <option key={d} value={d}>{LABELS[d] || d}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={4000}
          placeholder="Feedback for the student…"
          disabled={busy}
        />
      </div>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Submitting…' : label}
      </button>
    </form>
  );
}
