import { useEffect, useState } from 'react';
import { findLeaguePlayer, getStandingBreakdown, type League, type Match, type PlayerBreakdownRow, type RoundDef, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = {
  league: League;
  user: User;
  matches: Match[];
};

type RoundStatus = 'upcoming' | 'active' | 'completed';

function getRoundStatus(startDate: string, endDate: string): RoundStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'completed';
  return 'active';
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000
  );
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: RoundStatus }) {
  const map: Record<RoundStatus, { label: string; bg: string; color: string }> = {
    upcoming: { label: '📅 Upcoming', bg: '#f3f4f6', color: '#6b7280' },
    active:   { label: '🔄 In Progress', bg: '#fef3c7', color: '#92400e' },
    completed:{ label: '✅ Completed', bg: '#d1fae5', color: '#065f46' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontWeight: 700, fontSize: '0.78rem' }}>
      {s.label}
    </span>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const pct = total <= 1 ? 0 : (rank - 1) / (total - 1);
  const bg = rank === 1 ? '#d1fae5' : pct < 0.5 ? '#fef3c7' : '#fee2e2';
  const color = rank === 1 ? '#065f46' : pct < 0.5 ? '#92400e' : '#991b1b';
  return (
    <span style={{ background: bg, color, borderRadius: '0.4rem', padding: '0.15rem 0.5rem', fontWeight: 700, fontSize: '0.82rem', minWidth: 28, display: 'inline-block', textAlign: 'center' }}>
      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
    </span>
  );
}

function RoundCard({
  round,
  roundIndex,
  matches,
  breakdown,
  league,
  totalPlayers,
}: {
  round: RoundDef;
  roundIndex: number;
  matches: Match[];
  breakdown: PlayerBreakdownRow[];
  league: League;
  totalPlayers: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const status = getRoundStatus(round.startDate, round.endDate);
  const duration = daysBetween(round.startDate, round.endDate);
  const today = new Date().toISOString().slice(0, 10);

  const roundMatches = matches.filter(m => {
    const dp = m.datePlayed || (m.submittedAt || '').slice(0, 10);
    return m.status === 'accepted' && dp >= round.startDate && dp <= round.endDate;
  });

  // Standings snapshot at end of this round
  const rankSnapshot = breakdown.map(row => ({
    ...row,
    roundRank: row.roundRanks.find(rr => rr.roundIndex === roundIndex)?.rank ?? null,
    prevRank: roundIndex > 0
      ? (row.roundRanks.find(rr => rr.roundIndex === roundIndex - 1)?.rank ?? null)
      : null,
  })).filter(r => r.roundRank !== null).sort((a, b) => (a.roundRank! - b.roundRank!));

  // Progress bar for active rounds
  const daysLeft = status === 'active'
    ? Math.max(0, Math.ceil((new Date(round.endDate + 'T00:00:00').getTime() - Date.now()) / 86400000))
    : 0;
  const progressPct = status === 'active'
    ? Math.min(100, Math.max(0, ((daysBetween(round.startDate, today)) / duration) * 100))
    : status === 'completed' ? 100 : 0;

  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: '1rem', overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', background: status === 'active' ? '#fef3c7' : status === 'completed' ? '#f0fdf4' : '#f9fafb',
          border: 'none', cursor: 'pointer',
          padding: '0.85rem 1rem', display: 'flex', alignItems: 'center',
          gap: '0.75rem', flexWrap: 'wrap', textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#78350f', minWidth: 80 }}>
          {round.label}
        </span>
        <StatusBadge status={status} />
        <span style={{ ...mutedText, fontSize: '0.82rem' }}>
          {fmtDate(round.startDate)} → {fmtDate(round.endDate)} · {duration}d
        </span>
        {status === 'active' && (
          <span style={{ fontSize: '0.82rem', color: '#b45309', fontWeight: 600 }}>
            {daysLeft}d left
          </span>
        )}
        <span style={{ ...mutedText, fontSize: '0.82rem', marginLeft: 'auto' }}>
          {roundMatches.length} match{roundMatches.length !== 1 ? 'es' : ''}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Progress bar (active rounds) */}
      {status === 'active' && (
        <div style={{ height: 4, background: '#e5e7eb' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
        </div>
      )}

      {expanded && (
        <div style={{ padding: '1rem', display: 'grid', gap: '1.25rem' }}>

          {/* Standings snapshot */}
          {rankSnapshot.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.88rem', fontWeight: 700, color: '#6b7280' }}>
                {status === 'completed' ? 'Standings at end of round' : 'Current standings'}
              </h4>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {rankSnapshot.map(row => {
                  const delta = row.prevRank !== null && row.roundRank !== null
                    ? row.prevRank - row.roundRank : 0;
                  return (
                    <div key={row.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <RankBadge rank={row.roundRank!} total={totalPlayers} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#374151', flex: 1 }}>
                        {row.playerName}
                      </span>
                      {roundIndex > 0 && delta !== 0 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: delta > 0 ? '#16a34a' : '#dc2626' }}>
                          {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matches in this round */}
          <div>
            <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.88rem', fontWeight: 700, color: '#6b7280' }}>
              Matches played
            </h4>
            {roundMatches.length === 0 ? (
              <p style={{ ...mutedText, fontSize: '0.85rem' }}>
                {status === 'upcoming' ? 'Round has not started.' : 'No matches recorded yet.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {roundMatches.map(m => {
                  const submitterName = findLeaguePlayer(league, m.submitterId, m.submitter);
                  const opponentName = findLeaguePlayer(league, m.opponentId, m.opponent);
                  const winnerId = m.winner === 'submitter' ? m.submitterId
                    : m.winner === 'opponent' ? m.opponentId
                    : m.winner || m.submitterId;
                  const winnerName = winnerId === m.submitterId ? submitterName : opponentName;
                  const sets = m.score?.sets;
                  const scoreStr = sets?.length
                    ? sets.map((s: { me: number; opp: number }) => `${s.me}–${s.opp}`).join(', ')
                    : typeof m.score?.submitter === 'number'
                      ? `${m.score.submitter} - ${m.score.opponent}`
                      : '';

                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.65rem', background: '#fffbeb', borderRadius: '0.6rem', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#78350f' }}>
                        {submitterName} vs {opponentName}
                      </span>
                      {scoreStr && <span style={{ ...mutedText, fontSize: '0.82rem' }}>{scoreStr}</span>}
                      <span style={{ fontSize: '0.78rem', background: '#d1fae5', color: '#065f46', borderRadius: '0.3rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                        {winnerName} wins
                      </span>
                      {m.datePlayed && (
                        <span style={{ ...mutedText, fontSize: '0.78rem', marginLeft: 'auto' }}>{m.datePlayed}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoundsTab({ league, user, matches }: Props) {
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
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load rounds'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [league.id]);

  if (loading) return <p style={mutedText}>Loading rounds…</p>;
  if (error) return <div style={S.errorBox}>{error}</div>;

  const totalPlayers = league.players?.length ?? 0;

  // Show most recent round first
  const displayRounds = [...rounds].reverse();
  const displayIndexes = displayRounds.map(r => rounds.indexOf(r));

  const hasBlocks = (league.blocks ?? []).length > 0;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={subheading}>Rounds</h3>
        {!hasBlocks && (
          <p style={{ ...mutedText, fontSize: '0.85rem', marginTop: '0.35rem' }}>
            No rounds configured — showing auto-derived weekly periods from match dates.
          </p>
        )}
      </div>

      {displayRounds.length === 0 ? (
        <p style={mutedText}>No rounds yet — submit matches to see round data.</p>
      ) : (
        displayRounds.map((round, i) => (
          <RoundCard
            key={round.label}
            round={round}
            roundIndex={displayIndexes[i]}
            matches={matches}
            breakdown={breakdown}
            league={league}
            totalPlayers={totalPlayers}
          />
        ))
      )}
    </div>
  );
}
