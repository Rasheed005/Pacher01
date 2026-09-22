import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import { Badge, Alert, fmtDate } from '../../components/ui.jsx';
import { AnnouncementForm, AnnouncementList } from '../../components/Announcements.jsx';

function StatCard({ num, label }) {
  return (
    <div className="card stat">
      <div className="num">{num}</div>
      <div className="label">{label}</div>
    </div>
  );
}

// Simple horizontal bar chart from a { key: count } map.
function Bars({ data }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div>
      {Object.entries(data).map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="bar-label">{k}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="bar-num">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [system, setSystem] = useState(null);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [invitations, setInvitations] = useState([]);

  const refreshMeta = useCallback(async () => {
    const [sys, rep] = await Promise.all([api.get('/admin/system'), api.get('/admin/reports')]);
    setSystem(sys);
    setReports(rep);
  }, []);

  const loadAnnouncements = useCallback(async () => {
    const { announcements } = await api.get('/announcements');
    setAnnouncements(announcements || []);
  }, []);

  const loadInvitations = useCallback(async () => {
    const { invitations } = await api.get('/admin/invitations');
    setInvitations(invitations || []);
  }, []);

  // Initial load.
  useEffect(() => {
    Promise.all([refreshMeta(), loadAnnouncements(), loadInvitations()])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [refreshMeta, loadAnnouncements, loadInvitations]);

  // ---- Invite a supervisor ----
  // Supervisors are onboarded via a pending Invitation; a real User row is only
  // created when they accept the emailed link and set their own password.
  const [invite, setInvite] = useState({ name: '', email: '', department: '' });
  const [inviting, setInviting] = useState(false);

  async function sendInvite(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setInviting(true);
    try {
      await api.post('/admin/invitations', invite);
      setNotice(`Invitation sent to ${invite.email}.`);
      setInvite({ name: '', email: '', department: '' });
      await loadInvitations();
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message);
    } finally {
      setInviting(false);
    }
  }

  async function resendInvite(id) {
    setError('');
    setNotice('');
    try {
      await api.post(`/admin/invitations/${id}/resend`);
      setNotice('Invitation re-sent.');
      await loadInvitations();
    } catch (err) {
      setError(err.message);
    }
  }

  async function revokeInvite(id) {
    setError('');
    setNotice('');
    try {
      await api.del(`/admin/invitations/${id}`);
      setNotice('Invitation revoked.');
      await loadInvitations();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="center-load">Loading…</div>;

  return (
    <>
      <h1 className="page-title">Administration</h1>
      <p className="page-subtitle">Invite supervisors, post announcements, and monitor the system. Manage individual users on the <strong>Users</strong> page.</p>
      <Alert>{error}</Alert>
      {notice && <div className="alert success">{notice}</div>}

      {/* System monitoring */}
      {system && (
        <>
          <div className="grid-stats">
            <StatCard num={system.counts.students} label="Students" />
            <StatCard num={system.counts.supervisors} label="Supervisors" />
            <StatCard num={system.counts.projects} label="Projects" />
            <div className="card stat">
              <div className="num">
                <span className={system.sbert?.status === 'ok' ? 'dot-ok' : 'dot-down'}>●</span>
              </div>
              <div className="label">S-BERT {system.sbert?.status === 'ok' ? 'online' : 'offline'}</div>
            </div>
          </div>
          <p className="muted">
            Thresholds — high ≥ {system.thresholds?.high}, moderate ≥ {system.thresholds?.moderate}.
            {system.sbert?.model ? ` Model: ${system.sbert.model}.` : ''}
          </p>
        </>
      )}

      {/* Invite a supervisor */}
      <div className="card">
        <h2>Invite a supervisor</h2>
        <p className="muted">
          Supervisors join by invitation. They receive an email link to set their own password —
          no account exists until they accept.
        </p>
        <form onSubmit={sendInvite}>
          <div className="row">
            <div className="field"><label>Email</label><input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></div>
            <div className="field"><label>Name <span className="muted">(optional)</span></label><input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Department <span className="muted">(optional)</span></label><input value={invite.department} onChange={(e) => setInvite({ ...invite, department: e.target.value })} /></div>
            <div className="field" />
          </div>
          <button type="submit" className="btn" disabled={inviting}>{inviting ? 'Sending…' : 'Send invitation'}</button>
        </form>

        <h3 style={{ marginTop: 20 }}>Pending &amp; past invitations</h3>
        {invitations.length === 0 ? (
          <p className="muted">No invitations yet.</p>
        ) : (
          <div className="table-wrap"><table className="data">
            <thead>
              <tr><th>Email</th><th>Name</th><th>Status</th><th>Invited</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv._id}>
                  <td>{inv.email}</td>
                  <td>{inv.name || '—'}</td>
                  <td><Badge status={inv.status} /></td>
                  <td>{fmtDate(inv.createdAt)}</td>
                  <td>
                    {inv.status === 'pending' ? (
                      <div className="row-actions">
                        <button className="btn secondary small" onClick={() => resendInvite(inv._id)}>Resend</button>
                        <button className="btn danger small" onClick={() => revokeInvite(inv._id)}>Revoke</button>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Announcements — admins post globally to every student */}
      <div className="card">
        <h2>Announcements</h2>
        <p className="muted">Posted to <strong>all students</strong> across the system.</p>
        <AnnouncementForm
          scopeLabel="This announcement is visible to every student."
          onPosted={(a) => setAnnouncements((list) => [a, ...list])}
        />
        <div style={{ marginTop: 18 }}>
          <AnnouncementList
            announcements={announcements}
            emptyText="No announcements posted yet."
            canDelete={() => true}
            onDeleted={(id) => setAnnouncements((list) => list.filter((x) => x._id !== id))}
          />
        </div>
      </div>

      {/* Reports */}
      {reports && (
        <div className="row">
          <div className="card">
            <h2>Projects by stage</h2>
            <Bars data={reports.projects.byStage} />
            <h3 style={{ marginTop: 16 }}>Topic status</h3>
            <Bars data={reports.projects.byTopicStatus} />
          </div>
          <div className="card">
            <h2>Supervisor workload</h2>
            {reports.supervisorLoad.length === 0 ? (
              <p className="muted">No assignments yet.</p>
            ) : (
              <div className="table-wrap"><table className="data">
                <thead><tr><th>Supervisor</th><th>Projects</th><th>Completed</th></tr></thead>
                <tbody>
                  {reports.supervisorLoad.map((s, i) => (
                    <tr key={i}><td>{s.name}</td><td>{s.total}</td><td>{s.completed}</td></tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
