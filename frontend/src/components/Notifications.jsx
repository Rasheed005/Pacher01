import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { fmtDate } from './ui.jsx';

// Bell + dropdown of in-app notifications for the current user. Polls every 30s.
// Opening the panel marks everything read (optimistically). Notifications are a
// convenience layer — any fetch error is swallowed so it never breaks the page.
export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { notifications, unreadCount } = await api.get('/notifications');
      setItems(notifications || []);
      setUnread(unreadCount || 0);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // Close when clicking outside the widget.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      try {
        await api.post('/notifications/read');
      } catch {
        /* ignore */
      }
    }
  }

  function openItem(n) {
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button type="button" className="notif-bell" onClick={toggle} aria-label="Notifications">
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="notif-count">{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          {items.length === 0 ? (
            <div className="notif-empty">You have no notifications.</div>
          ) : (
            items.map((n) => (
              <button
                type="button"
                key={n._id}
                className={'notif' + (n.read ? '' : ' unread')}
                onClick={() => openItem(n)}
              >
                <div className="notif-msg">{n.message}</div>
                <div className="meta">{fmtDate(n.createdAt)}</div>
              </button>
            ))
          )}
          <button
            type="button"
            className="notif-seeall"
            onClick={() => { setOpen(false); navigate('/notifications'); }}
          >
            See all notifications →
          </button>
        </div>
      )}
    </div>
  );
}
