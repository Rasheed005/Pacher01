import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Badge, SimBand, Matches, Reviews, Timeline, StageTracker, SafeLink, Alert, fmtDate } from '../../components/ui.jsx';
import ReviewForm from '../../components/ReviewForm.jsx';

export default function ProjectReview() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { project } = await api.get(`/supervisor/projects/${id}`);
      setProject(project);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // Each review returns the fully-populated project, so we just swap it in.
  async function reviewTopic(payload) {
    const { project } = await api.post(`/supervisor/projects/${id}/topic`, payload);
    setProject(project);
  }
  async function reviewChapter(number, payload) {
    const { project } = await api.post(`/supervisor/projects/${id}/chapters/${number}`, payload);
    setProject(project);
  }
  async function reviewFinal(payload) {
    const { project } = await api.post(`/supervisor/projects/${id}/final`, payload);
    setProject(project);
  }

  if (loading) return <div className="center-load">Loading…</div>;

  if (!project) {
    return (
      <div className="card">
        <Alert>{error || 'Project not available.'}</Alert>
        <Link to="/supervisor" className="btn secondary">Back to my students</Link>
      </div>
    );
  }

  const topicApproved = project.topic.status === 'approved';
  const allChaptersApproved = project.chapters.length > 0 && project.chapters.every((c) => c.status === 'approved');

  return (
    <>
      <p><Link to="/supervisor" className="link">← My students</Link></p>
      <div className="flex-between">
        <div>
          <h1 className="page-title">{project.title}</h1>
          <p className="page-subtitle">
            {project.student?.name}
            {project.student?.matricNumber ? ` · ${project.student.matricNumber}` : ''}
          </p>
        </div>
        <Badge status={project.stage} />
      </div>

      <StageTracker stage={project.stage} />

      {/* Topic review */}
      <div className="card">
        <div className="flex-between"><h2>Topic</h2><Badge status={project.topic.status} /></div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{project.abstract}</p>
        {project.similarity && <SimBand sim={project.similarity} />}
        {project.similarity?.matches?.length > 0 && (
          <div style={{ marginTop: 12 }}><Matches matches={project.similarity.matches} /></div>
        )}
        <Reviews reviews={project.topic.reviews} />
        <ReviewForm decisions={['approved', 'rejected', 'revision', 'note']} onSubmit={reviewTopic} label="Submit topic review" />
      </div>

      {/* Chapter reviews */}
      <div className="card">
        <h2>Chapters</h2>
        {!topicApproved && <p className="muted">Approve the topic to begin reviewing chapters.</p>}
        {topicApproved && project.chapters.map((c) => (
          <div className="chapter" key={c.number}>
            <div className="chapter-head">
              <div>
                <span className="chapter-num">Chapter {c.number}</span>
                <h3>{c.name}</h3>
              </div>
              <Badge status={c.status} />
            </div>
            {c.link ? (
              <p className="muted">Link: <SafeLink href={c.link} /></p>
            ) : (
              <p className="locked">Not submitted yet.</p>
            )}
            {c.linkHistory?.length > 0 && (
              <div className="link-history">
                <div className="link-history-head">Submission history</div>
                <ul>
                  {[...c.linkHistory].reverse().map((h, i) => (
                    <li key={i}>
                      <SafeLink href={h.link} />
                      <span className="meta"> · {fmtDate(h.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Reviews reviews={c.reviews} heading="Comment history" />
            {c.status !== 'not_submitted' && (
              <ReviewForm
                decisions={['approved', 'revision', 'note']}
                onSubmit={(p) => reviewChapter(c.number, p)}
                label={`Review chapter ${c.number}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Final review */}
      <div className="card">
        <div className="flex-between"><h2>Final approval</h2><Badge status={project.final.status} /></div>
        {!allChaptersApproved && <p className="muted">All 5 chapters must be approved before final approval.</p>}
        <Reviews reviews={project.final.reviews} />
        <ReviewForm decisions={['approved', 'revision', 'note']} onSubmit={reviewFinal} label="Submit final review" />
      </div>

      <div className="card">
        <h2>Activity timeline</h2>
        <Timeline timeline={project.timeline} />
      </div>
    </>
  );
}
