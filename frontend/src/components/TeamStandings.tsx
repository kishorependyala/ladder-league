import { useCallback, useEffect, useState } from 'react';
import { getDisplayName, getTeamFixtures, getTeamStandings, teamEnterFixtureScores, teamRecomputeFixture, type League, type Player, type TeamIndividualRow, type TeamLeagueFixture, type TeamLeagueTeam, type TeamMatchEntry, type TeamStandingsRow, type User } from '../api';
import { S, mutedText, subheading, tableCell, tableHeadCell } from '../theme';

type Props = {
  league: League;
  user: User;
  isAdmin: boolean;
};

type Tab = 'teams' | 'fixtures' | 'individual';

// ── Score entry types ──────────────────────────────────────────────
interface SetScore { t1: number; t2: number }

interface SinglesEntry {
  type: 'singles';
  t1PlayerId: string;
  t2PlayerId: string;
  sets: SetScore[];
}

interface DoublesEntry {
  type: 'doubles';
  t1PlayerIds: [string, string];
  t2PlayerIds: [string, string];
  sets: SetScore[];
}

type MatchEntryDraft = SinglesEntry | DoublesEntry;

function emptySet(): SetScore { return { t1: 0, t2: 0 }; }

function makeDraftEntries(numSingles: number, numDoubles: number): MatchEntryDraft[] {
  const s: MatchEntryDraft[] = Array.from({ length: numSingles }, () => ({ type: 'singles' as const, t1PlayerId: '', t2PlayerId: '', sets: [emptySet()] }));
  const d: MatchEntryDraft[] = Array.from({ length: numDoubles }, () => ({ type: 'doubles' as const, t1PlayerIds: ['', ''] as [string, string], t2PlayerIds: ['', ''] as [string, string], sets: [emptySet()] }));
  return [...s, ...d];
}

function validateEntries(entries: MatchEntryDraft[], t1Players: string[], t2Players: string[]): string | null {
  const singlesT1: string[] = [], singlesT2: string[] = [];
  const doublesT1: string[] = [], doublesT2: string[] = [];
  for (const e of entries) {
    if (e.type === 'singles') {
      if (!e.t1PlayerId || !e.t2PlayerId) return 'Select players for all singles matches.';
      if (!t1Players.includes(e.t1PlayerId)) return `Selected player is not on Team 1.`;
      if (!t2Players.includes(e.t2PlayerId)) return `Selected player is not on Team 2.`;
      if (singlesT1.includes(e.t1PlayerId)) return `A Team 1 player can't play singles twice.`;
      if (singlesT2.includes(e.t2PlayerId)) return `A Team 2 player can't play singles twice.`;
      singlesT1.push(e.t1PlayerId);
      singlesT2.push(e.t2PlayerId);
    } else {
      if (e.t1PlayerIds.some(id => !id) || e.t2PlayerIds.some(id => !id)) return 'Select all players for doubles matches.';
      if (new Set(e.t1PlayerIds).size < 2) return 'Pick 2 different players for a doubles team.';
      if (new Set(e.t2PlayerIds).size < 2) return 'Pick 2 different players for a doubles team.';
      const k1 = [...e.t1PlayerIds].sort().join(',');
      const k2 = [...e.t2PlayerIds].sort().join(',');
      if (doublesT1.includes(k1)) return 'Same doubles pair from Team 1 plays twice.';
      if (doublesT2.includes(k2)) return 'Same doubles pair from Team 2 plays twice.';
      doublesT1.push(k1);
      doublesT2.push(k2);
    }
    if (e.sets.length === 0) return 'Enter at least one set score.';
  }
  return null;
}

// ── Small score entry helpers ──────────────────────────────────────
function SetsEditor({ sets, onChange }: { sets: SetScore[]; onChange: (s: SetScore[]) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {sets.map((s, i) => (
        <span key={i} style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', background: '#fff', border: '1px solid #fde68a', borderRadius: '0.4rem', padding: '0.15rem 0.3rem' }}>
          <input type="number" min={0} max={99} value={s.t1} style={{ width: 38, border: 'none', background: 'transparent', textAlign: 'center', fontSize: '0.9rem' }}
            onChange={e => { const next = sets.map((x, j) => j === i ? { ...x, t1: parseInt(e.target.value) || 0 } : x); onChange(next); }} />
          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>–</span>
          <input type="number" min={0} max={99} value={s.t2} style={{ width: 38, border: 'none', background: 'transparent', textAlign: 'center', fontSize: '0.9rem' }}
            onChange={e => { const next = sets.map((x, j) => j === i ? { ...x, t2: parseInt(e.target.value) || 0 } : x); onChange(next); }} />
          {sets.length > 1 && <button onClick={() => onChange(sets.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.7rem', padding: 0 }}>✕</button>}
        </span>
      ))}
      <button onClick={() => onChange([...sets, emptySet()])} style={{ background: 'none', border: '1px dashed #d97706', borderRadius: '0.3rem', color: '#d97706', cursor: 'pointer', fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>+Set</button>
    </div>
  );
}

function playerSel(players: Player[], value: string, onChange: (v: string) => void, placeholder: string, exclude: string[] = []) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem', border: '1px solid #fde68a', borderRadius: '0.4rem', background: '#fffbeb', color: '#78350f', maxWidth: 140 }}>
      <option value="">{placeholder}</option>
      {players.filter(p => !exclude.includes(p.id) || p.id === value).map(p => (
        <option key={p.id} value={p.id}>{getDisplayName(p)}</option>
      ))}
    </select>
  );
}

export default function TeamStandings({ league, user, isAdmin }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('teams');
  const [teamStandings, setTeamStandings] = useState<TeamStandingsRow[]>([]);
  const [individualStandings, setIndividualStandings] = useState<TeamIndividualRow[]>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, TeamLeagueTeam>>({});
  const [fixtures, setFixtures] = useState<TeamLeagueFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // Score entry state per fixture
  const [entryOpen, setEntryOpen] = useState<Record<string, boolean>>({});
  const [entryDraft, setEntryDraft] = useState<Record<string, MatchEntryDraft[]>>({});
  const [entryError, setEntryError] = useState<Record<string, string>>({});

  const settings = (league as any).teamLeagueSettings ?? {};
  const singlesPerFixture: number = settings.singlesPerFixture ?? 2;
  const doublesPerFixture: number = settings.doublesPerFixture ?? 1;

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

  const openEntry = (fixtureId: string) => {
    if (!entryDraft[fixtureId]) {
      setEntryDraft(prev => ({ ...prev, [fixtureId]: makeDraftEntries(singlesPerFixture, doublesPerFixture) }));
    }
    setEntryOpen(prev => ({ ...prev, [fixtureId]: !prev[fixtureId] }));
    setEntryError(prev => ({ ...prev, [fixtureId]: '' }));
  };

  const updateEntry = (fixtureId: string, idx: number, patch: Partial<MatchEntryDraft>) => {
    setEntryDraft(prev => {
      const next = [...(prev[fixtureId] ?? [])];
      next[idx] = { ...next[idx], ...patch } as MatchEntryDraft;
      return { ...prev, [fixtureId]: next };
    });
    setEntryError(prev => ({ ...prev, [fixtureId]: '' }));
  };

  const handleSubmitScores = async (f: TeamLeagueFixture) => {
    const t1 = teamsMap[f.team1Id];
    const t2 = teamsMap[f.team2Id];
    const entries = entryDraft[f.id] ?? [];
    const validErr = validateEntries(entries, t1?.playerIds ?? [], t2?.playerIds ?? []);
    if (validErr) { setEntryError(prev => ({ ...prev, [f.id]: validErr })); return; }

    setBusy(f.id); setMsg('');
    try {
      const payload: TeamMatchEntry[] = entries.map(e => {
        if (e.type === 'singles') return { type: 'singles', team1PlayerIds: [e.t1PlayerId], team2PlayerIds: [e.t2PlayerId], sets: e.sets };
        return { type: 'doubles', team1PlayerIds: e.t1PlayerIds, team2PlayerIds: e.t2PlayerIds, sets: e.sets };
      });
      const res = await teamEnterFixtureScores(league.id, f.id, user.phone, payload);
      if (!res.success) throw new Error(res.message);
      setMsg(`✅ ${res.createdMatchIds?.length ?? 0} matches recorded.`);
      setEntryOpen(prev => ({ ...prev, [f.id]: false }));
      setEntryDraft(prev => ({ ...prev, [f.id]: makeDraftEntries(singlesPerFixture, doublesPerFixture) }));
      await loadAll();
    } catch (err) {
      setEntryError(prev => ({ ...prev, [f.id]: err instanceof Error ? err.message : 'Error submitting' }));
    }
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
                  const t1Players = (t1?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
                  const t2Players = (t2?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
                  const isCompleted = f.status === 'completed';
                  const entries = entryDraft[f.id] ?? [];
                  const isOpen = entryOpen[f.id] && isAdmin;

                  return (
                    <div key={f.id} style={{ border: `2px solid ${isCompleted ? '#86efac' : '#fed7aa'}`, borderRadius: '0.85rem', padding: '0.9rem', background: isCompleted ? '#f0fdf4' : '#fffbeb' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#78350f' }}>
                          {t1?.name ?? f.team1Id} <span style={{ color: '#d97706' }}>{f.team1Points}</span>
                          {' — '}
                          <span style={{ color: '#d97706' }}>{f.team2Points}</span> {t2?.name ?? f.team2Id}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: isCompleted ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                            {isCompleted ? (f.winnerId ? `${teamsMap[f.winnerId]?.name ?? f.winnerId} wins` : 'Draw') : 'Pending'}
                          </span>
                          {isAdmin && !isCompleted && (
                            <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} onClick={() => openEntry(f.id)}>
                              {isOpen ? '✕ Cancel' : '📝 Enter scores'}
                            </button>
                          )}
                          {isAdmin && isCompleted && (
                            <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} onClick={() => openEntry(f.id)}>
                              {isOpen ? '✕ Cancel' : '✏️ Edit scores'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Existing matches summary */}
                      {(f.matches ?? []).length > 0 && (
                        <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.2rem' }}>
                          {(f.matches ?? []).map(m => (
                            <div key={m.id} style={{ fontSize: '0.82rem', color: '#6b7280', padding: '0.2rem 0.5rem', background: '#fff', borderRadius: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: m.matchType === 'doubles' ? '#7c3aed' : '#0369a1', fontWeight: 600 }}>
                                {m.matchType === 'doubles' ? '2s' : '1s'}
                              </span>
                              {m.matchType === 'doubles'
                                ? <>{(m.team1PlayerIds ?? []).map((id: string) => playerMap[id] ? getDisplayName(playerMap[id]) : id).join('+')} <span style={{color:'#d97706'}}>vs</span> {(m.team2PlayerIds ?? []).map((id: string) => playerMap[id] ? getDisplayName(playerMap[id]) : id).join('+')}</>
                                : <>{playerMap[m.submitterId ?? ''] ? getDisplayName(playerMap[m.submitterId ?? '']) : m.submitterId} <span style={{color:'#d97706'}}>vs</span> {playerMap[m.opponentId ?? ''] ? getDisplayName(playerMap[m.opponentId ?? '']) : m.opponentId}</>
                              }
                              {m.score?.sets && m.score.sets.length > 0 && (
                                <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#374151' }}>
                                  {m.score.sets.map((s: any) => `${s.me}–${s.opp}`).join(', ')}
                                </span>
                              )}
                              <span style={{ color: m.status === 'accepted' ? '#16a34a' : '#f59e0b', fontSize: '0.72rem' }}>({m.status})</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Inline score entry form ── */}
                      {isOpen && (
                        <div style={{ marginTop: '0.8rem', border: '1px solid #fde68a', borderRadius: '0.65rem', padding: '0.85rem', background: '#fff', display: 'grid', gap: '0.8rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.78rem', fontWeight: 700, color: '#92400e', textAlign: 'center' }}>
                            <span>← {t1?.name}</span>
                            <span>{t2?.name} →</span>
                          </div>

                          {entries.map((e, idx) => {
                            const isSingles = e.type === 'singles';
                            const label = isSingles ? `Singles ${entries.slice(0, idx).filter(x => x.type === 'singles').length + 1}` : `Doubles ${entries.slice(0, idx).filter(x => x.type === 'doubles').length + 1}`;

                            // compute selected players to show in winner label
                            const usedT1Singles = entries.filter((x, i) => i !== idx && x.type === 'singles').map(x => (x as SinglesEntry).t1PlayerId);
                            const usedT2Singles = entries.filter((x, i) => i !== idx && x.type === 'singles').map(x => (x as SinglesEntry).t2PlayerId);

                            return (
                              <div key={idx} style={{ border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', background: isSingles ? '#fffbeb' : '#f5f3ff' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isSingles ? '#92400e' : '#7c3aed', marginBottom: '0.4rem' }}>{label}</div>
                                <div style={{ display: 'grid', gap: '0.35rem' }}>
                                  {/* Player selection */}
                                  {isSingles ? (
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                      {playerSel(t1Players, (e as SinglesEntry).t1PlayerId, v => updateEntry(f.id, idx, { t1PlayerId: v } as any), 'Team 1 player', usedT1Singles)}
                                      <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>vs</span>
                                      {playerSel(t2Players, (e as SinglesEntry).t2PlayerId, v => updateEntry(f.id, idx, { t2PlayerId: v } as any), 'Team 2 player', usedT2Singles)}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {playerSel(t1Players, (e as DoublesEntry).t1PlayerIds[0], v => updateEntry(f.id, idx, { t1PlayerIds: [v, (e as DoublesEntry).t1PlayerIds[1]] } as any), 'T1 P1')}
                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>+</span>
                                        {playerSel(t1Players, (e as DoublesEntry).t1PlayerIds[1], v => updateEntry(f.id, idx, { t1PlayerIds: [(e as DoublesEntry).t1PlayerIds[0], v] } as any), 'T1 P2', [(e as DoublesEntry).t1PlayerIds[0]])}
                                        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>vs</span>
                                        {playerSel(t2Players, (e as DoublesEntry).t2PlayerIds[0], v => updateEntry(f.id, idx, { t2PlayerIds: [v, (e as DoublesEntry).t2PlayerIds[1]] } as any), 'T2 P1')}
                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>+</span>
                                        {playerSel(t2Players, (e as DoublesEntry).t2PlayerIds[1], v => updateEntry(f.id, idx, { t2PlayerIds: [(e as DoublesEntry).t2PlayerIds[0], v] } as any), 'T2 P2', [(e as DoublesEntry).t2PlayerIds[0]])}
                                      </div>
                                    </div>
                                  )}
                                  {/* Sets */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: 32 }}>Sets:</span>
                                    <SetsEditor sets={e.sets} onChange={sets => updateEntry(f.id, idx, { sets } as any)} />
                                  </div>
                                  {/* Winner preview */}
                                  {e.sets.length > 0 && (() => {
                                    const t1w = e.sets.filter(s => s.t1 > s.t2).length;
                                    const t2w = e.sets.filter(s => s.t2 > s.t1).length;
                                    if (t1w === 0 && t2w === 0) return null;
                                    return (
                                      <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                                        🏆 {t1w > t2w ? t1?.name : t2?.name} wins ({t1w}–{t2w} sets)
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}

                          {entryError[f.id] && <div style={{ ...S.errorBox, fontSize: '0.82rem' }}>{entryError[f.id]}</div>}

                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              style={{ ...S.smallBtn, background: '#16a34a' }}
                              disabled={busy === f.id}
                              onClick={() => handleSubmitScores(f)}
                            >
                              {busy === f.id ? '⏳ Saving…' : `✅ Save ${entries.length} match${entries.length !== 1 ? 'es' : ''}`}
                            </button>
                            <button style={S.smallOutlineBtn} disabled={busy === f.id} onClick={() => handleRecompute(f.id)}>
                              🔄 Recompute
                            </button>
                          </div>
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

