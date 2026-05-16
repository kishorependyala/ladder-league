import { useCallback, useEffect, useState } from 'react';
import { findLeaguePlayer, getLeague, getLeagueMatches, getLeagueStandings, getMyRoles, getPendingMatches, startPlayoffs, type League, type Match, type Player, type StandingsRow, type User } from '../api';
import { S, mutedText, sectionTitle, statusPill, subheading, tableCell, tableHeadCell } from '../theme';
import MatchGrid from './MatchGrid';
import PendingMatches from './PendingMatches';
import PlayoffBracket from './PlayoffBracket';
import SubmitMatch from './SubmitMatch';

type LeagueStandingsProps = {
  league: League;
  user: User;
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

      <div style={{ ...S.card, overflowX: 'auto', display: 'grid', gap: '0.8rem' }}>
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

      {(currentLeague.status === 'active' || currentLeague.status === 'playoffs' || currentLeague.status === 'completed') && (
        <PlayoffBracket
          league={currentLeague}
          user={user}
          standings={standings}
          isAdmin={isAdmin}
          onRefresh={loadData}
        />
      )}

      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
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
      </div>

      <PendingMatches
        matches={pendingMatches}
        user={user}
        leagueId={currentLeague.id}
        leagueLookup={{ [currentLeague.id]: currentLeague }}
        isAdmin={isAdmin}
        onActionComplete={loadData}
      />

      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
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
