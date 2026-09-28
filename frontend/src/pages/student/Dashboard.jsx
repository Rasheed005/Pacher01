import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Badge, SimBand, Matches, Reviews, Timeline, StageTracker, Alert } from '../../components/ui.jsx';
import { AnnouncementList } from '../../components/Announcements.jsx';

export default function StudentDashboard() {
  const [project, setProject] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/student/project')
      .then(({ project }) => setProject(project))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // Announcements are supplementary — a failure here must not blank the dashboard.
    api.get('/announcements')
      .then(({ announcements }) => setAnnouncements(announcements || []))
      .catch(() => {});
  }, []);

  if (loading) return <div className="center-load">Loading…</div>;

  const announcementsCard = (
    <div className="card">
      <h2>Announcements</h2>
      <AnnouncementList announcements={announcements} emptyText="No announcements right now." />
    </div>
  );

  // No project yet → prompt to submit a topic (announcements still shown).
  if (!project) {
    return (
      <>
        <h1 className="page-title">Welcome</h1>
        <p className="page-subtitle">You haven't submitted a research topic yet.</p>
        <div className="card">
          <Alert>{error}</Alert>
          <p>Get started by submitting your project topic for approval.</p>
          <Link to="/student/topic" className="btn">Submit a topic</Link>
        </div>
        {announcementsCard}
      </>
    );
  }

  const approvedChapters = project.chapters.filter((c) => c.status === 'approved').length;

  return (
    <>
      <div className="flex-between">
        <div>
          <h1 className="page-title">{project.title}</h1>
          <p className="page-subtitle">Supervisor: {project.supervisor?.name || '—'}</p>
        </div>
        <Badge status={project.stage} />
      </div>

      <StageTracker stage={project.stage} />

      {/* Timeline surfaced near the top so progress is visible at a glance. */}
      <div className="card">
        <h2>Activity timeline</h2>
        <Timeline timeline={project.timeline} />
      </div>

      {announcementsCard}

      <div className="card">
        <div className="flex-between">
          <h2>Topic</h2>
          <Badge status={project.topic.status} />
        </div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{project.abstract}</p>
        {project.similarity && <SimBand sim={project.similarity} />}
        {(project.topic.status === 'revision' || project.topic.status === 'rejected') && (
          <p style={{ marginTop: 12 }}>
            <Link to="/student/topic" className="btn secondary">Revise &amp; resubmit topic</Link>
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <Reviews reviews={project.topic.reviews} />
        </div>
      </div>

      {project.similarity?.matches?.length > 0 && (
        <div className="card"><Matches matches={project.similarity.matches} /></div>
      )}

      {project.topic.status === 'approved' && (
        <div className="card">
          <div className="flex-between">
            <h2>Chapters</h2>
            <Link to="/student/chapters" className="btn secondary small">Manage chapters</Link>
          </div>
          <p className="muted">{approvedChapters} of {project.chapters.length} chapters approved.</p>
        </div>
      )}

      {project.final.status === 'approved' && (
        <div className="alert success">🎉 Your final project has been approved. Congratulations!</div>
      )}
    </>
  );
}
