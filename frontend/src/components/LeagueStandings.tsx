import { useCallback, useEffect, useMemo, useState } from 'react';
import { findLeaguePlayer, getDisplayName, getDoublesStandings, getLeague, getLeagueMatches, getLeagueStandings, getMyRoles, getPendingMatches, leagueTypeLabel, type DoublesStandingsRow, type League, type Match, type MatchLogEntry, type Player, type StandingsRow, type User } from '../api';
import TeamFormation from './TeamFormation';
import TeamStandings from './TeamStandings';
import { S, mutedText, sectionTitle, statusPill, subheading, tableCell, tableHeadCell } from '../theme';
import DoublesStandings from './DoublesStandings';
import MatchGrid from './MatchGrid';
import PendingMatches from './PendingMatches';
import PlayoffBracket from './PlayoffBracket';
import StandingBreakdown from './StandingBreakdown';
import RoundsTab from './RoundsTab';
import SubmitDoublesMatch from './SubmitDoublesMatch';
import SubmitMatch from './SubmitMatch';
import LeagueRulesSummary from './LeagueRulesSummary';


type LeagueStandingsProps = {
  league: League;
  user: User;
};

type StandingsTab = 'standings' | 'results' | 'breakdown' | 'rounds' | 'schedule' | 'rules' | 'doubles' | 'team-formation' | 'team-standings' | 'team-fixtures' | 'team-individual';

type MatchResultCard = {
  match: Match;
  winnerId?: string;
  loserId?: string;
  isUpset: boolean;
  winnerLog?: MatchLogEntry;
  loserLog?: MatchLogEntry;
};

function CoinFlipModal({ players, onClose }: { players: { id: string; firstName: string; lastName: string }[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  const toggle = (id: string) => {
    setResult(null);
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const flip = () => {
    if (selected.length < 2) return;
    setSpinning(true);
    setResult(null);
    const rounds = 12 + Math.floor(Math.random() * 8);
    let i = 0;
    const tick = () => {
      const pick = selected[Math.floor(Math.random() * selected.length)];
      setResult(pick);
      i++;
      if (i < rounds) {
        setTimeout(tick, 80 + Math.min(i * 18, 320));
      } else {
        const winner = selected[Math.floor(Math.random() * selected.length)];
        setResult(winner);
        setSpinning(false);
      }
    };
    tick();
  };

  const winnerName = result ? players.find(p => p.id === result) : null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '1.2rem', padding: '1.5rem', maxWidth: 380, width: '100%', display: 'grid', gap: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#78350f' }}>🪙 Coin Flip</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#6b7280' }}>Pick 2 or more opponents, then flip!</p>

        <div style={{ display: 'grid', gap: '0.45rem', maxHeight: 220, overflowY: 'auto' }}>
          {players.map(p => {
            const isOn = selected.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                style={{
                  textAlign: 'left', padding: '0.55rem 0.9rem', borderRadius: '0.65rem', border: isOn ? '2px solid #f59e0b' : '1.5px solid #e5e7eb',
                  background: isOn ? '#fef3c7' : '#f9fafb', cursor: 'pointer', fontWeight: isOn ? 700 : 500,
                  color: isOn ? '#92400e' : '#374151', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>{isOn ? '✅' : '⬜'}</span>
                {p.firstName} {p.lastName}
              </button>
            );
          })}
        </div>

        <button
          onClick={flip}
          disabled={selected.length < 2 || spinning}
          style={{
            padding: '0.7rem 1rem', borderRadius: '0.75rem', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: selected.length < 2 || spinning ? 'not-allowed' : 'pointer',
            background: selected.length >= 2 && !spinning ? '#f59e0b' : '#e5e7eb', color: selected.length >= 2 && !spinning ? '#fff' : '#9ca3af',
            transition: 'background 0.2s',
          }}
        >
          {spinning ? '🪙 Flipping…' : '🪙 Flip Coin'}
        </button>

        {result && (
          <div style={{
            textAlign: 'center', padding: '1rem', borderRadius: '0.9rem',
            background: spinning ? '#f3f4f6' : '#fef3c7', border: spinning ? '2px solid #e5e7eb' : '2px solid #f59e0b',
            transition: 'all 0.15s',
          }}>
            {spinning ? (
              <span style={{ fontSize: '1.1rem', color: '#6b7280', fontWeight: 600 }}>
                {players.find(p => p.id === result)?.firstName} {players.find(p => p.id === result)?.lastName}
              </span>
            ) : (
              <>
                <div style={{ fontSize: '2rem' }}>🎉</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#78350f', marginTop: '0.3rem' }}>
                  {winnerName?.firstName} {winnerName?.lastName}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#92400e', marginTop: '0.2rem' }}>wins the coin flip!</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LeagueStandings({ league, user }: LeagueStandingsProps) {
  const [currentLeague, setCurrentLeague] = useState(league);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [doublesStandings, setDoublesStandings] = useState<DoublesStandingsRow[]>([]);
  const [doublesStandingsLoading, setDoublesStandingsLoading] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [activeEnterPair, setActiveEnterPair] = useState<{ p1: Player; p2: Player } | null>(null);
  const [showSubmitMatch, setShowSubmitMatch] = useState(false);
  const [showSubmitDoubles, setShowSubmitDoubles] = useState(false);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isTeamLeague = currentLeague.leagueType === 'team';
  const teamPhase = currentLeague.phase ?? '';
  const isDoubles = Boolean(currentLeague.rules?.doublesMode && currentLeague.rules.doublesMode !== 'none' && !isTeamLeague);
  const [activeTab, setActiveTab] = useState<StandingsTab>('standings');

  useEffect(() => {
    setCurrentLeague(league);
  }, [league]);

  const formatScore = (match: Match) => {
    const sets = match.score?.sets;
    if (sets && sets.length > 0) {
      return sets.map(set => `${set.me}–${set.opp}`).join(', ');
    }
    if (typeof match.score?.submitter === 'number' && typeof match.score?.opponent === 'number') {
      return `${match.score.submitter} - ${match.score.opponent}`;
    }
    return 'Awaiting score details';
  };

  const resolveWinnerId = useCallback((match: Match) => {
    if (match.winner === 'submitter') return match.submitterId;
    if (match.winner === 'opponent') return match.opponentId;
    if (match.winner) return match.winner;
    const sets = match.score?.sets;
    if (sets && sets.length > 0) {
      let submitterWins = 0;
      let opponentWins = 0;
      sets.forEach(set => {
        if (set.me > set.opp) submitterWins += 1;
        else if (set.opp > set.me) opponentWins += 1;
      });
      if (submitterWins !== opponentWins) {
        return submitterWins > opponentWins ? match.submitterId : match.opponentId;
      }
    }
    if (typeof match.score?.submitter === 'number' && typeof match.score?.opponent === 'number') {
      return match.score.submitter >= match.score.opponent ? match.submitterId : match.opponentId;
    }
    return undefined;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const doublesMode = league.rules?.doublesMode;
      const isDoublesLeague = Boolean(doublesMode && doublesMode !== 'none' && league.leagueType !== 'team');
      const [roles, leagueResponse, standingsResponse, leagueMatches, pending, doublesStandingsResponse] = await Promise.all([
        getMyRoles(user.phone),
        getLeague(league.id),
        getLeagueStandings(league.id),
        getLeagueMatches(league.id),
        getPendingMatches(user.id),
        isDoublesLeague ? getDoublesStandings(league.id) : Promise.resolve(null),
      ]);
      const nextLeague = leagueResponse || league;
      const nextMatches = Array.isArray(leagueMatches) ? leagueMatches : [];
      const admin = Boolean(roles.isSuperAdmin || roles.adminLeagueIds.includes(league.id) || nextLeague.adminIds.includes(user.id));
      const extraPending = admin ? nextMatches.filter(match => match.status === 'pending') : [];
      const mergedPending = new Map<string, Match>();
      [...(Array.isArray(pending) ? pending : []), ...extraPending].forEach(match => mergedPending.set(match.id, match));
      setCurrentLeague(nextLeague);
      setIsAdmin(admin);
      setStandings(standingsResponse.standings || []);
      setMatches(nextMatches);
      setPendingMatches(Array.from(mergedPending.values()));
      if (doublesStandingsResponse) setDoublesStandings(doublesStandingsResponse.standings || []);
      // Auto-navigate to team formation tab for team leagues in formation phase
      if (admin && nextLeague.leagueType === 'team' && nextLeague.phase === 'team_formation') {
        setActiveTab('team-formation');
      } else if (nextLeague.leagueType === 'team' && nextLeague.phase === 'team_league') {
        setActiveTab('team-standings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load league standings.');
    }
    setLoading(false);
  }, [league, user.id, user.phone]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshDoublesStandings = useCallback(async () => {
    setDoublesStandingsLoading(true);
    try {
      const res = await getDoublesStandings(league.id);
      setDoublesStandings(res.standings ?? []);
    } catch {
      // silently fail — error already visible in main loadData
    }
    setDoublesStandingsLoading(false);
  }, [league.id]);

  const matchLogsByPlayer = useMemo(() => {
    const map = new Map<string, Map<string, MatchLogEntry>>();
    standings.forEach(row => {
      map.set(row.player.id, new Map((row.matchLog ?? []).map(log => [log.matchId, log])));
    });
    return map;
  }, [standings]);

  const seedPositions = useMemo(() => {
    const map = new Map<string, number>();
    (currentLeague.finalRanking || []).forEach((playerId, index) => map.set(playerId, index));
    return map;
  }, [currentLeague.finalRanking]);

  const acceptedResults = useMemo<MatchResultCard[]>(() => {
    return matches
      .filter(match => match.status === 'accepted' && !match.isPlayoff)
      .map(match => {
        const winnerId = resolveWinnerId(match);
        const loserId = winnerId === match.submitterId ? match.opponentId : match.submitterId;
        const winnerSeed = winnerId ? seedPositions.get(winnerId) : undefined;
        const loserSeed = loserId ? seedPositions.get(loserId) : undefined;
        const isUpset = winnerId
          ? (winnerSeed !== undefined && loserSeed !== undefined && winnerSeed > loserSeed) || (winnerSeed === undefined && loserSeed !== undefined)
          : false;
        return {
          match,
          winnerId,
          loserId,
          isUpset,
          winnerLog: winnerId ? matchLogsByPlayer.get(winnerId)?.get(match.id) : undefined,
          loserLog: loserId ? matchLogsByPlayer.get(loserId)?.get(match.id) : undefined,
        };
      })
      .sort((a, b) => {
        const aTime = new Date(a.match.submittedAt || a.match.createdAt || 0).getTime();
        const bTime = new Date(b.match.submittedAt || b.match.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [matchLogsByPlayer, matches, resolveWinnerId, seedPositions]);

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={sectionTitle}>{currentLeague.name}</h2>
            <p style={{ ...mutedText, marginTop: '0.3rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e' }}>{leagueTypeLabel(currentLeague.rules, currentLeague.leagueType)}</span>
              <span style={{ margin: '0 0.3rem', color: '#d1d5db' }}>·</span>
              {currentLeague.sport} league
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={statusPill(currentLeague.status)}>{currentLeague.status}</span>
            {(currentLeague.status === 'active' || currentLeague.status === 'playoffs') && (
              <>
                <button
                  style={S.smallBtn}
                  onClick={() => {
                    const isDoubles = currentLeague.rules?.doublesMode === 'adhoc' || currentLeague.rules?.doublesMode === 'fixed_pairs';
                    if (isDoubles) setShowSubmitDoubles(true); else setShowSubmitMatch(true);
                  }}
                >
                  ➕ Add Score
                </button>
                <button
                  style={{ ...S.smallBtn, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '1.2rem', padding: '0.3rem 0.65rem' }}
                  title="Coin flip"
                  onClick={() => setShowCoinFlip(true)}
                >
                  🪙
                </button>
              </>
            )}
          </div>
        </div>
        {/* Current block banner */}
        {currentLeague.status === 'active' && currentLeague.blocks && currentLeague.blocks.length > 0 && (() => {
          const blocks = currentLeague.blocks!;
          const todayIso = new Date().toISOString().slice(0, 10);
          const curIdx = blocks.findIndex(b => todayIso >= b.startDate && todayIso < b.endDate);
          const totalBlocks = blocks.length;
          if (curIdx >= 0) {
            const cur = blocks[curIdx];
            const msLeft = new Date(cur.endDate + 'T00:00:00').getTime() - Date.now();
            const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.55rem 0.8rem', background: '#fef3c7', borderRadius: '0.65rem', border: '1px solid #fde68a' }}>
                <span style={{ fontWeight: 700, color: '#92400e', fontSize: '0.88rem' }}>
                  📅 Round {curIdx + 1} of {totalBlocks}
                </span>
                {/* mini progress bar */}
                <div style={{ flex: 1, minWidth: 80, height: 7, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((curIdx + 1) / totalBlocks) * 100}%`, background: '#f59e0b', borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: '0.8rem', color: '#78350f' }}>
                  {new Date(cur.startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' → '}
                  {new Date(cur.endDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' · '}
                  <strong>{daysLeft}d left</strong>
                </span>
                {curIdx === totalBlocks - 1 && (
                  <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#6d28d9', borderRadius: '0.3rem', padding: '0.15rem 0.45rem', fontWeight: 700 }}>
                    🏆 Playoffs next
                  </span>
                )}
              </div>
            );
          }
          // All blocks done
          if (todayIso >= blocks[totalBlocks - 1].endDate) {
            return (
              <div style={{ padding: '0.5rem 0.8rem', background: '#ede9fe', borderRadius: '0.65rem', border: '1px solid #c4b5fd', fontSize: '0.85rem', color: '#6d28d9', fontWeight: 600 }}>
                🏆 All {totalBlocks} rounds complete — playoffs can begin.
              </div>
            );
          }
          return null;
        })()}
        {error && <div style={S.errorBox}>{error}</div>}
        {loading && <p style={mutedText}>Loading standings…</p>}
      </div>

      <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid #fed7aa', overflowX: 'auto' }}>
          {([
            ...(isTeamLeague && teamPhase === 'team_formation' && isAdmin
              ? [['team-formation', '🏗️ Team Formation']] as [StandingsTab, string][]
              : []),
            ...(isTeamLeague && teamPhase !== 'ranking'
              ? [
                  ['team-standings', '📊 Team Standings'] as [StandingsTab, string],
                  ['team-fixtures', '📅 Fixtures'] as [StandingsTab, string],
                  ['team-individual', '👤 Individual'] as [StandingsTab, string],
                ]
              : []),
            ...(!isTeamLeague ? [['standings', '📊 Standings'] as [StandingsTab, string]] : []),
            ...(!isDoubles && !isTeamLeague ? [['breakdown', '📈 Standings Breakdown']] as [StandingsTab, string][] : []),
            ['results', '🎯 Match Results'],
            ...(!isTeamLeague ? [['rounds', '📅 Rounds'] as [StandingsTab, string]] : []),
            ...(!isTeamLeague ? [['schedule', '📋 Schedule & Pending'] as [StandingsTab, string]] : []),
            ['rules', '📖 League Rules'],
            ...(isDoubles ? [['doubles', '🏸 Doubles'] as [StandingsTab, string]] : []),
          ] as [StandingsTab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.7rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '3px solid #f59e0b' : '3px solid transparent',
                color: activeTab === tab ? '#92400e' : '#6b7280',
                fontWeight: activeTab === tab ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                marginBottom: '-2px',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'standings' && !isDoubles && (
          <div style={{ overflowX: 'auto', display: 'grid', gap: '0.8rem' }}>
            <h3 style={subheading}>Standings</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  {['Rank', 'Player', 'W', 'L', 'Points'].map(label => (
                    <th key={label} style={tableHeadCell}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings.map(row => (
                  <tr key={row.player.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
                    <td style={tableCell}>{row.rank}</td>
                    <td style={{ ...tableCell, fontWeight: 700 }}>{row.player.firstName} {row.player.lastName}</td>
                    <td style={tableCell}>{row.wins}</td>
                    <td style={tableCell}>{row.losses}</td>
                    <td style={{ ...tableCell, color: '#d97706', fontWeight: 700 }}>{row.points}</td>
                  </tr>
                ))}
                {!loading && standings.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tableCell, textAlign: 'center', color: '#9ca3af' }}>No standings yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'standings' && isDoubles && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ ...subheading, margin: 0 }}>Doubles Standings</h3>
                <p style={{ ...mutedText, fontSize: '0.82rem', margin: '0.2rem 0 0' }}>Points → Wins → Sets → Games</p>
              </div>
              <button
                style={{ ...S.smallOutlineBtn }}
                disabled={doublesStandingsLoading}
                onClick={refreshDoublesStandings}
              >
                {doublesStandingsLoading ? '⏳ Calculating…' : '🔄 Recalculate'}
              </button>
            </div>
            {doublesStandingsLoading ? (
              <p style={mutedText}>Calculating standings…</p>
            ) : doublesStandings.length === 0 ? (
              <p style={{ ...mutedText, fontStyle: 'italic' }}>No doubles matches played yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                  <thead>
                    <tr>
                      {['#', 'Pair', 'W', 'L', 'Sets', 'Games', 'Pts'].map(h => (
                        <th key={h} style={tableHeadCell}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doublesStandings.map(row => {
                      const p1 = currentLeague.players.find((p: Player) => p.id === row.pair.player1Id);
                      const p2 = currentLeague.players.find((p: Player) => p.id === row.pair.player2Id);
                      const p1Name = p1 ? getDisplayName(p1) : row.pair.player1Id;
                      const p2Name = p2 ? getDisplayName(p2) : row.pair.player2Id;
                      return (
                        <tr key={row.pair.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
                          <td style={{ ...tableCell, color: '#92400e', fontWeight: 700 }}>{row.rank}</td>
                          <td style={{ ...tableCell, fontWeight: 600 }}>
                            {row.pair.name}
                            <span style={{ ...mutedText, fontWeight: 400, fontSize: '0.8rem', display: 'block' }}>
                              {p1Name} &amp; {p2Name}
                            </span>
                          </td>
                          <td style={{ ...tableCell, color: '#16a34a', fontWeight: 600 }}>{row.wins}</td>
                          <td style={{ ...tableCell, color: '#dc2626' }}>{row.losses}</td>
                          <td style={tableCell}>{row.sets_won ?? 0}</td>
                          <td style={tableCell}>{row.games_won ?? 0}</td>
                          <td style={{ ...tableCell, color: '#d97706', fontWeight: 700 }}>{row.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <h3 style={subheading}>Match Results</h3>
            {acceptedResults.length === 0 ? (
              <p style={mutedText}>No matches yet.</p>
            ) : (
              acceptedResults.map(({ match, winnerId, isUpset, winnerLog, loserLog }) => {
                const isDoubleMatch = match.matchType === 'doubles';

                // ── Doubles match ──────────────────────────────────
                if (isDoubleMatch) {
                  const t1ids = match.team1PlayerIds ?? [];
                  const t2ids = match.team2PlayerIds ?? [];
                  const pName = (id: string) => {
                    const p = currentLeague.players.find(pl => pl.id === id);
                    return p ? getDisplayName(p) : id;
                  };
                  const pair1 = currentLeague.doublesPairs?.find(p => p.id === match.pair1Id);
                  const pair2 = currentLeague.doublesPairs?.find(p => p.id === match.pair2Id);
                  const t1Label = pair1?.name ?? t1ids.map(pName).join(' / ');
                  const t2Label = pair2?.name ?? t2ids.map(pName).join(' / ');
                  const wt = match.winnerTeam;
                  const t1Won = wt === 'team1';
                  const t2Won = wt === 'team2';
                  return (
                    <div key={match.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.9rem', background: '#fffbeb', display: 'grid', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: '0.3rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: t1Won ? '#166534' : '#78350f' }}>{t1Label}</span>
                            {t1ids.length > 0 && !pair1 && (
                              <span style={{ ...mutedText, fontSize: '0.78rem' }}>({t1ids.map(pName).join(' & ')})</span>
                            )}
                            {pair1 && (
                              <span style={{ ...mutedText, fontSize: '0.78rem' }}>{t1ids.map(pName).join(' & ')}</span>
                            )}
                          </div>
                          <span style={{ ...mutedText, fontSize: '0.8rem', fontWeight: 600 }}>vs</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: t2Won ? '#166534' : '#78350f' }}>{t2Label}</span>
                            {t2ids.length > 0 && !pair2 && (
                              <span style={{ ...mutedText, fontSize: '0.78rem' }}>({t2ids.map(pName).join(' & ')})</span>
                            )}
                            {pair2 && (
                              <span style={{ ...mutedText, fontSize: '0.78rem' }}>{t2ids.map(pName).join(' & ')}</span>
                            )}
                          </div>
                          <p style={{ ...mutedText, marginTop: '0.1rem' }}>{formatScore(match)}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={{ ...mutedText, fontSize: '0.82rem' }}>
                            {match.submittedAt ? new Date(match.submittedAt).toLocaleString() : match.createdAt ? new Date(match.createdAt).toLocaleString() : ''}
                          </span>
                        </div>
                      </div>
                      {wt && (
                        <div style={S.infoBox}>
                          <strong>Winner:</strong> {t1Won ? t1Label : t2Label}
                        </div>
                      )}
                      {match.score?.details && <p style={mutedText}>{match.score.details}</p>}
                    </div>
                  );
                }

                // ── Singles match ──────────────────────────────────
                const submitterName = findLeaguePlayer(currentLeague, match.submitterId, match.submitter);
                const opponentName = findLeaguePlayer(currentLeague, match.opponentId, match.opponent);
                const winnerName = winnerId === match.submitterId ? submitterName : opponentName;
                const loserName = winnerId === match.submitterId ? opponentName : submitterName;
                return (
                  <div key={match.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.9rem', background: '#fffbeb', display: 'grid', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <strong style={{ color: '#78350f' }}>
                          <span style={{ color: winnerId === match.submitterId ? '#166534' : '#78350f' }}>{submitterName}</span>
                          {' vs '}
                          <span style={{ color: winnerId === match.opponentId ? '#166534' : '#78350f' }}>{opponentName}</span>
                        </strong>
                        <p style={mutedText}>{formatScore(match)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {isUpset && <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: '999px', padding: '0.2rem 0.55rem', fontSize: '0.78rem', fontWeight: 700 }}>🔥 Upset</span>}
                        <span style={{ ...mutedText, fontSize: '0.82rem' }}>
                          {match.submittedAt ? new Date(match.submittedAt).toLocaleString() : match.createdAt ? new Date(match.createdAt).toLocaleString() : ''}
                        </span>
                      </div>
                    </div>

                    {winnerId && (
                      <div style={{ ...S.infoBox, display: 'grid', gap: '0.25rem' }}>
                        <div><strong>Winner:</strong> {winnerName}</div>
                        <div>{winnerName}: +{winnerLog?.basePoints ?? 0} pts{(winnerLog?.upsetBonus ?? 0) > 0 ? ` +${winnerLog?.upsetBonus ?? 0} upset bonus` : ''}</div>
                        <div>{loserName}: +{loserLog?.basePoints ?? 0} pts</div>
                      </div>
                    )}

                    {match.score?.details && <p style={mutedText}>{match.score.details}</p>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'breakdown' && (
          <StandingBreakdown league={currentLeague} user={user} />
        )}

        {activeTab === 'rounds' && (
          <RoundsTab league={currentLeague} user={user} matches={matches} />
        )}

        {activeTab === 'schedule' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {!isDoubles && (
              <>
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <h3 style={subheading}>Match Schedule</h3>
                  <p style={{ ...mutedText, fontSize: '0.9rem' }}>Enter scores for any pairing that does not already have an accepted result.</p>
                </div>
                <MatchGrid
                  league={currentLeague}
                  user={user}
                  matches={matches.filter(match => !match.isPlayoff)}
                  isAdmin={isAdmin}
                  onEnterScore={(p1, p2) => setActiveEnterPair({ p1, p2 })}
                />
              </>
            )}

            <PendingMatches
              matches={pendingMatches}
              user={user}
              leagueId={currentLeague.id}
              leagueLookup={{ [currentLeague.id]: currentLeague }}
              isAdmin={isAdmin}
              onActionComplete={async () => { await loadData(); if (isDoubles) refreshDoublesStandings(); }}
            />

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              <h3 style={subheading}>Recent match submissions</h3>
              {matches.length === 0 ? (
                <p style={mutedText}>No matches submitted yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {matches.map(match => (
                    <div key={match.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.9rem', background: '#fffbeb' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ color: '#78350f' }}>
                          {match.matchType === 'doubles'
                            ? `${(match.team1PlayerIds ?? []).map(id => findLeaguePlayer(currentLeague, id)).join(' / ')} vs ${(match.team2PlayerIds ?? []).map(id => findLeaguePlayer(currentLeague, id)).join(' / ')}`
                            : `${findLeaguePlayer(currentLeague, match.submitterId, match.submitter)} vs ${findLeaguePlayer(currentLeague, match.opponentId, match.opponent)}`
                          }
                        </strong>
                        {match.matchType === 'doubles' && (
                          <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '0.15rem 0.5rem', fontWeight: 700 }}>🏸 Doubles</span>
                        )}
                        {match.isPlayoff && <span style={{ fontSize: '0.78rem', color: '#6d28d9' }}>• playoff</span>}
                      </div>
                      <p style={{ ...mutedText, marginTop: '0.35rem' }}>
                        {formatScore(match)}
                        {match.status ? ` • ${match.status}` : ''}
                        {match.submittedAt ? ` • ${new Date(match.submittedAt).toLocaleString()}` : match.createdAt ? ` • ${new Date(match.createdAt).toLocaleString()}` : ''}
                      </p>
                      {match.score?.details && <p style={{ ...mutedText, marginTop: '0.25rem' }}>{match.score.details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'rules' && (
          <LeagueRulesSummary league={currentLeague} />
        )}

        {activeTab === 'doubles' && (
          <DoublesStandings
            league={currentLeague}
            user={user}
            isAdmin={isAdmin}
            onLeagueUpdated={updated => setCurrentLeague(updated)}
          />
        )}

        {activeTab === 'team-formation' && (
          <TeamFormation
            league={currentLeague}
            user={user}
            onLeagueUpdated={updated => { setCurrentLeague(updated); loadData(); }}
          />
        )}

        {(activeTab === 'team-standings' || activeTab === 'team-fixtures' || activeTab === 'team-individual') && (
          <TeamStandings
            league={currentLeague}
            user={user}
            isAdmin={isAdmin}
            view={activeTab === 'team-fixtures' ? 'fixtures' : activeTab === 'team-individual' ? 'individual' : 'teams'}
          />
        )}
      </div>

      {(currentLeague.status === 'playoffs' || currentLeague.status === 'completed') && (
        <PlayoffBracket
          league={currentLeague}
          user={user}
          standings={standings}
          isAdmin={isAdmin}
          onRefresh={loadData}
        />
      )}

      {showCoinFlip && (
        <CoinFlipModal
          players={currentLeague.players || []}
          onClose={() => setShowCoinFlip(false)}
        />
      )}

      {(activeEnterPair || showSubmitMatch) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => { setActiveEnterPair(null); setShowSubmitMatch(false); }}
        >
          <div style={{ width: '100%', maxWidth: 680, maxHeight: '100%', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <SubmitMatch
              league={currentLeague}
              user={user}
              prePlayer1={activeEnterPair?.p1}
              prePlayer2={activeEnterPair?.p2}
              onCancel={() => { setActiveEnterPair(null); setShowSubmitMatch(false); }}
              onSubmitted={() => {
                setActiveEnterPair(null);
                setShowSubmitMatch(false);
                setActiveTab('schedule');
                loadData();
              }}
            />
          </div>
        </div>
      )}

      {showSubmitDoubles && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowSubmitDoubles(false)}
        >
          <div style={{ width: '100%', maxWidth: 680, maxHeight: '100%', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <SubmitDoublesMatch
              league={currentLeague}
              user={user}
              onCancel={() => setShowSubmitDoubles(false)}
              onSubmitted={() => {
                setShowSubmitDoubles(false);
                setActiveTab('schedule');
                loadData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default LeagueStandings;
