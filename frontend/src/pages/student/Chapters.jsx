import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Badge, Reviews, SafeLink, Alert, fmtDate } from '../../components/ui.jsx';

// One chapter row with its own submit form. Local state so each card tracks its
// own link + busy/error independently. Mounted with key={chapter.number} by the
// wizard, so switching chapters resets this state cleanly.
function ChapterCard({ chapter, disabled, onSubmit }) {
  const [link, setLink] = useState(chapter.link || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const locked = chapter.status === 'approved';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await onSubmit(chapter.number, link.trim());
      setSuccess(`Chapter ${chapter.number} submitted successfully.`);
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  // Newest-first log of every link submitted for this chapter.
  const history = Array.isArray(chapter.linkHistory) ? [...chapter.linkHistory].reverse() : [];

  return (
    <div className="chapter">
      <div className="chapter-head">
        <div>
          <span className="chapter-num">Chapter {chapter.number}</span>
          <h3>{chapter.name}</h3>
        </div>
        <Badge status={chapter.status} />
      </div>

      {chapter.link && (
        <p className="muted">Current link: <SafeLink href={chapter.link} /></p>
      )}

      {disabled ? (
        <p className="locked">Approve your topic first to unlock chapters.</p>
      ) : locked ? (
        <p className="locked">This chapter is approved and locked.</p>
      ) : (
        <form onSubmit={submit}>
          {success && <Alert type="success">{success}</Alert>}
          <Alert>{error}</Alert>
          <div className="field">
            <label>Document link (Google Docs/Drive, http/https)</label>
            <input type="url" value={link} onChange={(e) => { setLink(e.target.value); setSuccess(''); }} placeholder="https://…" required />
          </div>
          <button type="submit" className="btn small" disabled={busy}>
            {busy ? 'Submitting…' : chapter.status === 'not_submitted' ? 'Submit chapter' : 'Resubmit chapter'}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <div className="link-history">
          <div className="link-history-head">Previous submissions</div>
          <ul>
            {history.map((h, i) => (
              <li key={i}>
                <SafeLink href={h.link} />
                <span className="meta"> · {fmtDate(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <Reviews reviews={chapter.reviews} heading="Feedback" />
      </div>
    </div>
  );
}

export default function Chapters() {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);

  useEffect(() => {
    api.get('/student/project')
      .then(({ project }) => setProject(project))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submitChapter(number, link) {
    const { project } = await api.put(`/student/project/chapters/${number}`, { link });
    setProject(project);
  }

  if (loading) return <div className="center-load">Loading…</div>;

  if (!project) {
    return (
      <div className="card">
        <Alert>{error}</Alert>
        <p>You need to submit a topic first.</p>
        <Link to="/student/topic" className="btn">Submit a topic</Link>
      </div>
    );
  }

  const topicApproved = project.topic.status === 'approved';
  const chapters = project.chapters;
  const current = chapters[step];
  const isFirst = step === 0;
  const isLast = step === chapters.length - 1;

  return (
    <>
      <h1 className="page-title">Chapters</h1>
      <p className="page-subtitle">
        {topicApproved
          ? 'Work through your chapters one at a time — submit a link, then click Next.'
          : 'Chapters unlock once your topic is approved.'}
      </p>
      {!topicApproved && (
        <div className="alert info">
          Your topic status is “{project.topic.status}”. Chapters are locked until it is approved.
        </div>
      )}

      {/* Step indicator — progress only; movement is via Back / Next. */}
      <div className="wizard-head">
        <span className="wizard-step-label">Chapter {current.number} of {chapters.length}</span>
        <div className="step-dots" aria-hidden="true">
          {chapters.map((c, i) => (
            <span
              key={c.number}
              className={'step-dot' + (i === step ? ' active' : '') + (c.status === 'approved' ? ' done' : '')}
              title={`Chapter ${c.number}: ${c.name}`}
            />
          ))}
        </div>
      </div>

      <ChapterCard key={current.number} chapter={current} disabled={!topicApproved} onSubmit={submitChapter} />

      {/* Linear Back / Next navigation. */}
      <div className="wizard-nav">
        <button type="button" className="btn secondary" disabled={isFirst} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          ← Back
        </button>
        <span className="muted">{current.name}</span>
        <button type="button" className="btn" disabled={isLast} onClick={() => setStep((s) => Math.min(chapters.length - 1, s + 1))}>
          Next →
        </button>
      </div>
    </>
  );
}
