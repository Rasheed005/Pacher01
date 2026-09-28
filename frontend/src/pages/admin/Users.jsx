import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../api/client.js';
import { Badge, Alert } from '../../components/ui.jsx';

// Dedicated admin Users page: server-side name/email search, per-row management
// (reassign supervisor / activate-deactivate), and bulk assignment of many
// students to one supervisor. Authorization is enforced server-side; this page
// only surfaces controls an admin is allowed to use.
export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [supervisorList, setSupervisorList] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [bulkSup, setBulkSup] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Active supervisors — the full list, for both the per-row and bulk dropdowns.
  const refreshSupervisors = useCallback(async () => {
    const { users } = await api.get('/admin/users?role=supervisor');
    setSupervisorList((users || []).filter((u) => u.active));
  }, []);

  const loadUsers = useCallback(async (role, q) => {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (q) params.set('q', q);
    const qs = params.toString();
    const { users } = await api.get('/admin/users' + (qs ? `?${qs}` : ''));
    setUsers(users || []);
  }, []);

  // Load the supervisor list once.
  useEffect(() => {
    refreshSupervisors().catch((err) => setError(err.message));
  }, [refreshSupervisors]);

  // Load users on mount and whenever the role filter or search term changes.
  // Typing is debounced (350 ms) so search-as-you-type doesn't hammer the API;
  // an empty term (initial load / cleared box) queries immediately.
  useEffect(() => {
    const term = search.trim();
    const t = setTimeout(() => {
      loadUsers(roleFilter, term)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, term ? 350 : 0);
    return () => clearTimeout(t);
  }, [roleFilter, search, loadUsers]);

  // ---- Selection (students only) ----
  const shownStudentIds = useMemo(
    () => users.filter((u) => u.role === 'student').map((u) => u._id),
    [users]
  );
  const allShownSelected =
    shownStudentIds.length > 0 && shownStudentIds.every((id) => selected.has(id));

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownStudentIds.forEach((id) => next.delete(id));
      else shownStudentIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // ---- Per-row update (reassign supervisor / toggle active) ----
  async function patchUser(id, body) {
    setError('');
    setNotice('');
    try {
      await api.patch(`/admin/users/${id}`, body);
      await Promise.all([loadUsers(roleFilter, search.trim()), refreshSupervisors()]);
      setNotice('User updated.');
    } catch (err) {
      setError(err.message);
    }
  }

  // ---- Bulk assign selected students to one supervisor ----
  async function bulkAssign() {
    if (!bulkSup || selected.size === 0) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api.post('/admin/users/bulk-assign', {
        supervisorId: bulkSup,
        studentIds: [...selected],
      });
      const name = res.supervisor?.name || 'the supervisor';
      const parts = [`Assigned ${res.assigned} student${res.assigned === 1 ? '' : 's'} to ${name}.`];
      if (res.skipped) parts.push(`${res.skipped} already assigned.`);
      setNotice(parts.join(' '));
      setSelected(new Set());
      setBulkSup('');
      await loadUsers(roleFilter, search.trim());
    } catch (err) {
      const detail = Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : null;
      setError(detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="center-load">Loading…</div>;

  return (
    <>
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">Search users, manage accounts, and assign students to supervisors.</p>
      <Alert>{error}</Alert>
      {notice && <div className="alert success">{notice}</div>}

      {/* Search + role filter */}
      <div className="flex-between" style={{ marginBottom: 14 }}>
        <input
          type="search"
          className="search-box"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 340 }}
          aria-label="Search users by name or email"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="supervisor">Supervisors</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {/* Bulk-assign bar — appears once at least one student is selected */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{selected.size} selected</strong>
          <span className="grow" />
          <label className="muted" htmlFor="bulk-sup">Assign to</label>
          <select id="bulk-sup" value={bulkSup} onChange={(e) => setBulkSup(e.target.value)} style={{ width: 'auto' }}>
            <option value="">— choose supervisor —</option>
            {supervisorList.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <button className="btn small" disabled={!bulkSup || busy} onClick={bulkAssign}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
          <button className="btn secondary small" onClick={() => setSelected(new Set())} disabled={busy}>
            Clear
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="card">
        <div className="table-wrap"><table className="data">
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  checked={allShownSelected}
                  onChange={toggleAllShown}
                  aria-label="Select all students shown"
                />
              </th>
              <th>Name</th><th>Matric</th><th>Email</th><th>Role</th><th>Supervisor</th><th>Active</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>No users match.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u._id}>
                  <td className="check">
                    {u.role === 'student' && (
                      <input
                        type="checkbox"
                        checked={selected.has(u._id)}
                        onChange={() => toggleOne(u._id)}
                        aria-label={`Select ${u.name}`}
                      />
                    )}
                  </td>
                  <td>{u.name}</td>
                  <td>{u.matricNumber || '—'}</td>
                  <td>{u.email}</td>
                  <td><Badge status={u.role} /></td>
                  <td>
                    {u.role === 'student' ? (
                      <select value={u.supervisor?._id || ''} onChange={(e) => patchUser(u._id, { supervisorId: e.target.value })}>
                        <option value="">— unassigned —</option>
                        {supervisorList.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                      </select>
                    ) : '—'}
                  </td>
                  <td>{u.active ? 'Yes' : 'No'}</td>
                  <td>
                    <button className="btn secondary small" onClick={() => patchUser(u._id, { active: !u.active })}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
