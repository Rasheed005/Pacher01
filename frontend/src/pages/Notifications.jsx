import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { fmtDate, Alert } from '../components/ui.jsx';

const PAGE = 20;

// Per-type presentation. Falls back to 'system' for anything unknown.
const TYPE_ICON = { topic: '📝', chapter: '📄', final: '🎓', assignment: '👥', system: '🔔' };
const TYPE_LABEL = { topic: 'Topic', chapter: 'Chapter', final: 'Final', assignment: 'Assignment', system: 'System' };

// Full-page, paginated notification list shared by every role.
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (skip) => {
    const { notifications, unreadCount, total } = await api.get(`/notifications?limit=${PAGE}&skip=${skip}`);
    setUnread(unreadCount || 0);
    setTotal(total || 0);
    setItems((prev) => (skip === 0 ? notifications || [] : [...prev, ...(notifications || [])]));
  }, []);

  useEffect(() => {
    loadPage(0).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [loadPage]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await loadPage(items.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markOne(n) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        const { unreadCount } = await api.post(`/notifications/${n._id}/read`);
        if (typeof unreadCount === 'number') setUnread(unreadCount);
      } catch {
        /* optimistic — non-critical */
      }
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try {
      await api.post('/notifications/read');
    } catch {
      /* optimistic — non-critical */
    }
  }

  if (loading) return <div className="center-load">Loading…</div>;

  return (
    <>
      <div className="flex-between">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            {total === 0 ? 'You have no notifications.' : `${unread} unread of ${total} total.`}
          </p>
        </div>
        {unread > 0 && (
          <button type="button" className="btn secondary small" onClick={markAll}>Mark all as read</button>
        )}
      </div>
      <Alert>{error}</Alert>

      <div className="card">
        {items.length === 0 ? (
          <div className="empty">Nothing here yet — topic, chapter and assignment updates will appear here.</div>
        ) : (
          <div className="notif-list">
            {items.map((n) => (
              <button
                type="button"
                key={n._id}
                className={'notif' + (n.read ? '' : ' unread')}
                onClick={() => markOne(n)}
              >
                <div className="notif-row">
                  <span className="notif-type" title={TYPE_LABEL[n.type] || 'System'}>
                    {TYPE_ICON[n.type] || TYPE_ICON.system}
                  </span>
                  <div className="notif-main">
                    <div className="notif-msg">{n.message}</div>
                    <div className="meta">{(TYPE_LABEL[n.type] || 'System') + ' · ' + fmtDate(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="notif-dot" aria-label="unread" />}
                </div>
              </button>
            ))}
          </div>
        )}
        {items.length < total && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button type="button" className="btn secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
