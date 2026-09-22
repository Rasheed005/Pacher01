// Shared presentational helpers — the React equivalents of the old common.js.

export function pct(score) {
  return score === null || score === undefined ? '—' : Math.round(score * 100) + '%';
}

export function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function Badge({ status }) {
  return <span className={'badge ' + status}>{String(status).replace(/_/g, ' ')}</span>;
}

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={'alert ' + type}>{children}</div>;
}

const SIM_MESSAGES = {
  high: 'This topic is very similar to an existing one and is likely to be rejected. Consider revising it.',
  moderate: 'This topic has moderate similarity to existing work and may be flagged for review.',
  low: 'This topic looks sufficiently distinct from existing submissions.',
  unavailable: 'Similarity check is currently unavailable — submissions are unaffected.',
};

export function SimBand({ sim }) {
  if (!sim) return null;
  const level = sim.warningLevel || (sim.status === 'unavailable' ? 'unavailable' : 'low');
  const label = level === 'unavailable' ? 'Similarity check unavailable' : `Top similarity: ${pct(sim.topScore)}`;
  return (
    <div className={'sim-band ' + level}>
      <div className="score">{label}</div>
      <div>{sim.message || SIM_MESSAGES[level] || ''}</div>
    </div>
  );
}

export function Matches({ matches }) {
  if (!matches || !matches.length) {
    return <p className="muted">No other topics to compare against yet.</p>;
  }
  return (
    <div>
      <h3>Closest existing topics</h3>
      {matches.map((m, i) => (
        <div className="match-row" key={i}>
          <span>{m.title}</span>
          <strong>{pct(m.score)}</strong>
        </div>
      ))}
    </div>
  );
}

// Append-only comment thread. Each review has { decision, comment, at, by|byName }.
export function Reviews({ reviews, heading = 'Supervisor comments' }) {
  if (!reviews || !reviews.length) return null;
  const sorted = [...reviews].sort((a, b) => new Date(a.at) - new Date(b.at));
  return (
    <div>
      <h3>{heading}</h3>
      {sorted.map((r, i) => {
        const name = r.byName || (r.by && r.by.name) || '';
        return (
          <div className="review" key={i}>
            <div className="head">
              <Badge status={r.decision} />
              <span>{`${name ? name + ' · ' : ''}${fmtDate(r.at)}`}</span>
            </div>
            <div className="body">{r.comment}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Timeline({ timeline }) {
  if (!timeline || !timeline.length) return <p className="muted">No activity yet.</p>;
  const sorted = [...timeline].sort((a, b) => new Date(b.at) - new Date(a.at));
  return (
    <ul className="timeline">
      {sorted.map((t, i) => {
        const name = t.byName || (t.by && t.by.name) || '';
        return (
          <li key={i}>
            <div className="event">{t.event}</div>
            <div className="meta">{`${name ? name + ' · ' : ''}${fmtDate(t.at)}`}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function StageTracker({ stage }) {
  const steps = [
    { key: 'topic', label: 'Topic Approval' },
    { key: 'chapters', label: 'Chapters' },
    { key: 'final', label: 'Final Approval' },
  ];
  const order = { topic: 0, chapters: 1, final: 2, completed: 3 };
  const cur = order[stage] ?? 0;
  return (
    <div className="stages">
      {steps.map((s, i) => {
        let cls = 'step';
        if (i < cur) cls += ' done';
        else if (i === cur) cls += ' current';
        return (
          <div className={cls} key={s.key}>
            <span className="n">Step {i + 1}</span>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

// External link that never leaks referrer/opener.
export function SafeLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children || href}
    </a>
  );
}
