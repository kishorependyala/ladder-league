import { useCallback, useEffect, useState } from 'react';
import { getDisplayName, getTeamFixtures, getTeamStandings, teamEnterFixtureScores, teamRecomputeFixture, teamRenameTeam, type League, type Player, type TeamIndividualRow, type TeamLeagueFixture, type TeamLeagueTeam, type TeamMatchEntry, type TeamStandingsRow, type User } from '../api';
import { S, mutedText, tableCell, tableHeadCell } from '../theme';

type Props = {
  league: League;
  user: User;
  isAdmin: boolean;
  view: 'teams' | 'fixtures' | 'individual';
};

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

export default function TeamStandings({ league, user, isAdmin, view }: Props) {
  const [teamStandings, setTeamStandings] = useState<TeamStandingsRow[]>([]);
  const [individualStandings, setIndividualStandings] = useState<TeamIndividualRow[]>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, TeamLeagueTeam>>({});
  const [fixtures, setFixtures] = useState<TeamLeagueFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // Team rename state
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const addEntry = (fixtureId: string, type: 'singles' | 'doubles') => {
    const newEntry: MatchEntryDraft = type === 'singles'
      ? { type: 'singles', t1PlayerId: '', t2PlayerId: '', sets: [emptySet()] }
      : { type: 'doubles', t1PlayerIds: ['', ''], t2PlayerIds: ['', ''], sets: [emptySet()] };
    setEntryDraft(prev => ({ ...prev, [fixtureId]: [...(prev[fixtureId] ?? []), newEntry] }));
    setEntryError(prev => ({ ...prev, [fixtureId]: '' }));
  };

  const removeEntry = (fixtureId: string, idx: number) => {
    setEntryDraft(prev => ({ ...prev, [fixtureId]: (prev[fixtureId] ?? []).filter((_, i) => i !== idx) }));
  };

  const updateEntry = (fixtureId: string, idx: number, patch: Partial<MatchEntryDraft>) => {
    setEntryDraft(prev => {
      const next = [...(prev[fixtureId] ?? [])];
      next[idx] = { ...next[idx], ...patch } as MatchEntryDraft;
      return { ...prev, [fixtureId]: next };
    });
    setEntryError(prev => ({ ...prev, [fixtureId]: '' }));
  };

  const cancelEntry = (fixtureId: string) => {
    setEntryDraft(prev => ({ ...prev, [fixtureId]: [] }));
    setEntryError(prev => ({ ...prev, [fixtureId]: '' }));
  };

  const handleSubmitScores = async (f: TeamLeagueFixture) => {
    const t1 = teamsMap[f.team1Id];
    const t2 = teamsMap[f.team2Id];
    const entries = entryDraft[f.id] ?? [];
    if (entries.length === 0) { setEntryError(prev => ({ ...prev, [f.id]: 'Add at least one singles or doubles match.' })); return; }
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
      setMsg(`✅ ${res.createdMatchIds?.length ?? 0} match${(res.createdMatchIds?.length ?? 0) !== 1 ? 'es' : ''} recorded.`);
      setEntryDraft(prev => ({ ...prev, [f.id]: [] }));
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

  const handleRenameTeam = async (teamId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(teamId);
    try {
      const res = await teamRenameTeam(league.id, user.phone, teamId, name);
      if (!res.success) throw new Error(res.message);
      setTeamsMap(prev => ({ ...prev, [teamId]: { ...prev[teamId], name } }));
      setTeamStandings(prev => prev.map(r => r.team.id === teamId ? { ...r, team: { ...r.team, name } } : r));
      setMsg('Team renamed ✓');
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Error renaming'); }
    setRenamingTeamId(null); setRenameValue('');
    setBusy(null);
  };

  const playerMap = Object.fromEntries(league.players.map(p => [p.id, p]));

  if (loading) return <p style={mutedText}>Loading team standings…</p>;
  if (error) return <div style={S.errorBox}>{error}</div>;

  const byRound: Record<number, TeamLeagueFixture[]> = {};
  fixtures.forEach(f => { (byRound[f.round] = byRound[f.round] || []).push(f); });

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {msg && <div style={S.infoBox}>{msg}</div>}

      {/* ── Team Standings ── */}
      {view === 'teams' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {isAdmin && <p style={{ ...mutedText, fontSize: '0.8rem' }}>✏️ Click a team name to rename it.</p>}
          {teamStandings.length === 0 ? (
            <p style={{ ...mutedText, fontStyle: 'italic' }}>No completed fixtures yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead><tr>
                {['#', 'Team', 'Players', 'W', 'D', 'L', 'MP±', 'Pts'].map(h => <th key={h} style={tableHeadCell}>{h}</th>)}
              </tr></thead>
              <tbody>
                {teamStandings.map(row => (
                  <tr key={row.team.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
                    <td style={{ ...tableCell, color: '#92400e', fontWeight: 700 }}>{row.rank}</td>
                    <td style={{ ...tableCell, fontWeight: 700 }}>
                      {isAdmin && renamingTeamId === row.team.id ? (
                        <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameTeam(row.team.id); if (e.key === 'Escape') { setRenamingTeamId(null); setRenameValue(''); } }}
                            style={{ ...S.inp, padding: '0.2rem 0.4rem', fontSize: '0.88rem', width: 120 }}
                          />
                          <button style={{ ...S.smallBtn, padding: '0.2rem 0.5rem', fontSize: '0.78rem' }} disabled={busy === row.team.id} onClick={() => handleRenameTeam(row.team.id)}>✓</button>
                          <button style={{ ...S.smallOutlineBtn, padding: '0.2rem 0.5rem', fontSize: '0.78rem' }} onClick={() => { setRenamingTeamId(null); setRenameValue(''); }}>✕</button>
                        </span>
                      ) : (
                        <span
                          onClick={() => isAdmin ? (setRenamingTeamId(row.team.id), setRenameValue(row.team.name)) : undefined}
                          style={{ cursor: isAdmin ? 'pointer' : 'default', borderBottom: isAdmin ? '1px dashed #d97706' : 'none' }}
                          title={isAdmin ? 'Click to rename' : undefined}
                        >
                          {row.team.name}
                        </span>
                      )}
                    </td>
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
            </div>
          )}
        </div>
      )}

      {/* ── Fixtures ── */}
      {view === 'fixtures' && (
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, color: '#92400e', fontWeight: 700 }}>🔄 Round Robin Fixtures</h4>
            <span style={{ ...mutedText, fontSize: '0.82rem' }}>{fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''} · {fixtures.filter(f => f.status === 'completed').length} completed</span>
          </div>

          {fixtures.length === 0 && <p style={{ ...mutedText, fontStyle: 'italic' }}>No fixtures generated yet.</p>}

          {fixtures.slice().sort((a, b) => a.round - b.round).map(f => {
            const t1 = teamsMap[f.team1Id];
            const t2 = teamsMap[f.team2Id];
            const t1Players = (t1?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
            const t2Players = (t2?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
            const isCompleted = f.status === 'completed';
            const entries = entryDraft[f.id] ?? [];
            const hasEntries = entries.length > 0;

            return (
              <div key={f.id} style={{ border: `2px solid ${isCompleted ? '#86efac' : '#fed7aa'}`, borderRadius: '0.85rem', padding: '0.9rem', background: isCompleted ? '#f0fdf4' : '#fffbeb' }}>
                {/* Fixture header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#78350f' }}>
                      {t1?.name ?? f.team1Id}
                      {isCompleted && <span style={{ color: '#d97706', margin: '0 0.35rem' }}>{f.team1Points}</span>}
                      <span style={{ color: '#9ca3af', margin: '0 0.25rem' }}>—</span>
                      {isCompleted && <span style={{ color: '#d97706', margin: '0 0.35rem' }}>{f.team2Points}</span>}
                      {t2?.name ?? f.team2Id}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#f3f4f6', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>Round {f.round}</span>
                      <span style={{ fontSize: '0.78rem', color: isCompleted ? '#16a34a' : '#f59e0b', fontWeight: 600 }}>
                        {isCompleted ? (f.winnerId ? `🏆 ${teamsMap[f.winnerId]?.name ?? f.winnerId} wins` : '🤝 Draw') : '⏳ Pending'}
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        style={{ ...S.smallOutlineBtn, fontSize: '0.78rem', borderColor: '#92400e', color: '#92400e' }}
                        onClick={() => addEntry(f.id, 'singles')}
                      >🎾 + Singles</button>
                      <button
                        style={{ ...S.smallOutlineBtn, fontSize: '0.78rem', borderColor: '#7c3aed', color: '#7c3aed' }}
                        onClick={() => addEntry(f.id, 'doubles')}
                      >🤝 + Doubles</button>
                      {isCompleted && (
                        <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} disabled={busy === f.id} onClick={() => handleRecompute(f.id)}>
                          🔄 Recompute
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Existing recorded matches */}
                {(f.matches ?? []).length > 0 && (
                  <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.2rem' }}>
                    {(f.matches ?? []).map(m => (
                      <div key={m.id} style={{ fontSize: '0.82rem', color: '#374151', padding: '0.25rem 0.55rem', background: '#fff', borderRadius: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: '0.72rem', background: m.matchType === 'doubles' ? '#ede9fe' : '#e0f2fe', color: m.matchType === 'doubles' ? '#7c3aed' : '#0369a1', fontWeight: 700, borderRadius: '0.3rem', padding: '0.1rem 0.35rem' }}>
                          {m.matchType === 'doubles' ? 'DBL' : 'SGL'}
                        </span>
                        {m.matchType === 'doubles'
                          ? <>{(m.team1PlayerIds ?? []).map((id: string) => playerMap[id] ? getDisplayName(playerMap[id]) : id).join(' + ')} <span style={{ color: '#d97706' }}>vs</span> {(m.team2PlayerIds ?? []).map((id: string) => playerMap[id] ? getDisplayName(playerMap[id]) : id).join(' + ')}</>
                          : <>{playerMap[m.submitterId ?? ''] ? getDisplayName(playerMap[m.submitterId ?? '']) : m.submitterId} <span style={{ color: '#d97706' }}>vs</span> {playerMap[m.opponentId ?? ''] ? getDisplayName(playerMap[m.opponentId ?? '']) : m.opponentId}</>
                        }
                        {m.score?.sets && m.score.sets.length > 0 && (
                          <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#374151' }}>
                            {m.score.sets.map((s: any) => `${s.me}\u2013${s.opp}`).join(', ')}
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: m.status === 'accepted' ? '#16a34a' : '#f59e0b', marginLeft: m.score ? 0 : 'auto' }}>({m.status})</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Score entry form — shown when entries have been added */}
                {isAdmin && hasEntries && (
                  <div style={{ marginTop: '0.8rem', border: '2px solid #fde68a', borderRadius: '0.65rem', padding: '0.85rem', background: '#fff', display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '0.5rem', padding: '0.3rem 0.6rem', fontWeight: 700, color: '#78350f', fontSize: '0.85rem', textAlign: 'center' }}>{t1?.name ?? 'Team 1'}</div>
                      <span style={{ color: '#9ca3af', fontWeight: 700, fontSize: '0.82rem' }}>vs</span>
                      <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '0.5rem', padding: '0.3rem 0.6rem', fontWeight: 700, color: '#1e40af', fontSize: '0.85rem', textAlign: 'center' }}>{t2?.name ?? 'Team 2'}</div>
                    </div>

                    {entries.map((e, idx) => {
                      const isSingles = e.type === 'singles';
                      const singlesNum = entries.slice(0, idx + 1).filter(x => x.type === 'singles').length;
                      const doublesNum = entries.slice(0, idx + 1).filter(x => x.type === 'doubles').length;
                      const label = isSingles ? `Singles ${singlesNum}` : `Doubles ${doublesNum}`;
                      const usedT1Singles = entries.filter((x, i) => i !== idx && x.type === 'singles').map(x => (x as SinglesEntry).t1PlayerId);
                      const usedT2Singles = entries.filter((x, i) => i !== idx && x.type === 'singles').map(x => (x as SinglesEntry).t2PlayerId);

                      return (
                        <div key={idx} style={{ border: `2px solid ${isSingles ? '#fde68a' : '#ddd6fe'}`, borderRadius: '0.5rem', padding: '0.6rem 0.75rem', background: isSingles ? '#fffbeb' : '#f5f3ff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isSingles ? '#92400e' : '#7c3aed' }}>{isSingles ? '\ud83c\udfbe' : '\ud83e\udd1d'} {label}</span>
                            <button onClick={() => removeEntry(f.id, idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', padding: '0 0.2rem' }} title="Remove">✕</button>
                          </div>

                          {isSingles ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.4rem', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: '0.68rem', color: '#78350f', fontWeight: 600, marginBottom: '0.15rem' }}>{t1?.name}</div>
                                {playerSel(t1Players, (e as SinglesEntry).t1PlayerId, v => updateEntry(f.id, idx, { t1PlayerId: v } as any), 'Pick player', usedT1Singles)}
                              </div>
                              <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700 }}>vs</span>
                              <div>
                                <div style={{ fontSize: '0.68rem', color: '#1e40af', fontWeight: 600, marginBottom: '0.15rem' }}>{t2?.name}</div>
                                {playerSel(t2Players, (e as SinglesEntry).t2PlayerId, v => updateEntry(f.id, idx, { t2PlayerId: v } as any), 'Pick player', usedT2Singles)}
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                              <div>
                                <div style={{ fontSize: '0.68rem', color: '#78350f', fontWeight: 600, marginBottom: '0.15rem' }}>{t1?.name}</div>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                  {playerSel(t1Players, (e as DoublesEntry).t1PlayerIds[0], v => updateEntry(f.id, idx, { t1PlayerIds: [v, (e as DoublesEntry).t1PlayerIds[1]] } as any), 'Player 1')}
                                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>+</span>
                                  {playerSel(t1Players, (e as DoublesEntry).t1PlayerIds[1], v => updateEntry(f.id, idx, { t1PlayerIds: [(e as DoublesEntry).t1PlayerIds[0], v] } as any), 'Player 2', [(e as DoublesEntry).t1PlayerIds[0]])}
                                </div>
                              </div>
                              <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700 }}>vs</div>
                              <div>
                                <div style={{ fontSize: '0.68rem', color: '#1e40af', fontWeight: 600, marginBottom: '0.15rem' }}>{t2?.name}</div>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                  {playerSel(t2Players, (e as DoublesEntry).t2PlayerIds[0], v => updateEntry(f.id, idx, { t2PlayerIds: [v, (e as DoublesEntry).t2PlayerIds[1]] } as any), 'Player 1')}
                                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>+</span>
                                  {playerSel(t2Players, (e as DoublesEntry).t2PlayerIds[1], v => updateEntry(f.id, idx, { t2PlayerIds: [(e as DoublesEntry).t2PlayerIds[0], v] } as any), 'Player 2', [(e as DoublesEntry).t2PlayerIds[0]])}
                                </div>
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: 32 }}>Sets:</span>
                            <SetsEditor sets={e.sets} onChange={sets => updateEntry(f.id, idx, { sets } as any)} />
                          </div>

                          {(() => {
                            const t1w = e.sets.filter(s => s.t1 > s.t2).length;
                            const t2w = e.sets.filter(s => s.t2 > s.t1).length;
                            if (t1w === 0 && t2w === 0) return null;
                            return (
                              <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600, marginTop: '0.3rem' }}>
                                {t1w > t2w ? (t1?.name ?? 'Team 1') : (t2?.name ?? 'Team 2')} wins ({t1w}\u2013{t2w} sets)
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}

                    {entryError[f.id] && <div style={{ ...S.errorBox, fontSize: '0.82rem' }}>{entryError[f.id]}</div>}

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button style={{ ...S.smallBtn, background: '#16a34a' }} disabled={busy === f.id} onClick={() => handleSubmitScores(f)}>
                        {busy === f.id ? '\u23f3 Saving\u2026' : `\u2705 Save ${entries.length} match${entries.length !== 1 ? 'es' : ''}`}
                      </button>
                      <button style={S.smallOutlineBtn} onClick={() => cancelEntry(f.id)}>✕ Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Individual Leaderboard ── */}
      {view === 'individual' && (
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

