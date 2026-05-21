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
  const totalPlayers = breakdown.length;
  if (totalPlayers === 0) return null;

  // Build unified x-axis: [Start, Round 1, ..., Round N, Current]
  // "Current" is always appended; if there are no rounds, chart shows Start → Current only.
  type XPoint = { label: string; key: string };
  const xPoints: XPoint[] = [
    { label: 'Start', key: 'start' },
    ...rounds.map((r, i) => ({ label: r.label, key: `r${i}` })),
    { label: 'Current', key: 'current' },
  ];
  const totalCols = xPoints.length;
  if (totalCols < 2) return null;

  const W = 600;
  const H = 260;
  const padL = 36;
  const padR = 16;
  const padT = 20;
  const padB = 44;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const xOf = (i: number) => padL + (i / (totalCols - 1)) * chartW;
  const yOf = (rank: number) => padT + ((rank - 1) / (totalPlayers - 1 || 1)) * chartH;

  // For each player build the full array of [start, ...roundRanks, current]
  const playerPoints = breakdown.map(player => {
    const pts: { x: number; y: number; label: string; rank: number }[] = [];
    // Start
    pts.push({ x: xOf(0), y: yOf(player.startRank), label: 'Start', rank: player.startRank });
    // Each round
    player.roundRanks.forEach((rr, ri) => {
      pts.push({ x: xOf(ri + 1), y: yOf(rr.rank), label: rr.label, rank: rr.rank });
    });
    // Current
    pts.push({ x: xOf(totalCols - 1), y: yOf(player.currentRank), label: 'Current', rank: player.currentRank });
    return pts;
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ minWidth: 320, maxWidth: 740, display: 'block', margin: '0 auto' }}
      >
        {/* Horizontal grid lines (one per rank) */}
        {Array.from({ length: totalPlayers }, (_, i) => i + 1).map(rank => (
          <g key={rank}>
            <line x1={padL} y1={yOf(rank)} x2={W - padR} y2={yOf(rank)} stroke="#f3f4f6" strokeWidth={1} />
            <text x={padL - 6} y={yOf(rank) + 4} fontSize={10} fill="#9ca3af" textAnchor="end">{rank}</text>
          </g>
        ))}

        {/* Vertical dividers for Start and Current */}
        <line x1={xOf(0)} y1={padT} x2={xOf(0)} y2={H - padB} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3,3" />
        <line x1={xOf(totalCols - 1)} y1={padT} x2={xOf(totalCols - 1)} y2={H - padB} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3,3" />

        {/* X-axis labels */}
        {xPoints.map((xp, i) => (
          <text
            key={xp.key}
            x={xOf(i)} y={H - padB + 14}
            fontSize={i === 0 || i === totalCols - 1 ? 11 : 10}
            fontWeight={i === 0 || i === totalCols - 1 ? 700 : 400}
            fill={i === 0 ? '#6d28d9' : i === totalCols - 1 ? '#d97706' : '#6b7280'}
            textAnchor="middle"
          >
            {xp.label}
          </text>
        ))}
        {/* Second line of x-labels for longer round names (wrap at 6 chars) */}
        {xPoints.map((xp, i) => xp.label.length > 7 ? (
          <text key={`${xp.key}-2`} x={xOf(i)} y={H - padB + 26} fontSize={9} fill="#9ca3af" textAnchor="middle">
            {xp.label.slice(7)}
          </text>
        ) : null)}

        {/* Y-axis label */}
        <text x={10} y={H / 2} fontSize={10} fill="#9ca3af" textAnchor="middle" transform={`rotate(-90, 10, ${H / 2})`}>
          Rank
        </text>

        {/* Player lines */}
        {breakdown.map((player, pi) => {
          const color = LINE_COLORS[pi % LINE_COLORS.length];
          const pts = playerPoints[pi];
          if (pts.length === 0) return null;
          const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const last = pts[pts.length - 1];

          return (
            <g key={player.playerId}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, idx) => (
                <circle key={idx} cx={p.x} cy={p.y} r={idx === 0 || idx === pts.length - 1 ? 5 : 4}
                  fill={idx === 0 || idx === pts.length - 1 ? color : '#fff'}
                  stroke={color} strokeWidth={idx === 0 || idx === pts.length - 1 ? 0 : 1.5}
                >
                  <title>{player.playerName} — {p.label}: Rank {p.rank}</title>
                </circle>
              ))}
              {/* Player name label at the "Current" point */}
              <text x={last.x + 5} y={last.y + 4} fontSize={9} fill={color} fontWeight={700}>
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
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: LINE_COLORS[pi % LINE_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
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
  if (breakdown.length === 0) {
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
                <th style={{ ...thStyle, background: '#ede9fe', color: '#6d28d9' }}>Start</th>
                {displayRounds.map(r => (
                  <th key={r.label} style={thStyle}>{r.label}</th>
                ))}
                <th style={{ ...thStyle, background: '#fef3c7', color: '#92400e' }}>Current</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row, ri) => {
                const displayRoundRanks = [...row.roundRanks].reverse();
                // Delta: current vs start
                const overallDelta = row.startRank - row.currentRank;
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
                    {/* Start rank */}
                    <td style={{ ...tdStyle, background: '#f5f3ff', textAlign: 'center' }}>
                      <RankBadge rank={row.startRank} total={total} />
                    </td>
                    {/* Per-round ranks (newest first) */}
                    {displayRoundRanks.map(rr => {
                      const prevRR = row.roundRanks.find(x => x.roundIndex === rr.roundIndex - 1);
                      const baseline = prevRR ? prevRR.rank : row.startRank;
                      const delta = baseline - rr.rank;
                      return (
                        <td key={rr.roundIndex} style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                            <RankBadge rank={rr.rank} total={total} />
                            {delta !== 0 && (
                              <span style={{ fontSize: '0.75rem', color: delta > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                                {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    {/* Current rank */}
                    <td style={{ ...tdStyle, background: '#fef9ee', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                        <RankBadge rank={row.currentRank} total={total} />
                        {overallDelta !== 0 && (
                          <span style={{ fontSize: '0.75rem', color: overallDelta > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                            {overallDelta > 0 ? `▲${overallDelta}` : `▼${Math.abs(overallDelta)}`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.5rem' }}>
          <span style={{ color: '#6d28d9', fontWeight: 600 }}>Start</span> = seed rank at league start &nbsp;·&nbsp;
          <span style={{ color: '#d97706', fontWeight: 600 }}>Current</span> = latest rank &nbsp;·&nbsp;
          ▲ = improved · ▼ = dropped vs previous point
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
