import { useEffect, useMemo, useState } from 'react';
import { SPORT_SCORING, getDisplayName, getTeamFixtures, teamEnterFixtureScores, unitWinner, type League, type Player, type TeamLeagueFixture, type TeamLeagueTeam, type TeamMatchEntry, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

type SetScore = { t1: number; t2: number };

type MatchType = 'singles' | 'doubles';

interface Draft {
  type: MatchType;
  t1PlayerId: string;
  t2PlayerId: string;
  t1PlayerIds: [string, string];
  t2PlayerIds: [string, string];
  sets: Array<SetScore | null>;
}

function validPairs(sport: string) {
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const raw: Array<[number, number]> = [];
  const ptw = cfg.points_to_win, wb = cfg.win_by;
  const cap = cfg.max_points ?? ptw + 8;
  for (let l = 0; l <= ptw - wb; l++) { raw.push([ptw, l], [l, ptw]); }
  for (let w = ptw + 1; w <= cap; w++) {
    const l = w - wb; raw.push([w, l], [l, w]);
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

function emptyDraft(type: MatchType, t1Players: Player[], t2Players: Player[]): Draft {
  return {
    type,
    t1PlayerId: t1Players[0]?.id ?? '',
    t2PlayerId: t2Players[0]?.id ?? '',
    t1PlayerIds: [t1Players[0]?.id ?? '', t1Players[1]?.id ?? ''],
    t2PlayerIds: [t2Players[0]?.id ?? '', t2Players[1]?.id ?? ''],
    sets: [null],
  };
}

function playerSel(players: Player[], value: string, onChange: (v: string) => void, placeholder: string, exclude: string[] = []) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...S.select, fontSize: '0.85rem' }}>
      <option value="">{placeholder}</option>
      {players.filter(p => !exclude.includes(p.id) || p.id === value).map(p => (
        <option key={p.id} value={p.id}>{getDisplayName(p)}</option>
      ))}
    </select>
  );
}

function SetDropdowns({ sport, sets, t1Label, t2Label, onChange }: {
  sport: string;
  sets: Array<SetScore | null>;
  t1Label: string;
  t2Label: string;
  onChange: (s: Array<SetScore | null>) => void;
}) {
  const { wins, losses, cfg } = useMemo(() => validPairs(sport), [sport]);
  const completeSets = sets.filter((s): s is SetScore => s !== null);
  const t1Wins = completeSets.filter(s => unitWinner(s.t1, s.t2, sport) === 'me').length;
  const t2Wins = completeSets.filter(s => unitWinner(s.t2, s.t1, sport) === 'me').length;
  const matchWinner = t1Wins >= cfg.wins_needed ? t1Label : t2Wins >= cfg.wins_needed ? t2Label : null;

  const handleChange = (idx: number, val: string) => {
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
      if (mw < cfg.wins_needed && ow < cfg.wins_needed && next.length < cfg.max_units) onChange([...next, null]);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.4rem', alignItems: 'center' }}>
        <span />
        <span style={{ ...mutedText, fontSize: '0.78rem' }}>{t1Label} – {t2Label}</span>
      </div>
      {sets.map((score, i) => {
        const winner = score ? unitWinner(score.t1, score.t2, sport) : null;
        const isLocked = matchWinner !== null && i < sets.length - 1;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ ...mutedText, fontSize: '0.78rem', textAlign: 'right', paddingRight: '0.3rem' }}>{cfg.unit} {i + 1}</span>
            <select
              value={score ? `${score.t1}-${score.t2}` : ''}
              onChange={e => handleChange(i, e.target.value)}
              disabled={isLocked}
              style={{
                ...S.select,
                borderColor: score && winner === 'me' ? '#86efac' : score && winner === 'opp' ? '#fca5a5' : undefined,
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
      {(t1Wins > 0 || t2Wins > 0) && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.4rem 0.65rem', background: matchWinner ? '#f0fdf4' : '#fffbeb', borderRadius: '0.5rem', border: `1px solid ${matchWinner ? '#86efac' : '#fde68a'}` }}>
          <span style={{ fontWeight: 700, color: '#78350f' }}>{t1Wins} – {t2Wins}</span>
          <span style={{ ...mutedText, fontSize: '0.8rem' }}>{cfg.unit_plural} won</span>
          {matchWinner && <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#16a34a', fontSize: '0.88rem' }}>🏆 {matchWinner} wins</span>}
        </div>
      )}
    </div>
  );
}

type Props = {
  league: League;
  user: User;
  onClose: () => void;
  onSaved: () => void;
};

export default function TeamAddScoreModal({ league, user, onClose, onSaved }: Props) {
  const [fixtures, setFixtures] = useState<TeamLeagueFixture[]>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, TeamLeagueTeam>>({});
  const [playerMap, setPlayerMap] = useState<Record<string, Player>>({});
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('singles');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await getTeamFixtures(league.id);
        setFixtures(res.fixtures ?? []);
        setTeamsMap(res.teams ?? {});
        const pmap: Record<string, Player> = {};
        for (const p of league.players ?? []) pmap[p.id] = p;
        setPlayerMap(pmap);
      } finally {
        setLoadingFixtures(false);
      }
    })();
  }, [league.id, league.players]);

  const selectedFixture = fixtures.find(f => f.id === selectedFixtureId) ?? null;
  const t1 = selectedFixture ? teamsMap[selectedFixture.team1Id] : null;
  const t2 = selectedFixture ? teamsMap[selectedFixture.team2Id] : null;
  const t1Players = (t1?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
  const t2Players = (t2?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];

  const handleFixtureChange = (fixtureId: string) => {
    setSelectedFixtureId(fixtureId);
    setError(''); setSuccess('');
    if (!fixtureId) { setDraft(null); return; }
    const fix = fixtures.find(f => f.id === fixtureId);
    if (!fix) { setDraft(null); return; }
    const t1p = (teamsMap[fix.team1Id]?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
    const t2p = (teamsMap[fix.team2Id]?.playerIds ?? []).map(id => playerMap[id]).filter(Boolean) as Player[];
    setDraft(emptyDraft(matchType, t1p, t2p));
  };

  const handleTypeChange = (type: MatchType) => {
    setMatchType(type);
    setError(''); setSuccess('');
    if (!draft) return;
    setDraft(emptyDraft(type, t1Players, t2Players));
  };

  const handleSubmit = async () => {
    if (!selectedFixture || !draft) { setError('Select a fixture.'); return; }
    const completeSets = draft.sets.filter((s): s is SetScore => s !== null);
    if (completeSets.length === 0) { setError('Enter at least one set score.'); return; }
    if (draft.type === 'singles') {
      if (!draft.t1PlayerId || !draft.t2PlayerId) { setError('Select players for both teams.'); return; }
    } else {
      if (draft.t1PlayerIds.some(id => !id) || draft.t2PlayerIds.some(id => !id)) { setError('Select all four players for doubles.'); return; }
      if (new Set(draft.t1PlayerIds).size < 2 || new Set(draft.t2PlayerIds).size < 2) { setError('Pick 2 different players per team.'); return; }
    }
    setBusy(true); setError('');
    try {
      const entry: TeamMatchEntry = draft.type === 'singles'
        ? { type: 'singles', team1PlayerIds: [draft.t1PlayerId], team2PlayerIds: [draft.t2PlayerId], sets: completeSets }
        : { type: 'doubles', team1PlayerIds: draft.t1PlayerIds, team2PlayerIds: draft.t2PlayerIds, sets: completeSets };
      const res = await teamEnterFixtureScores(league.id, selectedFixture.id, user.phone, [entry]);
      if (!res.success) throw new Error(res.message ?? 'Could not save.');
      setSuccess('✅ Match recorded!');
      setDraft(emptyDraft(matchType, t1Players, t2Players));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving match.');
    }
    setBusy(false);
  };

  const t1PlayerLabel = draft?.type === 'singles' && draft.t1PlayerId && playerMap[draft.t1PlayerId]
    ? getDisplayName(playerMap[draft.t1PlayerId]) : (t1?.name ?? 'Team 1');
  const t2PlayerLabel = draft?.type === 'singles' && draft.t2PlayerId && playerMap[draft.t2PlayerId]
    ? getDisplayName(playerMap[draft.t2PlayerId]) : (t2?.name ?? 'Team 2');

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem', width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={subheading}>➕ Add Team Match Score</h3>
        <button onClick={onClose} style={S.linkBtn}>Close</button>
      </div>

      {loadingFixtures ? (
        <p style={mutedText}>Loading fixtures…</p>
      ) : (
        <>
          {/* Fixture picker */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Fixture (Team vs Team)</label>
            <select value={selectedFixtureId} onChange={e => handleFixtureChange(e.target.value)} style={S.select}>
              <option value="">Select a fixture…</option>
              {fixtures.slice().sort((a, b) => a.round - b.round).map(f => {
                const ta = teamsMap[f.team1Id]?.name ?? f.team1Id;
                const tb = teamsMap[f.team2Id]?.name ?? f.team2Id;
                const done = f.status === 'completed';
                return (
                  <option key={f.id} value={f.id}>
                    Round {f.round}: {ta} vs {tb}{done ? ' ✓' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Match type */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Match type</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['singles', 'doubles'] as MatchType[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleTypeChange(t)}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '0.5rem',
                    border: `2px solid ${matchType === t ? '#d97706' : '#e5e7eb'}`,
                    background: matchType === t ? '#fffbeb' : '#f9fafb',
                    color: matchType === t ? '#92400e' : '#6b7280',
                    fontWeight: matchType === t ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {t === 'singles' ? '🎾 Singles' : '🤝 Doubles'}
                </button>
              ))}
            </div>
          </div>

          {/* Player selection + score */}
          {draft && selectedFixture && (
            <div style={{ border: `2px solid ${matchType === 'singles' ? '#fde68a' : '#ddd6fe'}`, borderRadius: '0.65rem', padding: '0.85rem', background: matchType === 'singles' ? '#fffbeb' : '#f5f3ff', display: 'grid', gap: '0.75rem' }}>
              {/* Team headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ background: '#fff7ed', border: '2px solid #f59e0b', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', fontWeight: 700, color: '#78350f', fontSize: '0.85rem', textAlign: 'center' }}>{t1?.name ?? 'Team 1'}</div>
                <span style={{ color: '#9ca3af', fontWeight: 700 }}>vs</span>
                <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', fontWeight: 700, color: '#1e40af', fontSize: '0.85rem', textAlign: 'center' }}>{t2?.name ?? 'Team 2'}</div>
              </div>

              {/* Player selects */}
              {matchType === 'singles' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#78350f', fontWeight: 600, marginBottom: '0.2rem' }}>{t1?.name}</div>
                    {playerSel(t1Players, draft.t1PlayerId, v => setDraft(d => d ? { ...d, t1PlayerId: v } : d), 'Pick player')}
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: '0.78rem', fontWeight: 700 }}>vs</span>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600, marginBottom: '0.2rem' }}>{t2?.name}</div>
                    {playerSel(t2Players, draft.t2PlayerId, v => setDraft(d => d ? { ...d, t2PlayerId: v } : d), 'Pick player')}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#78350f', fontWeight: 600, marginBottom: '0.2rem' }}>{t1?.name}</div>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {playerSel(t1Players, draft.t1PlayerIds[0], v => setDraft(d => d ? { ...d, t1PlayerIds: [v, d.t1PlayerIds[1]] } : d), 'Player 1')}
                      <span style={{ color: '#9ca3af' }}>+</span>
                      {playerSel(t1Players, draft.t1PlayerIds[1], v => setDraft(d => d ? { ...d, t1PlayerIds: [d.t1PlayerIds[0], v] } : d), 'Player 2', [draft.t1PlayerIds[0]])}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 700 }}>vs</div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600, marginBottom: '0.2rem' }}>{t2?.name}</div>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {playerSel(t2Players, draft.t2PlayerIds[0], v => setDraft(d => d ? { ...d, t2PlayerIds: [v, d.t2PlayerIds[1]] } : d), 'Player 1')}
                      <span style={{ color: '#9ca3af' }}>+</span>
                      {playerSel(t2Players, draft.t2PlayerIds[1], v => setDraft(d => d ? { ...d, t2PlayerIds: [d.t2PlayerIds[0], v] } : d), 'Player 2', [draft.t2PlayerIds[0]])}
                    </div>
                  </div>
                </div>
              )}

              {/* Set score dropdowns */}
              <SetDropdowns
                sport={league.sport}
                sets={draft.sets}
                t1Label={t1PlayerLabel}
                t2Label={t2PlayerLabel}
                onChange={sets => setDraft(d => d ? { ...d, sets } : d)}
              />
            </div>
          )}

          {error && <div style={S.errorBox}>{error}</div>}
          {success && <div style={{ ...S.infoBox, color: '#166534', fontWeight: 600 }}>{success}</div>}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button style={S.smallBtn} disabled={busy || !draft || !selectedFixtureId} onClick={handleSubmit}>
              {busy ? '⏳ Saving…' : '✅ Submit match'}
            </button>
            <button style={S.smallOutlineBtn} onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
