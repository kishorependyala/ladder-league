import { useEffect, useMemo, useState } from 'react';
import { SPORT_SCORING, getDisplayName, submitMatch, submitPlayoffMatch, unitWinner, type League, type Match, type Player, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

type SetScore = { me: number; opp: number };

type SubmitMatchProps = {
  league: League;
  user: User;
  prePlayer1?: Player;
  prePlayer2?: Player;
  playoffInfo?: {
    playoffGroup: string;
    playoffMatchupId: string;
  };
  onSubmitted: (match: Match) => void;
  onCancel: () => void;
};

/** Returns all valid score pairs for one set/game of the given sport, winner-first. */
function validPairs(sport: string): Array<{ me: number; opp: number; label: string }> {
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const raw: Array<[number, number]> = [];
  const ptw = cfg.points_to_win;
  const wb = cfg.win_by;
  // cap deuce extensions: use max_points if defined, else allow up to 8 deuce games (covers all realistic matches)
  const cap = cfg.max_points ?? ptw + 8;

  // normal wins: winner at exactly ptw, loser at 0 to ptw-win_by
  for (let l = 0; l <= ptw - wb; l++) {
    raw.push([ptw, l], [l, ptw]);
  }

  // deuce/extension wins
  for (let w = ptw + 1; w <= cap; w++) {
    const l = w - wb;
    raw.push([w, l], [l, w]);
    if (cfg.max_points && w === cfg.max_points) {
      // at max cap (e.g. badminton 30), also allow win-by-1
      if (wb > 1) raw.push([w, w - 1], [w - 1, w]);
      break;
    }
  }

  // deduplicate and sort: wins first, then losses
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

function SubmitMatch({ league, user, prePlayer1, prePlayer2, playoffInfo, onSubmitted, onCancel }: SubmitMatchProps) {
  const sport = league.sport;
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const pairs = useMemo(() => validPairs(sport), [sport]);
  const isCurrentUser = (player?: Player) => Boolean(player && (player.id === user.id || player.phone === user.phone));
  const behalfMode = Boolean(prePlayer1 && prePlayer2 && !isCurrentUser(prePlayer1) && !isCurrentUser(prePlayer2));

  const fixedOpponent = useMemo(() => {
    if (!prePlayer1 || !prePlayer2) return undefined;
    if (behalfMode) return prePlayer2;
    if (isCurrentUser(prePlayer1)) return prePlayer2;
    if (isCurrentUser(prePlayer2)) return prePlayer1;
    return undefined;
  }, [behalfMode, prePlayer1, prePlayer2, user.id, user.phone]);

  const opponents = useMemo(
    () => fixedOpponent ? [fixedOpponent] : league.players.filter(player => player.id !== user.id && player.phone !== user.phone),
    [fixedOpponent, league.players, user.id, user.phone],
  );

  const [opponentId, setOpponentId] = useState(fixedOpponent?.id || '');
  const [sets, setSets] = useState<Array<SetScore | null>>([null]);
  const [forceDone, setForceDone] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOpponentId(fixedOpponent?.id || '');
  }, [fixedOpponent]);

  const completeSets = useMemo(() => sets.filter((score): score is SetScore => score !== null), [sets]);

  const { meWins, oppWins } = useMemo(() => {
    let meWins = 0, oppWins = 0;
    for (const score of completeSets) {
      const winner = unitWinner(score.me, score.opp, sport);
      if (winner === 'me') meWins++;
      else if (winner === 'opp') oppWins++;
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
      next = sets.map((score, i) => i === idx ? null : score);
    } else {
      const [me, opp] = val.split('-').map(Number);
      next = sets.map((score, i) => i === idx ? { me, opp } : score);
    }
    setSets(next);

    const score = next[idx];
    if (score && unitWinner(score.me, score.opp, sport)) {
      let mw = 0, ow = 0;
      next.forEach(entry => {
        if (!entry) return;
        const winner = unitWinner(entry.me, entry.opp, sport);
        if (winner === 'me') mw++;
        else if (winner === 'opp') ow++;
      });
      if (mw < cfg.wins_needed && ow < cfg.wins_needed && next.length < cfg.max_units) {
        setSets([...next, null]);
      }
    }
  };

  const opponentPlayer = opponents.find(player => player.id === opponentId);
  const subjectLabel = behalfMode ? getDisplayName(prePlayer1) : 'You';
  const opponentLabel = opponentPlayer ? getDisplayName(opponentPlayer) : behalfMode ? getDisplayName(prePlayer2) : 'Opp';

  const handleSubmit = async () => {
    if (!(behalfMode ? prePlayer1 && prePlayer2 : opponentId)) {
      setError('Please choose an opponent.');
      return;
    }
    if (!matchWinner) {
      setError('Enter at least one set score, or mark the match as finished.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        sets: completeSets,
        submitterWon: matchWinner === 'me',
        details: notes || undefined,
      };
      const response = playoffInfo
        ? await submitPlayoffMatch({
            phone: user.phone,
            leagueId: league.id,
            opponentId: behalfMode && prePlayer2 ? prePlayer2.id : opponentId,
            score: payload,
            playoffGroup: playoffInfo.playoffGroup,
            playoffMatchupId: playoffInfo.playoffMatchupId,
            ...(behalfMode && prePlayer1 ? { submitterPlayerId: prePlayer1.id } : {}),
          })
        : behalfMode && prePlayer1 && prePlayer2
          ? await submitMatch(user.phone, league.id, prePlayer2.id, payload, prePlayer1.id)
          : await submitMatch(user.phone, league.id, opponentId, payload);
      if (!response.match) {
        const responseMessage = 'message' in response ? response.message : undefined;
        throw new Error(responseMessage || 'Could not submit match.');
      }
      onSubmitted(response.match);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit match.');
    }
    setLoading(false);
  };

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem', width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={subheading}>Submit match result</h3>
        <button onClick={onCancel} style={S.linkBtn}>Close</button>
      </div>

      {behalfMode && prePlayer1 && prePlayer2 && (
        <div style={S.infoBox}>
          Entering on behalf of {getDisplayName(prePlayer1)} vs {getDisplayName(prePlayer2)} — {playoffInfo ? 'the opponent will need to confirm.' : 'both players will need to confirm.'}
        </div>
      )}

      <div style={S.fieldGroup}>
        <label style={S.label}>{behalfMode ? 'Opponent player' : 'Opponent'}</label>
        <select value={opponentId} onChange={event => setOpponentId(event.target.value)} style={S.select} disabled={Boolean(fixedOpponent)}>
          <option value="">Select a player…</option>
          {opponents.map(player => <option key={player.id} value={player.id}>{getDisplayName(player)}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '0.5rem', alignItems: 'center' }}>
          <span />
          <span style={{ ...mutedText, fontSize: '0.8rem' }}>
            {subjectLabel} – {opponentLabel}
          </span>
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
                onChange={event => handleSetChange(i, event.target.value)}
                style={{
                  ...S.select,
                  borderColor: score && !winner ? '#fca5a5' : score && winner === 'me' ? '#86efac' : score && winner === 'opp' ? '#fca5a5' : undefined,
                  background: score && winner === 'me' ? '#f0fdf4' : score && winner === 'opp' ? '#fef2f2' : undefined,
                  fontWeight: score ? 600 : 400,
                }}
                disabled={isLocked}
              >
                <option value="">— pick score —</option>
                <optgroup label={`${subjectLabel} wins`}>
                  {pairs.filter(pair => pair.me > pair.opp).map(pair => (
                    <option key={`${pair.me}-${pair.opp}`} value={`${pair.me}-${pair.opp}`}>{pair.label}</option>
                  ))}
                </optgroup>
                <optgroup label={`${opponentLabel} wins`}>
                  {pairs.filter(pair => pair.opp > pair.me).map(pair => (
                    <option key={`${pair.me}-${pair.opp}`} value={`${pair.me}-${pair.opp}`}>{pair.label}</option>
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
                🏆 {matchWinner === 'me' ? subjectLabel : opponentLabel} wins
              </span>
            )}
          </div>
        )}

        {/* End match early option — shown when sets entered but no winner yet */}
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

      <div style={S.fieldGroup}>
        <label style={S.label}>Notes (optional)</label>
        <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Any additional details…" style={S.textarea} />
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={handleSubmit} style={S.smallBtn} disabled={loading || !matchWinner}>
          {loading ? 'Submitting…' : behalfMode ? 'Submit on behalf' : 'Submit match'}
        </button>
        <button onClick={onCancel} style={S.smallOutlineBtn}>Cancel</button>
      </div>
    </div>
  );
}

export default SubmitMatch;
