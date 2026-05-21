import { useEffect, useState } from 'react';
import { getStandingBreakdown, type League, type Match, type RoundDef, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { league: League; user: User; matches: Match[] };

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RoundsTab({ league }: Props) {
  const [rounds, setRounds] = useState<RoundDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStandingBreakdown(league.id)
      .then(res => { if (!cancelled) setRounds(res.rounds || []); })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load rounds'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [league.id]);

  if (loading) return <p style={mutedText}>Loading rounds…</p>;
  if (error) return <div style={S.errorBox}>{error}</div>;
  if (rounds.length === 0) return <p style={mutedText}>No rounds yet.</p>;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={subheading}>Rounds</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Round', 'Start', 'End'].map(h => (
              <th key={h} style={{ padding: '0.55rem 0.75rem', background: '#f9fafb', borderBottom: '2px solid #fed7aa', color: '#6b7280', fontSize: '0.82rem', fontWeight: 700, textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((r, i) => (
            <tr key={r.label} style={{ background: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
              <td style={{ padding: '0.55rem 0.75rem', fontWeight: 700, color: '#78350f' }}>{r.label}</td>
              <td style={{ padding: '0.55rem 0.75rem', color: '#374151' }}>{fmtDate(r.startDate)}</td>
              <td style={{ padding: '0.55rem 0.75rem', color: '#374151' }}>{fmtDate(r.endDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
