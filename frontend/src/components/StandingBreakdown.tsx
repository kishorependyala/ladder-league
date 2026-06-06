import { useEffect, useState } from 'react';
import { getStandingBreakdown, type League, type PlayerBreakdownRow, type RoundDef, type User } from '../api';
import { S, mutedText } from '../theme';

type Props = { league: League; user: User };

const LINE_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function RankChart({ xPoints, playerLines, total }: {
  xPoints: { label: string; isCurrent: boolean }[];
  playerLines: { player: PlayerBreakdownRow; pts: { rank: number }[] }[];
  total: number;
}) {
  if (playerLines.length === 0 || xPoints.length === 0) return null;

  const W = 640;
  const H = 280;
  const padL = 38;
  const padR = 70; // room for name labels
  const padT = 24;
  const padB = 48;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const cols = xPoints.length;

  const xOf = (i: number) => cols <= 1 ? padL + chartW / 2 : padL + (i / (cols - 1)) * chartW;
  const yOf = (rank: number) => padT + ((rank - 1) / Math.max(total - 1, 1)) * chartH;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%"
        style={{ minWidth: 300, maxWidth: 760, display: 'block', margin: '0 auto' }}>

        {/* Horizontal grid lines */}
        {Array.from({ length: total }, (_, i) => i + 1).map(rank => (
          <g key={rank}>
            <line x1={padL} y1={yOf(rank)} x2={W - padR} y2={yOf(rank)}
              stroke="#f3f4f6" strokeWidth={1} />
            <text x={padL - 6} y={yOf(rank) + 4} fontSize={10} fill="#9ca3af" textAnchor="end">{rank}</text>
          </g>
        ))}

        {/* Vertical dashed lines at each column */}
        {xPoints.map((xp, i) => (
          <line key={i} x1={xOf(i)} y1={padT} x2={xOf(i)} y2={H - padB}
            stroke={xp.isCurrent ? '#d97706' : '#e5e7eb'} strokeWidth={1}
            strokeDasharray={xp.isCurrent ? '4,3' : '2,3'} />
        ))}

        {/* X-axis labels */}
        {xPoints.map((xp, i) => (
          <text key={i} x={xOf(i)} y={H - padB + 14} fontSize={10}
            fontWeight={i === 0 || xp.isCurrent ? 700 : 400}
            fill={i === 0 ? '#6d28d9' : xp.isCurrent ? '#d97706' : '#6b7280'}
            textAnchor="middle">
            {xp.label}
          </text>
        ))}
        {/* Second line for longer labels */}
        {xPoints.map((xp, i) => xp.label.length > 7 ? (
          <text key={`lbl2-${i}`} x={xOf(i)} y={H - padB + 26} fontSize={9}
            fill="#9ca3af" textAnchor="middle">{xp.label.slice(7)}</text>
        ) : null)}

        {/* Y-axis label */}
        <text x={10} y={H / 2} fontSize={9} fill="#9ca3af" textAnchor="middle"
          transform={`rotate(-90,10,${H / 2})`}>Rank</text>

        {/* Player lines */}
        {playerLines.map(({ player, pts }, pi) => {
          const color = LINE_COLORS[pi % LINE_COLORS.length];
          const coords = pts.map((p, i) => ({ cx: xOf(i), cy: yOf(p.rank), rank: p.rank }));
          const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.cx} ${c.cy}`).join(' ');
          const last = coords[coords.length - 1];
          return (
            <g key={player.playerId}>
              <path d={d} fill="none" stroke={color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
              {coords.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy}
                  r={i === 0 || i === coords.length - 1 ? 5 : 3.5}
                  fill={i === 0 || i === coords.length - 1 ? color : '#fff'}
                  stroke={color} strokeWidth={1.5}>
                  <title>{player.playerName} — {xPoints[i].label}: #{c.rank}</title>
                </circle>
              ))}
              {/* Name label at last point */}
              <text x={last.cx + 8} y={last.cy + 4} fontSize={10} fill={color} fontWeight={700}>
                {player.playerName.split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem', justifyContent: 'center', marginTop: '0.5rem' }}>
        {playerLines.map(({ player }, pi) => (
          <div key={player.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: LINE_COLORS[pi % LINE_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: '#374151' }}>{player.playerName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StandingBreakdown({ league }: Props) {
  const [rounds, setRounds] = useState<RoundDef[]>([]);
  const [breakdown, setBreakdown] = useState<PlayerBreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    getStandingBreakdown(league.id)
      .then(res => { setRounds(res.rounds || []); setBreakdown(res.breakdown || []); })
      .catch(err => setError(err.message || 'Failed to load trends'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [league.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().slice(0, 10);

  // Build x-axis: Start + each round up to and including today's round
  const xPoints: { label: string; isCurrent: boolean; roundIndex: number | null }[] = [
    { label: 'Start', isCurrent: false, roundIndex: null },
  ];
  let currentRoundIndex: number | null = null;
  rounds.forEach((r, i) => {
    if (r.endDate < today) {
      xPoints.push({ label: r.label, isCurrent: false, roundIndex: i });
    } else if (r.startDate <= today && r.endDate >= today) {
      // In-progress round — label as "Current"
      xPoints.push({ label: 'Current', isCurrent: true, roundIndex: i });
      currentRoundIndex = i;
    }
    // Future rounds: skip
  });

  // Build per-player point arrays aligned to xPoints
  const playerLines = breakdown.map(player => ({
    player,
    pts: xPoints.map(xp => {
      if (xp.roundIndex === null) return { rank: player.startRank };
      const rr = player.roundRanks.find(r => r.roundIndex === xp.roundIndex);
      return { rank: rr ? rr.rank : player.currentRank };
    }),
  }));

  if (loading) return <p style={mutedText}>Loading trends…</p>;
  if (error) return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={S.errorBox}>{error}</div>
      <button style={S.smallOutlineBtn} onClick={load}>🔄 Retry</button>
    </div>
  );
  if (breakdown.length === 0) {
    return <p style={mutedText}>No round data yet — matches needed to see trends.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <p style={{ ...mutedText, fontSize: '0.82rem' }}>
        Rank 1 is best · 
        <span style={{ color: '#6d28d9', fontWeight: 600 }}> Start</span> = initial voted ranking
        {xPoints.some(x => !x.isCurrent && x.roundIndex !== null) && <span> · completed rounds = saved snapshot</span>}
        {currentRoundIndex !== null && <span> · <span style={{ color: '#d97706', fontWeight: 600 }}>Current</span> = live rank (round in progress)</span>}
      </p>
      <RankChart xPoints={xPoints} playerLines={playerLines} total={breakdown.length} />
    </div>
  );
}

