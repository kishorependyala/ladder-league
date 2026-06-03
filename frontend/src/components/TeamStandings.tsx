import { useCallback, useEffect, useMemo, useState } from 'react';
import { SPORT_SCORING, getDisplayName, getTeamFixtures, getTeamStandings, teamEnterFixtureScores, teamRecomputeFixture, teamRenameTeam, unitWinner, type League, type Match, type Player, type TeamIndividualRow, type TeamLeagueFixture, type TeamLeagueTeam, type TeamMatchEntry, type TeamStandingsRow, type User } from '../api';
import { S, mutedText, tableCell, tableHeadCell } from '../theme';
import PendingMatches from './PendingMatches';

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
  sets: Array<SetScore | null>;
  winsNeeded: number;
}

interface DoublesEntry {
  type: 'doubles';
  t1PlayerIds: [string, string];
  t2PlayerIds: [string, string];
  sets: Array<SetScore | null>;
  winsNeeded: number;
}

type MatchEntryDraft = SinglesEntry | DoublesEntry;

/** Returns valid score pairs for one set (winner-first), same logic as SubmitMatch. */
function validPairs(sport: string) {
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const raw: Array<[number, number]> = [];
  const ptw = cfg.points_to_win;
  const wb = cfg.win_by;
  const cap = cfg.max_points ?? ptw + 8;
  for (let l = 0; l <= ptw - wb; l++) { raw.push([ptw, l], [l, ptw]); }
  for (let w = ptw + 1; w <= cap; w++) {
    const l = w - wb;
    raw.push([w, l], [l, w]);
    if (cfg.max_points && w === cfg.max_points) { if (wb > 1) raw.push([w, w - 1], [w - 1, w]); break; }
  }
  const seen = new Set<string>();
  const wins: Array<{ t1: number; t2: number; label: string }> = [];
  const losses: Array<{ t1: number; t2: number; label: string }> = [];
  for (const [a, b] of raw) {
    const key = `${a}-${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { t1: a, t2: b, label: `${a} – ${b}` };
    if (a > b) wins.push(entry); else losses.push(entry);
  }
  return { wins, losses, cfg };
}

function makeDraftEntries(numSingles: number, numDoubles: number, winsNeeded: number): MatchEntryDraft[] {
  const s: MatchEntryDraft[] = Array.from({ length: numSingles }, () => ({ type: 'singles' as const, t1PlayerId: '', t2PlayerId: '', sets: [null], winsNeeded }));
  const d: MatchEntryDraft[] = Array.from({ length: numDoubles }, () => ({ type: 'doubles' as const, t1PlayerIds: ['', ''] as [string, string], t2PlayerIds: ['', ''] as [string, string], sets: [null], winsNeeded }));
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
    const completeSets = e.sets.filter(Boolean);
    if (completeSets.length === 0) return 'Enter at least one set score.';
  }
  return null;
}

/** Dropdown-based set score editor matching the Add Score feel. */
function SetDropdowns({ sport, sets, t1Label, t2Label, winsNeeded: winsNeededProp, onChange }: {
  sport: string;
  sets: Array<SetScore | null>;
  t1Label: string;
  t2Label: string;
  winsNeeded?: number;
  onChange: (sets: Array<SetScore | null>) => void;
}) {
  const { wins, losses, cfg } = useMemo(() => validPairs(sport), [sport]);
  const [forceDone, setForceDone] = useState(false);
  const winsNeeded = winsNeededProp ?? cfg.wins_needed;
  const completeSets = sets.filter((s): s is SetScore => s !== null);
  const t1Wins = completeSets.filter(s => unitWinner(s.t1, s.t2, sport) === 'me').length;
  const t2Wins = completeSets.filter(s => unitWinner(s.t2, s.t1, sport) === 'me').length;
  const naturalWinner = t1Wins >= winsNeeded ? t1Label : t2Wins >= winsNeeded ? t2Label : null;
  const forcedWinner = (forceDone && completeSets.length > 0 && !naturalWinner)
    ? (t1Wins >= t2Wins ? t1Label : t2Label) : null;
  const matchWinner = naturalWinner ?? forcedWinner;

  // Reset forceDone when natural winner is reached
  const prevNatural = useMemo(() => naturalWinner, [naturalWinner]);
  if (prevNatural && forceDone) setForceDone(false);

  const handleChange = (idx: number, val: string) => {
    setForceDone(false);
    let next: Array<SetScore | null>;
    if (val === '') {
      next = sets.map((s, i) => i === idx ? null : s);
    } else {
      const [a, b] = val.split('-').map(Number);
      next = sets.map((s, i) => i === idx ? { t1: a, t2: b } : s);
    }
    onChange(next);
    const score = next[idx];
    if (score && unitWinner(score.t1, score.t2, sport)) {
      let mw = 0, ow = 0;
      next.forEach(s => { if (!s) return; if (unitWinner(s.t1, s.t2, sport) === 'me') mw++; else if (unitWinner(s.t2, s.t1, sport) === 'me') ow++; });
      if (mw < winsNeeded && ow < winsNeeded && next.length < cfg.max_units) {
        onChange([...next, null]);
      }
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.4rem', alignItems: 'center' }}>
        <span />
        <span style={{ ...mutedText, fontSize: '0.75rem' }}>{t1Label} – {t2Label}</span>
      </div>
      {sets.map((score, i) => {
        const winner = score ? unitWinner(score.t1, score.t2, sport) : null;
        const isLocked = matchWinner !== null && i < sets.length - 1;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ ...mutedText, fontSize: '0.75rem', textAlign: 'right', paddingRight: '0.3rem' }}>{cfg.unit} {i + 1}</span>
            <select
              value={score ? `${score.t1}-${score.t2}` : ''}
              onChange={e => handleChange(i, e.target.value)}
              disabled={isLocked}
              style={{
                ...S.select,
                fontSize: '0.82rem',
                borderColor: score && !winner ? '#fca5a5' : score && winner === 'me' ? '#86efac' : score && winner === 'opp' ? '#fca5a5' : undefined,
                background: score && winner === 'me' ? '#f0fdf4' : score && winner === 'opp' ? '#fef2f2' : undefined,
                fontWeight: score ? 600 : 400,
              }}
            >
              <option value="">— pick score —</option>
              <optgroup label={`${t1Label} wins`}>
                {wins.map(p => <option key={`${p.t1}-${p.t2}`} value={`${p.t1}-${p.t2}`}>{p.label}</option>)}
              </optgroup>
              <optgroup label={`${t2Label} wins`}>
                {losses.map(p => <option key={`${p.t1}-${p.t2}`} value={`${p.t1}-${p.t2}`}>{p.label}</option>)}
              </optgroup>
            </select>
          </div>
        );
      })}
      {completeSets.length > 0 && !naturalWinner && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.4rem 0.65rem', background: forceDone ? '#f0fdf4' : '#f9fafb', border: `1px solid ${forceDone ? '#86efac' : '#e5e7eb'}`, borderRadius: '0.5rem', marginTop: '0.1rem' }}>
          <input type="checkbox" checked={forceDone} onChange={e => setForceDone(e.target.checked)} style={{ width: '1rem', height: '1rem', accentColor: '#16a34a' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>Match finished here</span>
          <span style={{ ...mutedText, fontSize: '0.75rem' }}>— e.g. 1-set format</span>
        </label>
      )}
      {(t1Wins > 0 || t2Wins > 0) && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.4rem 0.65rem', background: matchWinner ? '#f0fdf4' : '#fffbeb', borderRadius: '0.5rem', border: `1px solid ${matchWinner ? '#86efac' : '#fde68a'}`, marginTop: '0.15rem' }}>
          <span style={{ fontWeight: 700, color: '#78350f' }}>{t1Wins} – {t2Wins}</span>
          <span style={{ ...mutedText, fontSize: '0.8rem' }}>{cfg.unit_plural} won</span>
          {matchWinner && <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#16a34a', fontSize: '0.85rem' }}>🏆 {matchWinner} wins</span>}
        </div>
      )}
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
    const fixture = fixtures.find(f => f.id === fixtureId);
    const t1Players = fixture ? (teamsMap[fixture.team1Id]?.playerIds ?? []) : [];
    const t2Players = fixture ? (teamsMap[fixture.team2Id]?.playerIds ?? []) : [];
    const existingEntries = entryDraft[fixtureId] ?? [];
    const usedT1 = existingEntries.filter(e => e.type === 'singles').map(e => (e as SinglesEntry).t1PlayerId);
    const usedT2 = existingEntries.filter(e => e.type === 'singles').map(e => (e as SinglesEntry).t2PlayerId);
    const nextT1 = t1Players.find(id => !usedT1.includes(id)) ?? t1Players[0] ?? '';
    const nextT2 = t2Players.find(id => !usedT2.includes(id)) ?? t2Players[0] ?? '';
    const cfg = SPORT_SCORING[league.sport] ?? SPORT_SCORING['tennis'];
    const winsNeeded = cfg.wins_needed;
    const newEntry: MatchEntryDraft = type === 'singles'
      ? { type: 'singles', t1PlayerId: nextT1, t2PlayerId: nextT2, sets: [null], winsNeeded }
      : { type: 'doubles', t1PlayerIds: [t1Players[0] ?? '', t1Players[1] ?? ''], t2PlayerIds: [t2Players[0] ?? '', t2Players[1] ?? ''], sets: [null], winsNeeded };
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
        const completeSets = e.sets.filter((s): s is SetScore => s !== null);
        if (e.type === 'singles') return { type: 'singles', team1PlayerIds: [e.t1PlayerId], team2PlayerIds: [e.t2PlayerId], sets: completeSets };
        return { type: 'doubles', team1PlayerIds: e.t1PlayerIds, team2PlayerIds: e.t2PlayerIds, sets: completeSets };
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

      {/* ── Pending match approvals ── */}
      {view === 'fixtures' && (() => {
        const pendingMatches: Match[] = fixtures.flatMap(f => (f.matches ?? []).filter(m => m.status === 'pending'));
        const leagueLookup: Record<string, League> = { [league.id]: league };
        return (
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <PendingMatches
            matches={pendingMatches}
            user={user}
            leagueLookup={leagueLookup}
            leagueId={league.id}
            isAdmin={isAdmin}
            onActionComplete={loadAll}
          />

          {false && fixtures.filter(f => f.status !== 'completed').length === 0 && <p style={{ ...mutedText, fontStyle: 'italic' }}>No pending fixtures — all done! 🎉</p>}
        </div>
        );
      })()}

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

