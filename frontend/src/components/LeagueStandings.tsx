import { useCallback, useEffect, useMemo, useState } from 'react';
import { findLeaguePlayer, getLeague, getLeagueMatches, getLeagueStandings, getMyRoles, getPendingMatches, startPlayoffs, type League, type Match, type MatchLogEntry, type Player, type StandingsRow, type User } from '../api';
import { S, mutedText, sectionTitle, statusPill, subheading, tableCell, tableHeadCell } from '../theme';
import MatchGrid from './MatchGrid';
import PendingMatches from './PendingMatches';
import PlayoffBracket from './PlayoffBracket';
import SubmitMatch from './SubmitMatch';

type LeagueStandingsProps = {
  league: League;
  user: User;
};

type StandingsTab = 'standings' | 'results' | 'schedule';

type MatchResultCard = {
  match: Match;
  winnerId?: string;
  loserId?: string;
  isUpset: boolean;
  winnerLog?: MatchLogEntry;
  loserLog?: MatchLogEntry;
};

function LeagueStandings({ league, user }: LeagueStandingsProps) {
  const [currentLeague, setCurrentLeague] = useState(league);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [activeEnterPair, setActiveEnterPair] = useState<{ p1: Player; p2: Player } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startingPlayoffs, setStartingPlayoffs] = useState(false);
  const [error, setError] = useState('');
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
      const [roles, leagueResponse, standingsResponse, leagueMatches, pending] = await Promise.all([
        getMyRoles(user.phone),
        getLeague(league.id),
        getLeagueStandings(league.id),
        getLeagueMatches(league.id),
        getPendingMatches(user.id),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load league standings.');
    }
    setLoading(false);
  }, [league, user.id, user.phone]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartPlayoffs = async () => {
    setStartingPlayoffs(true);
    setError('');
    try {
      const response = await startPlayoffs(currentLeague.id, user.phone);
      if (!response.success || !response.league) {
        throw new Error(response.message || 'Could not start playoffs.');
      }
      setCurrentLeague(response.league);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start playoffs.');
    }
    setStartingPlayoffs(false);
  };

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
            <p style={{ ...mutedText, marginTop: '0.3rem' }}>{currentLeague.sport} league</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={statusPill(currentLeague.status)}>{currentLeague.status}</span>
            {currentLeague.status === 'active' && isAdmin && (
              <button style={S.smallBtn} onClick={handleStartPlayoffs} disabled={startingPlayoffs || loading}>
                {startingPlayoffs ? 'Starting…' : '🏆 Start Playoffs'}
              </button>
            )}
          </div>
        </div>
        {error && <div style={S.errorBox}>{error}</div>}
        {loading && <p style={mutedText}>Loading standings…</p>}
      </div>

      <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid #fed7aa', overflowX: 'auto' }}>
          {([
            ['standings', '📊 Standings'],
            ['results', '🎯 Match Results'],
            ['schedule', '📋 Schedule & Pending'],
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

        {activeTab === 'standings' && (
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

        {activeTab === 'results' && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <h3 style={subheading}>Match Results</h3>
            {acceptedResults.length === 0 ? (
              <p style={mutedText}>No matches yet.</p>
            ) : (
              acceptedResults.map(({ match, winnerId, isUpset, winnerLog, loserLog }) => {
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

        {activeTab === 'schedule' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
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

            <PendingMatches
              matches={pendingMatches}
              user={user}
              leagueId={currentLeague.id}
              leagueLookup={{ [currentLeague.id]: currentLeague }}
              isAdmin={isAdmin}
              onActionComplete={loadData}
            />

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              <h3 style={subheading}>Recent match submissions</h3>
              {matches.length === 0 ? (
                <p style={mutedText}>No matches submitted yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {matches.map(match => (
                    <div key={match.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.9rem', background: '#fffbeb' }}>
                      <strong style={{ color: '#78350f' }}>
                        {findLeaguePlayer(currentLeague, match.submitterId, match.submitter)} vs {findLeaguePlayer(currentLeague, match.opponentId, match.opponent)}
                        {match.isPlayoff && <span style={{ fontSize: '0.78rem', color: '#6d28d9', marginLeft: '0.45rem' }}>• playoff</span>}
                      </strong>
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
      </div>

      {(currentLeague.status === 'active' || currentLeague.status === 'playoffs' || currentLeague.status === 'completed') && (
        <PlayoffBracket
          league={currentLeague}
          user={user}
          standings={standings}
          isAdmin={isAdmin}
          onRefresh={loadData}
        />
      )}

      {activeEnterPair && (
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
          onClick={() => setActiveEnterPair(null)}
        >
          <div style={{ width: '100%', maxWidth: 680, maxHeight: '100%', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <SubmitMatch
              league={currentLeague}
              user={user}
              prePlayer1={activeEnterPair.p1}
              prePlayer2={activeEnterPair.p2}
              onCancel={() => setActiveEnterPair(null)}
              onSubmitted={() => {
                setActiveEnterPair(null);
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
