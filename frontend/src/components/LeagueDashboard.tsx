import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllLeagues, getMyRoles, getSports, joinLeague, type League, type RolesResponse, type Sport, type User } from '../api';
import { S, mutedText, sectionTitle, subheading } from '../theme';
import LeagueList from './LeagueList';

type LeagueDashboardProps = {
  user: User;
  onOpenLeague: (league: League) => void;
  onOpenSuperAdmin: () => void;
};

function LeagueDashboard({ user, onOpenLeague }: LeagueDashboardProps) {
  const [sports, setSports] = useState<Sport[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningLeagueId, setJoiningLeagueId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sportsData, leaguesData, rolesData] = await Promise.all([
        getSports(),
        getAllLeagues(),
        getMyRoles(user.phone),
      ]);
      setSports(Array.isArray(sportsData) ? sportsData : []);
      setLeagues(Array.isArray(leaguesData) ? leaguesData : []);
      setRoles(rolesData);

      // auto-open if user is in exactly one active/pre-start league
      const myActive = (leaguesData as League[]).filter(
        l => ['draft', 'active', 'playoffs', 'ranking', 'ranked'].includes(l.status) &&
          l.players.some(p => p.id === user.id || p.phone === user.phone)
      );
      if (myActive.length === 1) {
        onOpenLeague(myActive[0]);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
    }
    setLoading(false);
  }, [user.id, user.phone]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const myLeagues = useMemo(
    () => leagues.filter(league => league.players.some(player => player.id === user.id || player.phone === user.phone)),
    [leagues, user.id, user.phone],
  );

  const joinableLeagues = useMemo(
    () => leagues.filter(
      l => l.status === 'draft' &&
        !l.players.some(p => p.id === user.id || p.phone === user.phone),
    ),
    [leagues, user.id, user.phone],
  );
  const [browseId, setBrowseId] = useState('');

  const rankingNeeded = useMemo(
    () => myLeagues.filter(l => ['draft', 'ranking', 'ranked'].includes(l.status) && !l.stackRanks?.[user.id]),
    [myLeagues, user.id],
  );

  const handleJoinLeague = async (league: League) => {
    setJoiningLeagueId(league.id);
    setError('');
    try {
      const response = await joinLeague(league.id, user.phone);
      await loadDashboard();
      onOpenLeague(response.league);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join league.');
    }
    setJoiningLeagueId(null);
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={sectionTitle}>Welcome back, {user.firstName}</h2>
            <p style={{ ...mutedText, marginTop: '0.3rem' }}>Submit results and keep the ladder moving.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ ...S.infoBox, padding: '0.55rem 0.8rem' }}>{myLeagues.length} joined</span>
          </div>
        </div>
        {error && <div style={S.errorBox}>{error}</div>}
        {loading && <p style={mutedText}>Loading…</p>}
      </div>

      {rankingNeeded.length > 0 && (
        <div style={{ ...S.card, background: '#fffbeb', border: '2px solid #f59e0b', display: 'grid', gap: '0.6rem' }}>
          <p style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>📋 Ranking needed</p>
          {rankingNeeded.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#78350f' }}>{l.name}</span>
              <button style={S.smallBtn} onClick={() => onOpenLeague(l)}>Rank players →</button>
            </div>
          ))}
          <p style={{ ...mutedText, fontSize: '0.8rem' }}>Rank all players from strongest to weakest. The admin will finalize once everyone has submitted.</p>
        </div>
      )}

      <LeagueList
        title="My leagues"
        leagues={myLeagues}
        user={user}
        emptyMessage="You have not joined any leagues yet."
        onOpenLeague={onOpenLeague}
      />

      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <h3 style={subheading}>Browse leagues</h3>
        {joinableLeagues.length === 0 ? (
          <p style={mutedText}>No open leagues to join right now.</p>
        ) : (
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={browseId}
              onChange={e => setBrowseId(e.target.value)}
              style={{ ...S.select, flex: '1 1 200px' }}
            >
              <option value="">— Select a league —</option>
              {joinableLeagues.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.sport})</option>
              ))}
            </select>
            {browseId && (
              <button
                style={S.smallBtn}
                disabled={joiningLeagueId === browseId}
                onClick={() => handleJoinLeague(joinableLeagues.find(l => l.id === browseId)!)}
              >
                {joiningLeagueId === browseId ? 'Joining…' : 'Request to join'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeagueDashboard;
