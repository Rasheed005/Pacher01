import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Badge, pct, Alert, Timeline } from '../../components/ui.jsx';
import { AnnouncementForm, AnnouncementList } from '../../components/Announcements.jsx';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/supervisor/students')
      .then(({ students }) => setStudents(students || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // Activity + announcements are convenience panels — never block the page.
    api.get('/supervisor/activity')
      .then(({ activity }) => setActivity(activity || []))
      .catch(() => {});
    api.get('/announcements')
      .then(({ announcements }) => setAnnouncements(announcements || []))
      .catch(() => {});
  }, []);

  if (loading) return <div className="center-load">Loading…</div>;

  // A supervisor may only delete their own posts (the server enforces this too).
  const canDelete = (a) => a.author === user?._id;

  // Client-side matric/name search — the list is already scoped to this supervisor.
  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter(
        (s) =>
          (s.student?.matricNumber || '').toLowerCase().includes(q) ||
          (s.student?.name || '').toLowerCase().includes(q)
      )
    : students;

  const count = students.length;

  return (
    <>
      {/* Welcome banner with the assigned-student count */}
      <div className="welcome-banner">
        <div>
          <h1 className="page-title">Welcome, {user?.name || 'Supervisor'}</h1>
          <p className="page-subtitle">
            {count === 0
              ? 'No students have been assigned to you yet.'
              : `${count} student${count === 1 ? ' has' : 's have'} been assigned to you.`}
          </p>
        </div>
        <div className="welcome-stat">
          <div className="num">{count}</div>
          <div className="label">Assigned students</div>
        </div>
      </div>

      <Alert>{error}</Alert>

      {count === 0 ? (
        <div className="card empty">No students are assigned to you yet.</div>
      ) : (
        <div className="card">
          <div className="flex-between">
            <h2>My students</h2>
            <input
              type="search"
              className="search-box"
              placeholder="Search by matric number or name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 260 }}
            />
          </div>
          {filtered.length === 0 ? (
            <p className="muted">No students match “{query}”.</p>
          ) : (
            <div className="table-wrap"><table className="data">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Title</th>
                  <th>Stage</th>
                  <th>Topic</th>
                  <th>Chapters</th>
                  <th>Similarity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.projectId}>
                    <td>
                      {s.student?.name}
                      {s.student?.matricNumber && <div className="muted">{s.student.matricNumber}</div>}
                      {s.needsReview && <div className="needs-review">Needs review</div>}
                    </td>
                    <td>{s.title}</td>
                    <td><Badge status={s.stage} /></td>
                    <td><Badge status={s.topicStatus} /></td>
                    <td>
                      {s.chaptersApproved}/5
                      {s.chaptersSubmitted ? <span className="muted"> ({s.chaptersSubmitted} new)</span> : ''}
                    </td>
                    <td>
                      {s.similarity.topScore == null ? (
                        <span className="sim-pill unavailable">n/a</span>
                      ) : (
                        <span className={'sim-pill ' + (s.similarity.warningLevel || 'low')}>
                          {pct(s.similarity.topScore)}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link to={`/supervisor/project/${s.projectId}`} className="btn secondary small">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {/* Cross-student activity timeline (scoped to this supervisor server-side) */}
      <div className="card">
        <h2>Recent activity</h2>
        <Timeline timeline={activity} />
      </div>

      {/* Announcements to this supervisor's own students only */}
      <div className="card">
        <h2>Announcements</h2>
        <p className="muted">Only <strong>your</strong> assigned students will see what you post here.</p>
        <AnnouncementForm
          scopeLabel="Visible only to students you supervise."
          onPosted={(a) => setAnnouncements((list) => [a, ...list])}
        />
        <div style={{ marginTop: 18 }}>
          <AnnouncementList
            announcements={announcements}
            emptyText="No announcements yet."
            canDelete={canDelete}
            onDeleted={(id) => setAnnouncements((list) => list.filter((x) => x._id !== id))}
          />
        </div>
      </div>
    </>
  );
}
