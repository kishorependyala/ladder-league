import { useCallback, useEffect, useState } from 'react';
import { getDisplayName, getTeamFixtures, getTeamStandings, teamRecomputeFixture, teamTagMatch, type League, type TeamIndividualRow, type TeamLeagueFixture, type TeamLeagueTeam, type TeamStandingsRow, type User } from '../api';
import { S, mutedText, subheading, tableCell, tableHeadCell } from '../theme';

type Props = {
  league: League;
  user: User;
  isAdmin: boolean;
};

type Tab = 'teams' | 'fixtures' | 'individual';

export default function TeamStandings({ league, user, isAdmin }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('teams');
  const [teamStandings, setTeamStandings] = useState<TeamStandingsRow[]>([]);
  const [individualStandings, setIndividualStandings] = useState<TeamIndividualRow[]>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, TeamLeagueTeam>>({});
  const [fixtures, setFixtures] = useState<TeamLeagueFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tagMatchId, setTagMatchId] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [st, fx] = await Promise.all([getTeamStandings(league.id), getTeamFixtures(league.id)]);
      setTeamStandings(st.teamStandings ?? []);
      setIndividualStandings(st.individualStandings ?? []);
      setTeamsMap(st.teams ?? {});
      setFixtures(fx.fixtures ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load team standings');
    }
    setLoading(false);
  }, [league.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleTagMatch = async (fixtureId: string) => {
    const mid = (tagMatchId[fixtureId] || '').trim();
    if (!mid) return;
    setBusy(fixtureId); setMsg('');
    try {
      const res = await teamTagMatch(league.id, fixtureId, mid, user.phone);
      if (!res.success) throw new Error(res.message);
      setMsg('Match tagged ✓'); setTagMatchId(prev => ({ ...prev, [fixtureId]: '' }));
      await loadAll();
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Error'); }
    setBusy(null);
  };

  const handleRecompute = async (fixtureId: string) => {
    setBusy(fixtureId); setMsg('');
    try {
      const res = await teamRecomputeFixture(league.id, fixtureId, user.phone);
      if (!res.success) throw new Error(res.message);
      setMsg('Fixture recomputed ✓'); await loadAll();
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Error'); }
    setBusy(null);
  };

  const tabBtn = (tab: Tab, label: string) => (
    <button key={tab} onClick={() => setActiveTab(tab)} style={{
      padding: '0.7rem 1rem', background: 'none', border: 'none',
      borderBottom: activeTab === tab ? '3px solid #f59e0b' : '3px solid transparent',
      color: activeTab === tab ? '#92400e' : '#6b7280',
      fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.9rem', cursor: 'pointer',
      marginBottom: '-2px', whiteSpace: 'nowrap',
    }}>{label}</button>
  );

  const playerMap = Object.fromEntries(league.players.map(p => [p.id, p]));

  if (loading) return <p style={mutedText}>Loading team standings…</p>;
  if (error) return <div style={S.errorBox}>{error}</div>;

  const byRound: Record<number, TeamLeagueFixture[]> = {};
  fixtures.forEach(f => { (byRound[f.round] = byRound[f.round] || []).push(f); });

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <h3 style={subheading}>🏆 Team League</h3>

      {msg && <div style={S.infoBox}>{msg}</div>}

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid #fed7aa', overflowX: 'auto' }}>
        {tabBtn('teams', '📊 Team Standings')}
        {tabBtn('fixtures', '📅 Fixtures')}
        {tabBtn('individual', '👤 Individual')}
      </div>

      {/* ── Team Standings ── */}
      {activeTab === 'teams' && (
        <div style={{ overflowX: 'auto' }}>
          {teamStandings.length === 0 ? (
            <p style={{ ...mutedText, fontStyle: 'italic' }}>No completed fixtures yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead><tr>
                {['#', 'Team', 'Players', 'W', 'D', 'L', 'MP±', 'Pts'].map(h => <th key={h} style={tableHeadCell}>{h}</th>)}
              </tr></thead>
              <tbody>
                {teamStandings.map(row => (
                  <tr key={row.team.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
                    <td style={{ ...tableCell, color: '#92400e', fontWeight: 700 }}>{row.rank}</td>
                    <td style={{ ...tableCell, fontWeight: 700 }}>{row.team.name}</td>
                    <td style={{ ...tableCell, fontSize: '0.8rem', color: '#6b7280' }}>
                      {row.team.playerIds.map(id => getDisplayName(playerMap[id] ?? { id, firstName: id, lastName: '', phone: '' })).join(', ')}
                    </td>
                    <td style={{ ...tableCell, color: '#16a34a', fontWeight: 600 }}>{row.wins}</td>
                    <td style={tableCell}>{row.draws}</td>
                    <td style={{ ...tableCell, color: '#dc2626' }}>{row.losses}</td>
                    <td style={tableCell}>{row.matchPtsFor}–{row.matchPtsAgainst}</td>
                    <td style={{ ...tableCell, color: '#d97706', fontWeight: 700 }}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Fixtures ── */}
      {activeTab === 'fixtures' && (
        <div style={{ display: 'grid', gap: '1.2rem' }}>
          {Object.keys(byRound).sort((a, b) => +a - +b).map(round => (
            <div key={round}>
              <h4 style={{ color: '#92400e', fontWeight: 700, margin: '0 0 0.6rem' }}>Round {round}</h4>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {byRound[+round].map(f => {
                  const t1 = teamsMap[f.team1Id];
                  const t2 = teamsMap[f.team2Id];
                  const isCompleted = f.status === 'completed';
                  return (
                    <div key={f.id} style={{ border: `2px solid ${isCompleted ? '#86efac' : '#fed7aa'}`, borderRadius: '0.85rem', padding: '0.9rem', background: isCompleted ? '#f0fdf4' : '#fffbeb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#78350f' }}>
                          {t1?.name ?? f.team1Id} <span style={{ color: '#d97706' }}>{f.team1Points}</span>
                          {' — '}
                          <span style={{ color: '#d97706' }}>{f.team2Points}</span> {t2?.name ?? f.team2Id}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: isCompleted ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                          {isCompleted ? (f.winnerId ? `${teamsMap[f.winnerId]?.name ?? f.winnerId} wins` : 'Draw') : 'Pending'}
                        </span>
                      </div>

                      {/* Matches in this fixture */}
                      {(f.matches ?? []).length > 0 && (
                        <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.25rem' }}>
                          {(f.matches ?? []).map(m => (
                            <div key={m.id} style={{ fontSize: '0.82rem', color: '#6b7280', padding: '0.2rem 0.4rem', background: '#fff', borderRadius: '0.4rem' }}>
                              {m.matchType === 'doubles'
                                ? `Doubles: ${(m.team1PlayerIds ?? []).map((id: string) => playerMap[id] ? getDisplayName(playerMap[id]) : id).join('+')} vs ${(m.team2PlayerIds ?? []).map((id: string) => playerMap[id] ? getDisplayName(playerMap[id]) : id).join('+')}`
                                : `${playerMap[m.submitterId ?? ''] ? getDisplayName(playerMap[m.submitterId ?? '']) : m.submitterId} vs ${playerMap[m.opponentId ?? ''] ? getDisplayName(playerMap[m.opponentId ?? '']) : m.opponentId}`
                              }
                              {' '}<span style={{ color: m.status === 'accepted' ? '#16a34a' : '#f59e0b' }}>({m.status})</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Admin: tag a match or recompute */}
                      {isAdmin && (
                        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            value={tagMatchId[f.id] || ''}
                            onChange={e => setTagMatchId(prev => ({ ...prev, [f.id]: e.target.value }))}
                            placeholder="Match ID to tag…"
                            style={{ ...S.inp, fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: 180 }}
                          />
                          <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} disabled={busy === f.id} onClick={() => handleTagMatch(f.id)}>
                            Tag match
                          </button>
                          <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} disabled={busy === f.id} onClick={() => handleRecompute(f.id)}>
                            🔄 Recompute
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {fixtures.length === 0 && <p style={{ ...mutedText, fontStyle: 'italic' }}>No fixtures generated yet.</p>}
        </div>
      )}

      {/* ── Individual Leaderboard ── */}
      {activeTab === 'individual' && (
        <div style={{ overflowX: 'auto' }}>
          {individualStandings.length === 0 ? (
            <p style={{ ...mutedText, fontStyle: 'italic' }}>No individual results yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
              <thead><tr>
                {['#', 'Player', 'Team', 'W', 'L', 'Pts'].map(h => <th key={h} style={tableHeadCell}>{h}</th>)}
              </tr></thead>
              <tbody>
                {individualStandings.map(row => (
                  <tr key={row.player.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
                    <td style={{ ...tableCell, color: '#92400e', fontWeight: 700 }}>{row.rank}</td>
                    <td style={{ ...tableCell, fontWeight: 600 }}>{getDisplayName(row.player)}</td>
                    <td style={{ ...tableCell, color: '#6b7280' }}>{teamsMap[row.teamId]?.name ?? row.teamId}</td>
                    <td style={{ ...tableCell, color: '#16a34a', fontWeight: 600 }}>{row.wins}</td>
                    <td style={{ ...tableCell, color: '#dc2626' }}>{row.losses}</td>
                    <td style={{ ...tableCell, color: '#d97706', fontWeight: 700 }}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
