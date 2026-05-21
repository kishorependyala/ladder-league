import { useEffect, useMemo, useState } from 'react';
import { getStandingBreakdown, type League, type PlayerBreakdownRow, type RoundDef, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { league: League; user: User };

// Distinct palette for up to 10 players
const LINE_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function RankChart({ rounds, breakdown }: { rounds: RoundDef[]; breakdown: PlayerBreakdownRow[] }) {
  const totalRounds = rounds.length;
  const totalPlayers = breakdown.length;

  if (totalRounds < 2 || totalPlayers === 0) return null;

  const W = 600;
  const H = 260;
  const padL = 36;
  const padR = 12;
  const padT = 20;
  const padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const xOf = (i: number) => padL + (i / (totalRounds - 1)) * chartW;
  const yOf = (rank: number) => padT + ((rank - 1) / (totalPlayers - 1 || 1)) * chartH;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ minWidth: 320, maxWidth: 700, display: 'block', margin: '0 auto' }}
      >
        {/* Horizontal grid lines (one per rank) */}
        {Array.from({ length: totalPlayers }, (_, i) => i + 1).map(rank => (
          <g key={rank}>
            <line
              x1={padL} y1={yOf(rank)} x2={W - padR} y2={yOf(rank)}
              stroke="#f3f4f6" strokeWidth={1}
            />
            <text x={padL - 6} y={yOf(rank) + 4} fontSize={10} fill="#9ca3af" textAnchor="end">
              {rank}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {rounds.map((r, i) => (
          <text key={i} x={xOf(i)} y={H - 6} fontSize={10} fill="#6b7280" textAnchor="middle">
            {r.label}
          </text>
        ))}

        {/* Y-axis label */}
        <text
          x={10} y={H / 2} fontSize={10} fill="#9ca3af"
          textAnchor="middle"
          transform={`rotate(-90, 10, ${H / 2})`}
        >
          Rank
        </text>

        {/* Player lines */}
        {breakdown.map((player, pi) => {
          const color = LINE_COLORS[pi % LINE_COLORS.length];
          const points = player.roundRanks.map(rr => ({
            x: xOf(rr.roundIndex),
            y: yOf(rr.rank),
          }));
          if (points.length === 0) return null;

          const d = points
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
            .join(' ');

          return (
            <g key={player.playerId}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, idx) => (
                <circle key={idx} cx={p.x} cy={p.y} r={4} fill={color} stroke="#fff" strokeWidth={1.5}>
                  <title>{player.playerName} — {player.roundRanks[idx].label}: Rank {player.roundRanks[idx].rank}</title>
                </circle>
              ))}
              {/* Player name at last point */}
              <text
                x={points[points.length - 1].x + 6}
                y={points[points.length - 1].y + 4}
                fontSize={9}
                fill={color}
                fontWeight={700}
              >
                {player.playerName.split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
        {breakdown.map((player, pi) => (
          <div key={player.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: LINE_COLORS[pi % LINE_COLORS.length],
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.8rem', color: '#374151' }}>{player.playerName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const pct = total <= 1 ? 0 : (rank - 1) / (total - 1);
  // green → amber → red
  const bg = rank === 1 ? '#d1fae5' : pct < 0.5 ? '#fef3c7' : '#fee2e2';
  const color = rank === 1 ? '#065f46' : pct < 0.5 ? '#92400e' : '#991b1b';
  return (
    <span style={{
      display: 'inline-block',
      background: bg, color,
      borderRadius: '0.4rem',
      padding: '0.15rem 0.5rem',
      fontWeight: 700,
      fontSize: '0.85rem',
      minWidth: 28,
      textAlign: 'center',
    }}>
      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
    </span>
  );
}

export default function StandingBreakdown({ league }: Props) {
  const [rounds, setRounds] = useState<RoundDef[]>([]);
  const [breakdown, setBreakdown] = useState<PlayerBreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getStandingBreakdown(league.id)
      .then(res => {
        if (cancelled) return;
        setRounds(res.rounds || []);
        setBreakdown(res.breakdown || []);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load breakdown');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [league.id]);

  // Show rounds most-recent first
  const displayRounds = useMemo(() => [...rounds].reverse(), [rounds]);

  if (loading) return <p style={mutedText}>Loading standings breakdown…</p>;
  if (error) return <div style={S.errorBox}>{error}</div>;
  if (rounds.length === 0) {
    return <p style={mutedText}>No round data yet — submit matches to see breakdown.</p>;
  }

  const total = breakdown.length;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>

      {/* ── Rank trend chart ──────────────────────────────────── */}
      <div>
        <h3 style={{ ...subheading, marginBottom: '0.75rem' }}>📈 Rank Trend</h3>
        <p style={{ ...mutedText, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Lower is better — rank 1 is at the top.
        </p>
        <RankChart rounds={rounds} breakdown={breakdown} />
      </div>

      {/* ── Breakdown table ───────────────────────────────────── */}
      <div>
        <h3 style={{ ...subheading, marginBottom: '0.75rem' }}>🏅 Standing Breakdown</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead>
              <tr>
                <th style={thStyle}>Player</th>
                <th style={{ ...thStyle, background: '#fef3c7', color: '#92400e' }}>Current</th>
                {displayRounds.map(r => (
                  <th key={r.label} style={thStyle}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row, ri) => {
                const displayRoundRanks = [...row.roundRanks].reverse();
                return (
                  <tr key={row.playerId} style={{ background: ri % 2 === 0 ? '#fff' : '#fffbeb' }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: '#78350f' }}>
                      <span style={{
                        display: 'inline-block', width: 22, height: 22, borderRadius: '50%',
                        background: LINE_COLORS[ri % LINE_COLORS.length],
                        marginRight: '0.45rem', verticalAlign: 'middle', flexShrink: 0,
                      }} />
                      {row.playerName}
                    </td>
                    <td style={{ ...tdStyle, background: '#fef9ee', textAlign: 'center' }}>
                      <RankBadge rank={row.currentRank} total={total} />
                    </td>
                    {displayRoundRanks.map(rr => {
                      const isLast = rr.roundIndex > 0;
                      const prevRR = row.roundRanks.find(x => x.roundIndex === rr.roundIndex - 1);
                      const delta = prevRR ? prevRR.rank - rr.rank : 0;
                      return (
                        <td key={rr.roundIndex} style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                            <RankBadge rank={rr.rank} total={total} />
                            {isLast && delta !== 0 && (
                              <span style={{ fontSize: '0.75rem', color: delta > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.5rem' }}>
          ▲ = improved rank · ▼ = dropped rank compared to previous round
        </p>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  background: '#f9fafb',
  borderBottom: '2px solid #fed7aa',
  color: '#6b7280',
  fontSize: '0.82rem',
  fontWeight: 700,
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.88rem',
  whiteSpace: 'nowrap',
};
