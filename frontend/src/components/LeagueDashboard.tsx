import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllLeagues, getMyRoles, getSports, isLeagueJoinable, joinLeague, type League, type RolesResponse, type Sport, type User } from '../api';
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
  const [joinError, setJoinError] = useState('');

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

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const myLeagues = useMemo(
    () => leagues.filter(league => league.players.some(player => player.id === user.id || player.phone === user.phone)),
    [leagues, user.id, user.phone],
  );

  // All leagues the user is NOT in, grouped by sport
  const joinableBySport = useMemo(() => {
    const notMine = leagues.filter(
      l => !l.players.some(p => p.id === user.id || p.phone === user.phone)
    );
    const map: Record<string, { open: League[]; closed: League[] }> = {};
    for (const sport of sports) {
      const sportLeagues = notMine.filter(l => l.sport === sport.id);
      map[sport.id] = {
        open: sportLeagues.filter(isLeagueJoinable),
        closed: sportLeagues.filter(l => !isLeagueJoinable(l)),
      };
    }
    return map;
  }, [leagues, sports, user.id, user.phone]);

  // Per-sport selected league id
  const [selectedBySport, setSelectedBySport] = useState<Record<string, string>>({});

  const rankingNeeded = useMemo(
    () => myLeagues.filter(l => ['draft', 'ranking', 'ranked'].includes(l.status) && !l.stackRanks?.[user.id]),
    [myLeagues, user.id],
  );

  const handleJoinLeague = async (league: League) => {
    setJoiningLeagueId(league.id);
    setJoinError('');
    try {
      const response = await joinLeague(league.id, user.phone);
      if (!response.success) { setJoinError(response.message || 'Could not join league.'); }
      else { await loadDashboard(); onOpenLeague(response.league); }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join league.');
    }
    setJoiningLeagueId(null);
  };

  // Determine if any sport has leagues worth showing in Browse
  const hasBrowseable = sports.some(s => {
    const g = joinableBySport[s.id];
    return g && (g.open.length > 0 || g.closed.length > 0);
  });

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={sectionTitle}>Welcome back, {user.firstName}</h2>
            <p style={{ ...mutedText, marginTop: '0.3rem' }}>Submit results and keep the ladder moving.</p>
          </div>
          <span style={{ ...S.infoBox, padding: '0.55rem 0.8rem' }}>{myLeagues.length} joined</span>
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

      {/* Browse leagues — one row per sport */}
      <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
        <h3 style={subheading}>Browse leagues</h3>
        {joinError && <div style={S.errorBox}>{joinError}</div>}

        {!hasBrowseable ? (
          <p style={mutedText}>No leagues available to join right now.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {sports.map(sport => {
              const group = joinableBySport[sport.id] ?? { open: [], closed: [] };
              const allForSport = [...group.open, ...group.closed];
              if (allForSport.length === 0) return null;
              const hasOpen = group.open.length > 0;
              const selectedId = selectedBySport[sport.id] ?? '';
              const selectedLeague = group.open.find(l => l.id === selectedId) ?? null;

              return (
                <div key={sport.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.75rem', background: hasOpen ? '#fffbeb' : '#f9fafb', borderRadius: '0.85rem', border: `1px solid ${hasOpen ? '#fde68a' : '#e5e7eb'}` }}>
                  {/* Sport label */}
                  <div style={{ minWidth: 90 }}>
                    <span style={{ fontWeight: 700, color: hasOpen ? '#78350f' : '#9ca3af', fontSize: '0.9rem' }}>
                      {sport.label}
                    </span>
                    {!hasOpen && group.closed.length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                        {group.closed.length} closed
                      </div>
                    )}
                  </div>

                  {/* Dropdown */}
                  <select
                    value={selectedId}
                    disabled={!hasOpen}
                    onChange={e => setSelectedBySport(prev => ({ ...prev, [sport.id]: e.target.value }))}
                    style={{ ...S.inp, flex: '1 1 160px', background: hasOpen ? '#fff' : '#f3f4f6', color: hasOpen ? '#1f2937' : '#9ca3af', cursor: hasOpen ? 'pointer' : 'not-allowed', opacity: hasOpen ? 1 : 0.6 }}
                  >
                    <option value="">{hasOpen ? `— Select a league (${group.open.length} open) —` : 'No open leagues'}</option>
                    {group.open.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name} · {l.status}{l.rules?.allowLateJoin && l.status !== 'draft' ? ' (late join)' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Join button */}
                  <button
                    style={{ ...S.smallBtn, opacity: selectedLeague ? 1 : 0.4 }}
                    disabled={!selectedLeague || joiningLeagueId === selectedId}
                    onClick={() => selectedLeague && handleJoinLeague(selectedLeague)}
                  >
                    {joiningLeagueId === selectedId ? 'Joining…' : '→ Join'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeagueDashboard;
