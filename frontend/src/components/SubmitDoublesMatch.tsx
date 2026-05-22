import { useMemo, useState } from 'react';
import {
  SPORT_SCORING, getDisplayName, submitDoublesMatch, unitWinner,
  type DoublesPair, type League, type Match, type Player, type User,
} from '../api';
import { S, mutedText, subheading } from '../theme';

type SetScore = { me: number; opp: number };

type Props = {
  league: League;
  user: User;
  onSubmitted: (match: Match) => void;
  onCancel: () => void;
};

/** Returns all valid score pairs for one set/game of the given sport. */
function validPairs(sport: string): Array<{ me: number; opp: number; label: string }> {
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const raw: Array<[number, number]> = [];
  const ptw = cfg.points_to_win;
  const wb = cfg.win_by;
  const cap = cfg.max_points ?? ptw + 8;
  for (let l = 0; l <= ptw - wb; l++) {
    raw.push([ptw, l], [l, ptw]);
  }
  for (let w = ptw + 1; w <= cap; w++) {
    const l = w - wb;
    raw.push([w, l], [l, w]);
    if (cfg.max_points && w === cfg.max_points) {
      if (wb > 1) raw.push([w, w - 1], [w - 1, w]);
      break;
    }
  }
  const seen = new Set<string>();
  const wins: Array<{ me: number; opp: number; label: string }> = [];
  const losses: Array<{ me: number; opp: number; label: string }> = [];
  for (const [me, opp] of raw) {
    const key = `${me}-${opp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { me, opp, label: `${me} – ${opp}` };
    if (me > opp) wins.push(entry); else losses.push(entry);
  }
  return [...wins, ...losses];
}

function PlayerSelect({
  label, players, value, onChange, excludeIds,
}: {
  label: string;
  players: Player[];
  value: string;
  onChange: (id: string) => void;
  excludeIds: string[];
}) {
  const available = players.filter(p => !excludeIds.includes(p.id) || p.id === value);
  return (
    <div style={S.fieldGroup}>
      <label style={S.label}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={S.select}>
        <option value="">Select player…</option>
        {available.map(p => (
          <option key={p.id} value={p.id}>{getDisplayName(p)}</option>
        ))}
      </select>
    </div>
  );
}

export default function SubmitDoublesMatch({ league, user, onSubmitted, onCancel }: Props) {
  const sport = league.sport;
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const pairs = useMemo(() => validPairs(sport), [sport]);
  const doublesMode = league.rules?.doublesMode ?? 'adhoc';
  const leaguePairs: DoublesPair[] = league.doublesPairs ?? [];

  const [t1p1, setT1p1] = useState('');
  const [t1p2, setT1p2] = useState('');
  const [t2p1, setT2p1] = useState('');
  const [t2p2, setT2p2] = useState('');
  const [pair1Id, setPair1Id] = useState('');
  const [pair2Id, setPair2Id] = useState('');

  const [sets, setSets] = useState<Array<SetScore | null>>([null]);
  const [forceDone, setForceDone] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // When fixed_pairs mode: derive team player IDs from selected pairs
  const effectiveT1p1 = doublesMode === 'fixed_pairs'
    ? (leaguePairs.find(p => p.id === pair1Id)?.player1Id ?? '')
    : t1p1;
  const effectiveT1p2 = doublesMode === 'fixed_pairs'
    ? (leaguePairs.find(p => p.id === pair1Id)?.player2Id ?? '')
    : t1p2;
  const effectiveT2p1 = doublesMode === 'fixed_pairs'
    ? (leaguePairs.find(p => p.id === pair2Id)?.player1Id ?? '')
    : t2p1;
  const effectiveT2p2 = doublesMode === 'fixed_pairs'
    ? (leaguePairs.find(p => p.id === pair2Id)?.player2Id ?? '')
    : t2p2;

  const allFour = [effectiveT1p1, effectiveT1p2, effectiveT2p1, effectiveT2p2];
  const allFourSelected = allFour.every(Boolean) && new Set(allFour).size === 4;

  const completeSets = useMemo(() => sets.filter((s): s is SetScore => s !== null), [sets]);

  const { meWins, oppWins } = useMemo(() => {
    let meWins = 0, oppWins = 0;
    for (const score of completeSets) {
      const w = unitWinner(score.me, score.opp, sport);
      if (w === 'me') meWins++;
      else if (w === 'opp') oppWins++;
    }
    return { meWins, oppWins };
  }, [completeSets, sport]);

  const matchWinner: 'me' | 'opp' | null = useMemo(() => {
    if (meWins >= cfg.wins_needed) return 'me';
    if (oppWins >= cfg.wins_needed) return 'opp';
    if (forceDone && completeSets.length > 0) return meWins >= oppWins ? 'me' : 'opp';
    return null;
  }, [cfg.wins_needed, meWins, oppWins, forceDone, completeSets.length]);

  const handleSetChange = (idx: number, val: string) => {
    let next: Array<SetScore | null>;
    if (val === '') {
      next = sets.map((s, i) => i === idx ? null : s);
    } else {
      const [me, opp] = val.split('-').map(Number);
      next = sets.map((s, i) => i === idx ? { me, opp } : s);
    }
    setSets(next);
    const score = next[idx];
    if (score && unitWinner(score.me, score.opp, sport)) {
      let mw = 0, ow = 0;
      next.forEach(entry => {
        if (!entry) return;
        const w = unitWinner(entry.me, entry.opp, sport);
        if (w === 'me') mw++;
        else if (w === 'opp') ow++;
      });
      if (mw < cfg.wins_needed && ow < cfg.wins_needed && next.length < cfg.max_units) {
        setSets([...next, null]);
      }
    }
  };

  const pName = (id: string) => {
    const p = league.players.find(pl => pl.id === id);
    return p ? getDisplayName(p) : '?';
  };

  const team1Label = allFourSelected ? `${pName(effectiveT1p1)} / ${pName(effectiveT1p2)}` : 'Team 1';
  const team2Label = allFourSelected ? `${pName(effectiveT2p1)} / ${pName(effectiveT2p2)}` : 'Team 2';

  const handleSubmit = async () => {
    if (!allFourSelected) {
      setError('Please select all four players.');
      return;
    }
    if (!matchWinner) {
      setError('Complete the scores until a winner is determined.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const isAdmin = league.adminIds.includes(user.id);
      const userInMatch = allFour.includes(user.id);

      const res = await submitDoublesMatch({
        phone: user.phone,
        leagueId: league.id,
        team1PlayerIds: [effectiveT1p1, effectiveT1p2],
        team2PlayerIds: [effectiveT2p1, effectiveT2p2],
        score: { sets: completeSets, submitterWon: matchWinner === 'me', details: notes || undefined },
        ...(doublesMode === 'fixed_pairs' ? { pair1Id, pair2Id } : {}),
        ...(isAdmin && !userInMatch ? { submitterPlayerId: effectiveT1p1 } : {}),
      });
      if (!res.success || !res.match) throw new Error(res.message || 'Could not submit match.');
      onSubmitted(res.match);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit match.');
    }
    setLoading(false);
  };

  const selectedIds = allFour.filter(Boolean);

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem', width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={subheading}>Submit doubles match</h3>
        <button onClick={onCancel} style={S.linkBtn}>Close</button>
      </div>

      <div style={S.infoBox}>
        🏸 All four players will need to confirm this match result. Admin can approve on behalf of all.
      </div>

      {doublesMode === 'fixed_pairs' ? (
        <>
          <div style={S.fieldGroup}>
            <label style={S.label}>Team 1 (pair)</label>
            <select value={pair1Id} onChange={e => setPair1Id(e.target.value)} style={S.select}>
              <option value="">Select pair…</option>
              {leaguePairs.filter(p => p.id !== pair2Id).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Team 2 (pair)</label>
            <select value={pair2Id} onChange={e => setPair2Id(e.target.value)} style={S.select}>
              <option value="">Select pair…</option>
              {leaguePairs.filter(p => p.id !== pair1Id).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <div style={{ background: '#fef3c7', borderRadius: '0.65rem', padding: '0.65rem 0.9rem', fontSize: '0.85rem', color: '#78350f', fontWeight: 600 }}>
            Team 1
          </div>
          <PlayerSelect label="Team 1 — Player 1" players={league.players} value={t1p1} onChange={setT1p1} excludeIds={selectedIds.filter(id => id !== t1p1)} />
          <PlayerSelect label="Team 1 — Player 2" players={league.players} value={t1p2} onChange={setT1p2} excludeIds={selectedIds.filter(id => id !== t1p2)} />
          <div style={{ background: '#fde8c8', borderRadius: '0.65rem', padding: '0.65rem 0.9rem', fontSize: '0.85rem', color: '#78350f', fontWeight: 600 }}>
            Team 2
          </div>
          <PlayerSelect label="Team 2 — Player 1" players={league.players} value={t2p1} onChange={setT2p1} excludeIds={selectedIds.filter(id => id !== t2p1)} />
          <PlayerSelect label="Team 2 — Player 2" players={league.players} value={t2p2} onChange={setT2p2} excludeIds={selectedIds.filter(id => id !== t2p2)} />
        </>
      )}

      {allFourSelected && (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.5rem', alignItems: 'center' }}>
            <span />
            <span style={{ ...mutedText, fontSize: '0.8rem' }}>{team1Label} – {team2Label}</span>
          </div>

          {sets.map((score, i) => {
            const winner = score ? unitWinner(score.me, score.opp, sport) : null;
            const isLocked = matchWinner !== null && i < sets.length - 1;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ ...mutedText, fontSize: '0.8rem', textAlign: 'right', paddingRight: '0.4rem' }}>
                  {cfg.unit} {i + 1}
                </span>
                <select
                  value={score ? `${score.me}-${score.opp}` : ''}
                  onChange={e => handleSetChange(i, e.target.value)}
                  disabled={isLocked}
                  style={{
                    ...S.select,
                    borderColor: score && !winner ? '#fca5a5' : score && winner === 'me' ? '#86efac' : score && winner === 'opp' ? '#fca5a5' : undefined,
                    background: score && winner === 'me' ? '#f0fdf4' : score && winner === 'opp' ? '#fef2f2' : undefined,
                    fontWeight: score ? 600 : 400,
                  }}
                >
                  <option value="">— pick score —</option>
                  <optgroup label={`${team1Label} wins`}>
                    {pairs.filter(p => p.me > p.opp).map(p => (
                      <option key={`${p.me}-${p.opp}`} value={`${p.me}-${p.opp}`}>{p.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label={`${team2Label} wins`}>
                    {pairs.filter(p => p.opp > p.me).map(p => (
                      <option key={`${p.me}-${p.opp}`} value={`${p.me}-${p.opp}`}>{p.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            );
          })}

          {(meWins > 0 || oppWins > 0) && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: matchWinner ? '#f0fdf4' : '#fffbeb', borderRadius: '0.6rem', border: `1px solid ${matchWinner ? '#86efac' : '#fde68a'}`, marginTop: '0.2rem' }}>
              <span style={{ fontWeight: 700, color: '#78350f', fontSize: '1.1rem' }}>{meWins} – {oppWins}</span>
              <span style={{ ...mutedText, fontSize: '0.85rem' }}>{cfg.unit_plural} won</span>
              {matchWinner && (
                <span style={{ marginLeft: 'auto', fontWeight: 600, color: matchWinner === 'me' ? '#16a34a' : '#dc2626', fontSize: '0.9rem' }}>
                  🏆 {matchWinner === 'me' ? team1Label : team2Label} wins
                </span>
              )}
            </div>
          )}

          {completeSets.length > 0 && !matchWinner && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0.75rem', background: forceDone ? '#f0fdf4' : '#f9fafb', border: `1px solid ${forceDone ? '#86efac' : '#e5e7eb'}`, borderRadius: '0.6rem' }}>
              <input type="checkbox" checked={forceDone} onChange={e => setForceDone(e.target.checked)} style={{ width: '1rem', height: '1rem', accentColor: '#16a34a' }} />
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151' }}>Match finished here</span>
              <span style={{ ...mutedText, fontSize: '0.78rem' }}>— e.g. one-set format, retirement, or mutual agreement</span>
            </label>
          )}

          <p style={{ ...mutedText, fontSize: '0.78rem' }}>
            {sport === 'tennis'
              ? `Best of ${cfg.max_units} sets · win a set 6–0 to 6–4, 7–5, or 7–6`
              : `Best of ${cfg.max_units} ${cfg.unit_plural.toLowerCase()} · first to ${cfg.points_to_win} (win by ${cfg.win_by}${cfg.max_points ? `, max ${cfg.max_points}` : ''})`
            }
          </p>
        </div>
      )}

      <div style={S.fieldGroup}>
        <label style={S.label}>Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional details…" style={S.textarea} />
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={handleSubmit} style={S.smallBtn} disabled={loading || !matchWinner || !allFourSelected}>
          {loading ? 'Submitting…' : 'Submit doubles match'}
        </button>
        <button onClick={onCancel} style={S.smallOutlineBtn}>Cancel</button>
      </div>
    </div>
  );
}
